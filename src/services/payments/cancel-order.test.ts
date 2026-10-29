import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/services/persistence/supabase/client", () => ({
  readSupabaseConfig: () => ({ status: "ok", config: { url: "https://x.supabase.co", publishableKey: "k" } }),
  getTypedSupabaseClient: () => ({ rpc }),
}));

import { cancelOwnPendingOrder } from "./index";

describe("cancelOwnPendingOrder", () => {
  beforeEach(() => rpc.mockReset());

  it("llama a la función de la base con el id del pedido", async () => {
    rpc.mockResolvedValue({ error: null });
    await cancelOwnPendingOrder("LM-123");
    expect(rpc).toHaveBeenCalledWith("cancel_own_pending_order", { p_order_id: "LM-123" });
  });

  it("devuelve el mensaje de la base cuando el pedido ya no se puede cancelar", async () => {
    rpc.mockResolvedValue({ error: { message: "Este pedido ya no se puede cancelar desde acá." } });
    await expect(cancelOwnPendingOrder("LM-123")).rejects.toThrow(/ya no se puede cancelar/);
  });
});
