import { verifyMercadoPagoSignature } from "./mercadopago.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

async function signature(secret: string, manifest: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  return [...new Uint8Array(bytes)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

Deno.test("valida el manifiesto HMAC de Mercado Pago", async () => {
  const secret = "webhook-secret-for-test";
  const dataId = "123456";
  const requestId = "request-abc";
  const timestamp = "1742505638683";
  const digest = await signature(
    secret,
    `id:${dataId};request-id:${requestId};ts:${timestamp};`,
  );
  assert(
    await verifyMercadoPagoSignature({
      xSignature: `ts=${timestamp},v1=${digest}`,
      xRequestId: requestId,
      dataId,
      secret,
    }),
    "la firma válida fue rechazada",
  );
});

Deno.test("rechaza una firma modificada", async () => {
  assert(
    !(await verifyMercadoPagoSignature({
      xSignature: `ts=1742505638683,v1=${"0".repeat(64)}`,
      xRequestId: "request-abc",
      dataId: "123456",
      secret: "webhook-secret-for-test",
    })),
    "la firma inválida fue aceptada",
  );
});
