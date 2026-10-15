import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_DETAIL_KEYS } from "@/lib/saved-checkout-details";
const { invoke }=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock("./persistence/supabase/client",()=>({
  readSupabaseConfig:()=>({status:"ok",config:{}}),
  getTypedSupabaseClient:()=>({functions:{invoke}}),
}));
import { readCheckoutDetails, saveCheckoutDetails } from "./checkout-details";
const details=Object.fromEntries(CHECKOUT_DETAIL_KEYS.map(key=>[key,""])) as Awaited<ReturnType<typeof readCheckoutDetails>> & object;
describe("checkout details service",()=>{
  beforeEach(()=>invoke.mockReset());
  it("reads the authenticated account without a caller-selected owner",async()=>{
    invoke.mockResolvedValue({data:{details},error:null});
    expect(await readCheckoutDetails()).toEqual(details);
    expect(invoke).toHaveBeenCalledWith("checkout-details",{body:{operation:"read"}});
  });
  it("requires explicit consent and the expected session when saving",async()=>{
    invoke.mockResolvedValue({data:{saved:true},error:null});
    await saveCheckoutDetails(details,"account-a");
    expect(invoke).toHaveBeenCalledWith("checkout-details",{body:{operation:"save",consent:true,accountId:"account-a",details}});
  });
  it("never claims success after a server failure",async()=>{
    invoke.mockResolvedValue({data:null,error:new Error("offline")});
    await expect(saveCheckoutDetails(details,"account-a")).rejects.toThrow("Podés completar la compra");
  });
});
