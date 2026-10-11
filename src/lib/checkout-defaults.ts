import type {Order,Session} from "./types";
export function checkoutDefaults(session:Session|null,orders:Order[]) {
  const parts = (session?.user.name || "").trim().split(/\s+/).filter(Boolean);
  const latest = session ? orders.filter(o=>o.customerId===session.user.id).reduce<Order|undefined>((current,order)=>!current || order.createdAt>current.createdAt ? order : current,undefined) : undefined;
  return {
    firstName:parts.shift() || "",lastName:parts.join(" "),email:session?.user.email || "",
    dni:latest?.dni || "",phone:session?.user.phone || latest?.phone || "",province:latest?.province || "W",
    postalCode:latest?.postalCode || "",locality:latest?.locality || "",street:latest?.street || "",streetNumber:latest?.streetNumber || "",
    floor:latest?.floor || "",apartment:latest?.apartment || "",reference:latest?.addressReference || "",
  };
}
export function mergeCheckoutDefaults<T extends Record<string,string>>(defaults:T,edits:Partial<T>):T {
  return {...defaults,...edits};
}
