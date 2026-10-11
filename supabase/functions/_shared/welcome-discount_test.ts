import {welcomeDiscount} from "../../../src/lib/welcome-discount.ts";
Deno.test("provider items and discount use the same integer-cent arithmetic",()=>{
  const lines=[{unitPrice:88999.89,quantity:3},{unitPrice:125000.01,quantity:2}];
  const discounted=welcomeDiscount(lines);
  const itemCents=discounted.items.reduce((sum,line)=>sum+Math.round(line.unitPrice*100)*line.quantity,0);
  if(itemCents!==Math.round(discounted.subtotal*100)) throw new Error("Provider mismatch");
  if(Math.round((discounted.subtotal+discounted.amount)*100)!==lines.reduce((sum,line)=>sum+Math.round(line.unitPrice*100)*line.quantity,0)) throw new Error("Subtotal mismatch");
});
