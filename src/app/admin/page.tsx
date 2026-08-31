"use client";

import Link from "next/link";
import { TableScroll } from "@/components/table-scroll";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/order-details";

export default function AdminDashboardPage() {
  const { products, orders, customers } = useStore();
  const lowStock = products.filter((product) => !product.incomplete.includes("stock") && product.stock <= product.lowStockThreshold);
  const requestedValue = orders.filter((order) => order.status !== "cancelado").reduce((sum, order) => sum + order.total, 0);
  const incomplete = products.filter((product) => product.incomplete.length > 2);
  return (
    <main className="admin-content">
      <div className="admin-heading"><div><span className="eyebrow orange">PANORAMA GENERAL</span><h1>Resumen</h1><p>Estado del catálogo, pedidos y stock.</p></div><Link href="/admin/productos" className="button primary">+ Nuevo producto</Link></div>
      <div className="stats-grid">
        <article><span>Valor solicitado</span><strong>{formatCurrency(requestedValue)}</strong><small>Productos, sin envíos a cotizar</small></article>
        <article><span>Pedidos</span><strong>{orders.length}</strong><small>{orders.filter((order) => order.status === "pendiente").length} para revisar</small></article>
        <article><span>Productos activos</span><strong>{products.filter((product) => product.active).length}</strong><small>de {products.length} cargados</small></article>
        <article className={lowStock.length ? "warning" : ""}><span>Stock bajo</span><strong>{lowStock.length}</strong><small>Requieren revisión</small></article>
      </div>
      <div className="admin-grid">
        <section className="admin-card wide">
          <div className="card-heading"><div><h2>Pedidos recientes</h2><p>Últimos movimientos del e-commerce</p></div><Link href="/admin/pedidos">Ver todos →</Link></div>
          {!orders.length ? <div className="empty-inline">Todavía no hay solicitudes. Cuando un cliente confirme su pedido va a aparecer acá.</div> : (
            <TableScroll><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total productos</th><th>Estado</th></tr></thead><tbody>{orders.slice(0, 6).map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customerName}</td><td>{formatDate(order.createdAt)}</td><td>{formatCurrency(order.total)}</td><td><span className={`status status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span></td></tr>)}</tbody></table></TableScroll>
          )}
        </section>
        <section className="admin-card">
          <div className="card-heading"><div><h2>Calidad de catálogo</h2><p>Información pendiente</p></div></div>
          <div className="quality-score"><strong>{Math.round(((products.length - incomplete.length) / products.length) * 100)}%</strong><span>completitud base</span></div>
          <ul className="check-list"><li className="done">✓ Códigos: completos</li><li className="done">✓ Precios: completos</li><li>! Imágenes pendientes: {products.filter((product) => !product.image).length}</li><li>! Stock real pendiente: {products.filter((product) => product.incomplete.includes("stock")).length}</li><li>! Descripciones pendientes: {products.filter((product) => !product.description).length}</li></ul>
        </section>
        <section className="admin-card">
          <div className="card-heading"><div><h2>Clientes</h2><p>Registrados por solicitudes web</p></div></div>
          <div className="quality-score"><strong>{customers.length}</strong><span>clientes</span></div>
          <Link href="/admin/clientes" className="button secondary full">Consultar clientes</Link>
        </section>
      </div>
    </main>
  );
}
