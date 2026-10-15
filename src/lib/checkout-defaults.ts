import type { Order, Session } from "./types";

export function checkoutDefaults(session: Session | null, orders: Order[]) {
  const latest = session ? orders.filter(order => order.customerId === session.user.id)
    .reduce<Order | undefined>((current, order) => !current || order.createdAt > current.createdAt ? order : current, undefined) : undefined;
  const parts = (latest?.customerName || session?.user.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "", lastName: parts.join(" "),
    email: session?.user.email || "", dni: latest?.dni || "",
    phone: latest?.phone || session?.user.phone || "", province: latest?.province || "W",
    postalCode: latest?.postalCode || "", locality: latest?.locality || "", street: latest?.street || "",
    streetNumber: latest?.streetNumber || "", floor: latest?.floor || "", apartment: latest?.apartment || "",
    reference: latest?.addressReference || "",
  };
}
