"use client";

import { useStore } from "@/store/store";
import { normalizeEmail } from "@/lib/auth";

export default function AdminCustomersPage() {
  const { customers, orders } = useStore();
  return <main className="admin-content"><div className="admin-heading"><div><span className="eyebrow orange">CLIENTES</span><h1>Clientes</h1><p>Personas registradas durante el checkout o el alta de cuenta.</p></div></div><section className="admin-card">{!customers.length ? <div className="empty-state"><span>◎</span><h2>No hay clientes todavía</h2><p>Los clientes aparecerán al registrarse o completar una compra.</p></div> : <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Email</th><th>Teléfono</th><th>Pedidos</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.email}</td><td>{customer.phone || "Sin informar"}</td><td>{orders.filter((order) => order.customerId === customer.id || normalizeEmail(order.email) === normalizeEmail(customer.email)).length}</td></tr>)}</tbody></table></div>}</section></main>;
}
