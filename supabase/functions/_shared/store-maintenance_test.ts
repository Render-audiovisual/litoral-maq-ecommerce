import { storeMaintenanceResponse } from "./store-maintenance.ts";

Deno.test("maintenance rejects payment creation without credentials or external calls", async () => {
  const getEnv = Deno.env.get;
  Deno.env.get = () => undefined;
  try {
  const response = storeMaintenanceResponse(new Request("https://example.test/payment-create", {
    method: "POST",
    headers: { origin: "https://litoralmaq.com" },
  }));
  if (response?.status !== 503) throw new Error("Payments must be blocked");
  const body = await response.json();
  if (body.code !== "STORE_MAINTENANCE") throw new Error("Missing closure reason");
  if (response.headers.get("cache-control") !== "no-store") throw new Error("Must not cache");
  } finally {
    Deno.env.get = getEnv;
  }
});
