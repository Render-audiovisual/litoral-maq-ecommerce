// Estado de las alertas y aviso por correo al equipo.
//
// decideAlertActions es puro: con los hallazgos de este tick y las alertas
// guardadas decide qué escribir, qué avisar y qué dar por resuelto.
// runAlerting hace la parte de IO (system_alerts + Resend). Si el correo
// falla, last_notified_at no se toca y el próximo tick lo reintenta.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import { type Finding, type Severity, WHAT_TO_CHECK } from "./health-checks.ts";
import { logEdgeError } from "./monitoring.ts";
import { sha256 } from "./http.ts";

const HOUR = 3_600_000;
export const REMINDER_MS: Record<Severity, number> = {
  critical: 6 * HOUR,
  high: 6 * HOUR,
  medium: 24 * HOUR,
};
export const ADMIN_STATUS_URL =
  "https://admin.litoralmaq.com/admin/configuracion";

export type StoredAlert = {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  first_seen_at: string;
  last_seen_at: string;
  last_notified_at: string | null;
  resolved_at: string | null;
  notified_resolved_at: string | null;
  occurrences: number;
};

export type AlertActions = {
  upserts: StoredAlert[];
  toNotify: StoredAlert[];
  toResolve: StoredAlert[];
};

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

export function decideAlertActions(
  findings: Finding[],
  stored: StoredAlert[],
  now: Date,
  unchecked: string[] = [],
): AlertActions {
  const at = now.toISOString();
  const byKey = new Map(stored.map((alert) => [alert.key, alert]));
  const upserts: StoredAlert[] = [];
  const toNotify: StoredAlert[] = [];
  const toResolve: StoredAlert[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    if (seen.has(finding.key)) continue; // un hallazgo por clave
    seen.add(finding.key);
    const previous = byKey.get(finding.key);
    if (previous && !previous.resolved_at) {
      const row: StoredAlert = {
        ...previous,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        last_seen_at: at,
        occurrences: previous.occurrences + 1,
      };
      upserts.push(row);
      const lastNotified = time(previous.last_notified_at);
      if (
        Number.isNaN(lastNotified) ||
        now.getTime() - lastNotified >= REMINDER_MS[finding.severity]
      ) toNotify.push(row);
      continue;
    }
    // Nueva (o reaparece después de resuelta): incidente nuevo.
    const row: StoredAlert = {
      ...finding,
      first_seen_at: at,
      last_seen_at: at,
      last_notified_at: null,
      resolved_at: null,
      notified_resolved_at: null,
      occurrences: 1,
    };
    upserts.push(row);
    toNotify.push(row);
  }

  for (const alert of stored) {
    if (seen.has(alert.key) || unchecked.includes(alert.key)) continue;
    if (!alert.resolved_at) {
      // Nunca se avisó (p. ej. el correo falló siempre): se cierra en silencio.
      const silent = !alert.last_notified_at;
      const row: StoredAlert = {
        ...alert,
        resolved_at: at,
        notified_resolved_at: silent ? at : null,
      };
      upserts.push(row);
      if (!silent) toResolve.push(row);
    } else if (!alert.notified_resolved_at) {
      toResolve.push(alert); // el aviso de "resuelta" falló antes: reintento
    }
  }
  return { upserts, toNotify, toResolve };
}

