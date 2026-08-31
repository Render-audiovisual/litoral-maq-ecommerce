import { afterEach, describe, expect, it, vi } from "vitest";
import { googleSheetSyncAdapter } from "./sheet-sync";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("cliente de sincronización del catálogo", () => {
  it("llama solo a la Edge Function propia con la sesión administrativa", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_long_enough";
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      total: 508,
      created: 2,
      updated: 4,
      unchanged: 502,
      removed: 1,
      source: "Google Sheet · Lista de precios - LitoralMaq",
      lastSyncedAt: "2026-08-31T14:00:00.000Z",
      warnings: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await googleSheetSyncAdapter.sync("admin-access-token");

    expect(result.total).toBe(508);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example-project.supabase.co/functions/v1/admin-sync-products");
    expect(url).not.toContain("docs.google.com");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer admin-access-token",
        apikey: "sb_publishable_test_key_long_enough",
      },
    });
  });

  it("muestra el error seguro del servidor y no intenta escribir desde el cliente", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_long_enough";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "El Sheet devolvió solo 4 productos. El catálogo actual no fue modificado.",
    }), { status: 422, headers: { "content-type": "application/json" } })));

    await expect(googleSheetSyncAdapter.sync("admin-access-token")).rejects.toThrow(
      /catálogo actual no fue modificado/i,
    );
  });
});
