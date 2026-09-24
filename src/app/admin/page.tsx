"use client";

import Link from "next/link";
import { TableScroll } from "@/components/table-scroll";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { orderStatusLabel } from "@/lib/order-details";

type QualityItem = { label: string; pending: number; detail: string };

function StatusIcon({ ok }: { ok: boolean }) {
  return (
    <svg className={ok ? "quality-icon ok" : "quality-icon pending"} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      {ok ? <path d="m8.5 12.5 2.5 2.5 4.5-5" /> : <path d="M12 7.5v5M12 16.5h.01" />}
    </svg>
  );
}

export default function AdminDashboardPage() {
  const { products, orders, customers } = useStore();
  const lowStock = products.filter((product) => !product.incomplete.includes("stock") && product.stock <= product.lowStockThreshold);
  const requestedValue = orders.filter((order) => order.status !== "cancelado").reduce((sum, order) => sum + order.total, 0);
  const incomplete = products.filter((product) => product.incomplete.length > 2);
  const completeness = products.length ? Math.round(((products.length - incomplete.length) / products.length) * 100) : 0;
  const quality: QualityItem[] = [
    { label: "Códigos", pending: 0, detail: "Completos" },
    { label: "Precios", pending: 0, detail: "Completos" },
    { label: "Imágenes", pending: products.filter((product) => !product.image).length, detail: "sin imagen" },
    { label: "Stock real", pending: products.filter((product) => product.incomplete.includes("stock")).length, detail: "sin stock real cargado" },
    { label: "Descripciones", pending: products.filter((product) => !product.description).length, detail: "sin descripción" },
  ];
  const recentCustomers = customers.slice(0, 5);
  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div><h1>Resumen</h1><p>Estado del catálogo, pedidos y stock.</p></div>
        <Link href="/admin/productos" className="button primary">
          <svg className="button-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo producto
        </Link>
      </div>
      <div className="stats-grid">
        <article><span>Valor solicitado</span><strong>{formatCurrency(requestedValue)}</strong><small>Productos, sin envíos a cotizar</small></article>
        <article><span>Pedidos</span><strong>{orders.length}</strong><small>{orders.filter((order) => order.status === "pendiente").length} para revisar</small></article>
        <article><span>Productos activos</span><strong>{products.filter((product) => product.active).length}</strong><small>de {products.length} cargados</small></article>
        <article className={lowStock.length ? "warning" : ""}><span>Stock bajo</span><strong>{lowStock.length}</strong><small>{lowStock.length ? "Requieren revisión" : "Sin alertas de stock"}</small></article>
      </div>
      <div className="admin-grid">
        <section className="admin-card wide recent-orders">
          <div className="card-heading">
            <div><h2>Pedidos recientes</h2><p>Últimos movimientos de la tienda</p></div>
            <Link href="/admin/pedidos" className="text-button">
              Ver todos
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6" /></svg>
            </Link>
          </div>
          {!orders.length ? <div className="empty-inline">Todavía no hay pedidos. Cuando un cliente compre va a aparecer acá.</div> : (
            <TableScroll>
              <table>
                <thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total productos</th><th>Estado</th></tr></thead>
                <tbody>
                  {orders.slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <td><Link href={`/admin/pedidos?pedido=${encodeURIComponent(order.id)}`} className="order-link" aria-label={`Ver detalle del pedido ${order.id}`}>{order.id}</Link></td>
                      <td>{order.customerName}</td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td className="numeric">{formatCurrency(order.total)}</td>
                      <td><span className={`status status-${order.status}`}>{orderStatusLabel(order)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </section>
        <section className="admin-card">
          <div className="card-heading"><div><h2>Calidad de catálogo</h2><p>Datos que faltan cargar en los productos</p></div></div>
          <div className="quality-score">
            <p><strong>{completeness}%</strong> completitud base</p>
            <div className="quality-bar" aria-hidden="true"><span style={{ width: `${completeness}%` }} /></div>
          </div>
          <ul className="quality-list">
            {quality.map((item) => (
              <li key={item.label}>
                <StatusIcon ok={item.pending === 0} />
                <span>{item.label}</span>
                <small>{item.pending === 0 ? item.detail : `${item.pending} ${item.detail}`}</small>
              </li>
            ))}
          </ul>
        </section>
        <section className="admin-card customers-card">
          <div className="card-heading"><div><h2>Clientes</h2><p>Registrados por compras web o alta de cuenta</p></div></div>
          <p className="customer-count"><strong>{customers.length}</strong> {customers.length === 1 ? "cliente registrado" : "clientes registrados"}</p>
          {recentCustomers.length ? (
            <ul className="customer-list">
              {recentCustomers.map((customer) => (
                <li key={customer.id}><span>{customer.name || "Sin nombre"}</span><small>{customer.email}</small></li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">Todavía no hay clientes. Aparecen cuando alguien crea su cuenta o completa una compra.</p>
          )}
          <Link href="/admin/clientes" className="button secondary">Ver clientes</Link>
        </section>
      </div>
    </main>
  );
}