// ---------------------------------------------------------------------------
// Correo
// ---------------------------------------------------------------------------

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      char
    ]!
  );
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildAlertEmail(
  kind: "alert" | "resolved",
  alerts: StoredAlert[],
  adminUrl = ADMIN_STATUS_URL,
) {
  const several = alerts.length > 1;
  const subjectTitle = several ? `${alerts.length} alertas` : alerts[0].title;
  const subject = kind === "resolved"
    ? `[Litoral Maq] Resuelto: ${subjectTitle}`
    : alerts.some((alert) => alert.severity === "critical")
    ? `[Litoral Maq] Alerta crítica: ${subjectTitle}`
    : `[Litoral Maq] Alerta: ${subjectTitle}`;
  const intro = kind === "resolved"
    ? several
      ? "Estas alertas ya no se detectan:"
      : "Esta alerta ya no se detecta:"
    : several
    ? "El sistema de la tienda detectó estos problemas:"
    : "El sistema de la tienda detectó este problema:";

  const lines = alerts.map((alert) => {
    const since = kind === "resolved"
      ? `Resuelta el ${formatWhen(alert.resolved_at ?? alert.last_seen_at)} (empezó el ${formatWhen(alert.first_seen_at)}).`
      : `Desde el ${formatWhen(alert.first_seen_at)}. Prioridad: ${SEVERITY_LABEL[alert.severity]}.`;
    return {
      title: alert.title,
      detail: alert.detail,
      since,
      check: kind === "alert" ? WHAT_TO_CHECK[alert.key] ?? "" : "",
    };
  });

  const text = [
    intro,
    "",
    ...lines.flatMap((line) => [
      `• ${line.title}`,
      line.since,
      ...(line.detail ? [line.detail] : []),
      ...(line.check ? [`Qué revisar: ${line.check}`] : []),
      "",
    ]),
    `Estado del sistema: ${adminUrl}`,
  ].join("\n");

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d2a35">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
<p style="margin:0 0 16px;font-size:15px">${escapeHtml(intro)}</p>
${
    lines.map((line) =>
      `<div style="border-top:1px solid #e3e8ec;padding:14px 0">
<p style="margin:0 0 4px;font-size:15px;font-weight:bold">${escapeHtml(line.title)}</p>
<p style="margin:0 0 4px;font-size:13px;color:#566472">${escapeHtml(line.since)}</p>
${line.detail ? `<p style="margin:0 0 4px;font-size:14px">${escapeHtml(line.detail)}</p>` : ""}
${line.check ? `<p style="margin:0;font-size:14px"><strong>Qué revisar:</strong> ${escapeHtml(line.check)}</p>` : ""}
</div>`
    ).join("\n")
  }
<p style="margin:16px 0 0;font-size:14px"><a href="${escapeHtml(adminUrl)}" style="color:#0b4f6c">Ver el estado del sistema en el panel</a></p>
</div></body></html>`;
  return { subject, html, text };
}

export function alertRecipients(env: (name: string) => string | undefined) {
  const parse = (value: string | undefined) =>
    (value || "").split(",").map((item) => item.trim())
      .filter((item) => /^\S+@\S+\.\S+$/.test(item));
  const alerts = parse(env("LITORAL_ALERTS_EMAIL"));
  return alerts.length ? alerts : parse(env("LITORAL_ORDERS_EMAIL"));
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

export type AlertStore = {
  loadOpen(): Promise<StoredAlert[]>;
  save(rows: StoredAlert[]): Promise<void>;
  mark(
    keys: string[],
    field: "last_notified_at" | "notified_resolved_at",
    at: string,
  ): Promise<void>;
};

export function supabaseAlertStore(db: SupabaseClient): AlertStore {
  return {
    async loadOpen() {
      const { data, error } = await db.from("system_alerts").select("*")
        .or("resolved_at.is.null,notified_resolved_at.is.null").limit(100);
      if (error) throw error;
      return (data ?? []) as StoredAlert[];
    },
    async save(rows) {
      if (!rows.length) return;
      const { error } = await db.from("system_alerts").upsert(rows, {
        onConflict: "key",
      });
      if (error) throw error;
    },
    async mark(keys, field, at) {
      const { error } = await db.from("system_alerts").update({ [field]: at })
        .in("key", keys);
      if (error) throw error;
    },
  };
}

export type AlertingDeps = {
  now?: Date;
  env?: (name: string) => string | undefined;
  fetch?: typeof fetch;
};

export type AlertingResult = {
  active: number;
  notified: number;
  resolved: number;
  emailErrors: number;
};

export async function runAlerting(
  store: AlertStore,
  findings: Finding[],
  unchecked: string[] = [],
  deps: AlertingDeps = {},
): Promise<AlertingResult> {
  const now = deps.now ?? new Date();
  const env = deps.env ?? ((name: string) => Deno.env.get(name));
  const doFetch = deps.fetch ?? fetch;
  const stored = await store.loadOpen();
  const actions = decideAlertActions(findings, stored, now, unchecked);
  await store.save(actions.upserts);

  const apiKey = env("RESEND_API_KEY") || "";
  const from = (env("RESEND_FROM_EMAIL") || "").trim();
  const to = alertRecipients(env);
  const result: AlertingResult = {
    active: findings.length,
    notified: 0,
    resolved: 0,
    emailErrors: 0,
  };
  const batches: [
    "alert" | "resolved",
    StoredAlert[],
    "last_notified_at" | "notified_resolved_at",
  ][] = [
    ["alert", actions.toNotify, "last_notified_at"],
    ["resolved", actions.toResolve, "notified_resolved_at"],
  ];
  for (const [kind, alerts, field] of batches) {
    if (!alerts.length) continue;
    if (!apiKey || !from || !to.length) {
      result.emailErrors += 1;
      logEdgeError(
        "alerting",
        "Falta RESEND_API_KEY, RESEND_FROM_EMAIL o un destinatario (LITORAL_ALERTS_EMAIL / LITORAL_ORDERS_EMAIL).",
        { kind, keys: alerts.map((alert) => alert.key) },
      );
      continue;
    }
    const email = buildAlertEmail(kind, alerts, env("ADMIN_PUBLIC_URL")
      ? `${env("ADMIN_PUBLIC_URL")!.replace(/\/$/, "")}/admin/configuracion`
      : ADMIN_STATUS_URL);
    // Mismo lote pendiente = misma clave: si Resend ya lo mandó pero no se
    // pudo guardar last_notified_at, el reintento no duplica el correo.
    const idempotencyKey = `alerts-${kind}-${await sha256(
      alerts.map((alert) =>
        `${alert.key}@${alert.last_notified_at ?? alert.first_seen_at}`
      ).sort().join("|"),
    )}`;
    try {
      const response = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || !payload.id) {
        throw new Error(payload.message || `Resend respondió ${response.status}.`);
      }
      await store.mark(alerts.map((alert) => alert.key), field, now.toISOString());
      if (kind === "alert") result.notified += alerts.length;
      else result.resolved += alerts.length;
    } catch (error) {
      result.emailErrors += 1;
      logEdgeError("alerting", error, {
        kind,
        keys: alerts.map((alert) => alert.key),
      });
    }
  }
  return result;
}
