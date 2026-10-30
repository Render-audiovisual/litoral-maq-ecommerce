import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyStoreMaintenance, MAINTENANCE_HTML, MAINTENANCE_REWRITES } from "../../scripts/store-maintenance.mjs";

describe("temporary store closure", () => {
  it("replaces home and deep HTML routes with a script-free notice", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "litoral-maintenance-test-"));
    try {
      await mkdir(path.join(dir, "checkout"));
      await writeFile(path.join(dir, "index.html"), "old store");
      await writeFile(path.join(dir, "checkout", "index.html"), "old checkout");
      await applyStoreMaintenance(dir);
      for (const file of ["index.html", "checkout/index.html", "maintenance.html"]) {
        expect(await readFile(path.join(dir, file), "utf8")).toBe(MAINTENANCE_HTML);
      }
      expect(MAINTENANCE_HTML).toContain("Las compras online están pausadas");
      expect(MAINTENANCE_HTML).not.toContain("<script");
      expect(MAINTENANCE_HTML).not.toContain("<form");
      expect(MAINTENANCE_HTML).toContain('name="viewport"');
      expect(MAINTENANCE_REWRITES).toContain("[R=503,L]");
      expect(MAINTENANCE_REWRITES).toContain("no-store");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
