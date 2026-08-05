"use client";

import Link from "next/link";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function AdminDashboardPage() {
  const { products, orders, customers } = useStore();
  const lowStock = products.filter((product) => product.stock <= product.lowStockThreshold);
  const revenue = orders.filter((order) => order.status !== "cancelado").reduce((sum, order) => sum + order.total, 0);
  const incomplete = products.filter((product) => product.incomplete.length > 2);
  return (
    <main className="admin-content">
      <div className="admin-heading"><div><span className="eyebrow orange">PANORAMA GENERAL</span><h1>Resumen</h1><p>Estado del catálogo, pedidos y stock.</p></div><Link href="/admin/productos" className="button primary">+ Nuevo producto</Link></div>
      <div className="stats-grid">
        <article><span>Ventas registradas</span><strong>{formatCurrency(revenue)}</strong><small>Flujo de cobro simulado</small></article>
        <article><span>Pedidos</span><strong>{orders.length}</strong><small>{orders.filter((order) => order.status === "pago_simulado").length} pagos simulados</small></article>
        <article><span>Productos activos</span><strong>{products.filter((product) => product.active).length}</strong><small>de {products.length} cargados</small></article>
        <article className={lowStock.length ? "warning" : ""}><span>Stock bajo</span><strong>{lowStock.length}</strong><small>Requieren revisión</small></article>
      </div>
      <div className="admin-grid">
        <section className="admin-card wide">
          <div className="card-heading"><div><h2>Pedidos recientes</h2><p>Últimos movimientos del e-commerce</p></div><Link href="/admin/pedidos">Ver todos →</Link></div>
          {!orders.length ? <div className="empty-inline">Todavía no hay pedidos. Completá una compra desde la tienda para probar el flujo.</div> : (
            <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead><tbody>{orders.slice(0, 6).map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customerName}</td><td>{formatDate(order.createdAt)}</td><td>{formatCurrency(order.total)}</td><td><span className={`status status-${order.status}`}>{order.status.replace("_", " ")}</span></td></tr>)}</tbody></table></div>
          )}
        </section>
        <section className="admin-card">
          <div className="card-heading"><div><h2>Calidad de catálogo</h2><p>Información pendiente</p></div></div>
          <div className="quality-score"><strong>{Math.round(((products.length - incomplete.length) / products.length) * 100)}%</strong><span>completitud base</span></div>
          <ul className="check-list"><li className="done">✓ Códigos: completos</li><li className="done">✓ Precios: completos</li><li>! Imágenes pendientes: {products.filter((product) => !product.image).length}</li><li>! Stock real pendiente: {products.length}</li><li>! Descripciones pendientes: {products.filter((product) => !product.description).length}</li></ul>
        </section>
        <section className="admin-card">
          <div className="card-heading"><div><h2>Clientes</h2><p>Registrados por compras demo</p></div></div>
          <div className="quality-score"><strong>{customers.length}</strong><span>clientes</span></div>
          <Link href="/admin/clientes" className="button secondary full">Consultar clientes</Link>
        </section>
      </div>
    </main>
  );
}
