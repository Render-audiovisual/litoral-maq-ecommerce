type MonitorLevel = "info" | "warn" | "error";

function clean(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export function monitor(level: MonitorLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload = JSON.stringify(clean({
    timestamp: new Date().toISOString(),
    level,
    event,
    deployment_id: Deno.env.get("DENO_DEPLOYMENT_ID") || undefined,
    ...fields,
  }));
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}
