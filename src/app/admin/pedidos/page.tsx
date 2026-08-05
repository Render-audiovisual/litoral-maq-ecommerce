"use client";

import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Order } from "@/lib/types";

const statuses: Order["status"][] = ["pendiente", "pago_simulado", "preparando", "enviado", "entregado", "cancelado"];

export default function AdminOrdersPage() {
  const { orders, updateOrderStatus } = useStore();
  return <main className="admin-content"><div className="admin-heading"><div><span className="eyebrow orange">VENTAS</span><h1>Pedidos</h1><p>Administrá el flujo completo de cada compra.</p></div></div><section className="admin-card">{!orders.length ? <div className="empty-state"><span>▤</span><h2>No hay pedidos todavía</h2><p>Realizá una compra desde la tienda para probar este panel.</p></div> : <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Total</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong><small>{order.paymentReference}</small></td><td>{order.customerName}<small>{order.email}</small></td><td>{order.deliveryMethod === "envio" ? "Envío" : "Retiro"}<small>{order.address || "Sucursal"}</small></td><td>{formatCurrency(order.total)}</td><td>{formatDate(order.createdAt)}</td><td><select className={`status-select status-${order.status}`} value={order.status} onChange={(event) => updateOrderStatus(order.id, event.target.value as Order["status"])}>{statuses.map((status) => <option value={status} key={status}>{status.replace("_", " ")}</option>)}</select></td></tr>)}</tbody></table></div>}</section></main>;
}
