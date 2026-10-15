import { describe, it, expect } from "vitest";
import { checkoutDefaults } from "./checkout-defaults";
import type {Order,Session} from "./types";
describe("checkoutDefaults",()=>{
 it("uses the most recent own order, regardless of list order",()=>{
  const session={user:{id:"a",name:"Cuenta Cliente",email:"a@example.com"}} as Session;
  const orders=[{customerId:"a",createdAt:"2026-01-01",phone:"old"},{customerId:"b",createdAt:"2026-12-01",phone:"private"},{customerId:"a",createdAt:"2026-02-01",phone:"new",customerName:"Nombre Comprador",street:"Calle"}] as Order[];
  expect(checkoutDefaults(session,orders)).toMatchObject({phone:"new",firstName:"Nombre",lastName:"Comprador",street:"Calle"});
 });
 it("never prefills guest fields from another customer's order",()=>{
  expect(checkoutDefaults(null,[{customerId:"a",phone:"private",dni:"12345678"} as Order])).toMatchObject({phone:"",dni:"",email:""});
 });
});
