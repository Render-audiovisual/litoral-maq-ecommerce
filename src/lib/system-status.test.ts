import { describe, expect, it } from "vitest";
import { formatAgo, sortAlerts, syncProblem, syncSummary, tickDot, type SystemAlert } from "./system-status";

const now = new Date("2026-09-25T15:00:00.000Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe("formatAgo", () => {
  it("escala minutos, horas y días", () => {
    expect(formatAgo(minutesAgo(0.5), now)).toBe("Hace instantes");
    expect(formatAgo(minutesAgo(3), now)).toBe("Hace 3 min");
    expect(formatAgo(minutesAgo(125), now)).toBe("Hace 2 h");
    expect(formatAgo(minutesAgo(72 * 60), now)).toBe("Hace 3 días");
    expect(formatAgo(null, now)).toBe("Sin registro");
  });
});

describe("tickDot", () => {
  it("verde < 15 min, naranja < 60 min, rojo si no", () => {
    expect(tickDot(minutesAgo(14), now)).toBe("green");
    expect(tickDot(minutesAgo(15), now)).toBe("orange");
    expect(tickDot(minutesAgo(59), now)).toBe("orange");
    expect(tickDot(minutesAgo(60), now)).toBe("red");
    expect(tickDot(null, now)).toBe("red");
  });
});

describe("sortAlerts y syncSummary", () => {
  it("ordena por prioridad y después por antigüedad", () => {
    const alert = (key: string, severity: SystemAlert["severity"], firstSeenAt: string): SystemAlert =>
      ({ key, severity, title: key, detail: "", firstSeenAt });
    const sorted = sortAlerts([
      alert("m", "medium", minutesAgo(90)),
      alert("h2", "high", minutesAgo(10)),
      alert("c", "critical", minutesAgo(5)),
      alert("h1", "high", minutesAgo(20)),
    ]);
    expect(sorted.map((item) => item.key)).toEqual(["c", "h1", "h2", "m"]);
  });

  it("resume la corrida exitosa o muestra el error", () => {
    const base = { startedAt: minutesAgo(5), total: 587, created: 2, updated: 10, retired: 1, errorDetail: null };
    expect(syncSummary({ ...base, status: "succeeded" })).toBe("587 productos: 2 nuevos, 10 actualizados, 1 retirados.");
    expect(syncSummary({ ...base, status: "failed", errorDetail: "Sheet incompleto" })).toBe("Sheet incompleto");
  });
});

describe("syncProblem", () => {
  const now = new Date("2026-10-20T18:00:00Z");
  const run = (status: "succeeded" | "failed", startedAt: string) => ({
    status, startedAt, total: 590, created: 0, updated: 0, retired: 0, errorDetail: status === "failed" ? "Google Sheets respondió 400." : null,
  });

  it("no avisa si la última corrida salió bien y es reciente", () => {
    expect(syncProblem(run("succeeded", "2026-10-20T16:00:00Z"), now)).toBeNull();
    expect(syncProblem(null, now)).toBeNull();
  });

  it("avisa con el motivo si la última corrida falló", () => {
    expect(syncProblem(run("failed", "2026-10-20T17:00:00Z"), now)).toMatch(/falló.*400/);
  });

  it("avisa si pasaron 6 horas o más sin sincronizar", () => {
    expect(syncProblem(run("succeeded", "2026-10-20T11:00:00Z"), now)).toMatch(/no se sincroniza/);
  });
});
