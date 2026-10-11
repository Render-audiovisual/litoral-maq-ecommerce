import {describe,expect,it} from "vitest";
import {checkoutDefaults,mergeCheckoutDefaults} from "./checkout-defaults";
import type {Order,Session} from "./types";
const session={user:{id:"customer",name:"Ana María Pérez",email:"ana@example.com"}} as Session;
describe("checkout autofill",()=>{
  it("hydrates late data but preserves edited or intentionally cleared fields",()=>{
    const edits={firstName:"Anita",street:""};
    const late={...checkoutDefaults(session,[]),street:"Sáenz",streetNumber:"1587"};
    expect(mergeCheckoutDefaults(late,edits)).toMatchObject({firstName:"Anita",lastName:"María Pérez",email:"ana@example.com",street:"",streetNumber:"1587"});
  });
  it("takes the newest own order, never another customer's address",()=>{
    const orders=[{customerId:"customer",createdAt:"2026-01-01",street:"Vieja"},{customerId:"other",createdAt:"2026-12-01",street:"Privada"},{customerId:"customer",createdAt:"2026-02-01",street:"Nueva"}] as Order[];
    expect(checkoutDefaults(session,orders).street).toBe("Nueva");
    expect(checkoutDefaults(null,orders).street).toBe("");
  });
});
