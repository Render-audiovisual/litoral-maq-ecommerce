"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { orderStatusLabel } from "@/lib/order-details";
import { getOrderDelay } from "@/lib/order-delays";
import { customerHasPurchase, getSalesAnalytics, type SalesPeriod } from "@/lib/admin-analytics";

const PERIODS: SalesPeriod[] = [7, 30, 90];

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="metric-trend neutral">Sin período anterior</span>;
  const rounded = Math.round(value);
  return <span className={`metric-trend ${rounded >= 0 ? "positive" : "negative"}`}>{rounded >= 0 ? "↑" : "↓"} {Math.abs(rounded)}% vs. período anterior</span>;
}

export default function AdminDashboardPage() {
  const { products, orders, customers } = useStore();
  const [period, setPeriod] = useState<SalesPeriod>(30);
  const analytics = useMemo(() => getSalesAnalytics(orders, period), [orders, period]);
  const maxPoint = Math.max(...analytics.points.map((point) => point.total), 1);
  const approvedOrders = orders.filter((order) => order.paymentStatus === "approved" && order.status !== "cancelado");
  const buyerCount = customers.filter((customer) => customerHasPurchase(orders, customer.id, customer.email)).length;
  const lowStock = products.filter((product) => !product.incomplete.includes("stock") && product.stock <= product.lowStockThreshold);
  const withoutStock = products.filter((product) => product.incomplete.includes("stock"));
  const delayed = orders.map((order) => ({ order, delay: getOrderDelay(order, new Date()) })).filter((item) => item.delay !== null).sort((a, b) => (b.delay?.hours ?? 0) - (a.delay?.hours ?? 0));
  const workflow = [
    { label: "Cobrar", detail: "Pagos pendientes", value: orders.filter((order) => order.status === "pendiente" && (order.paymentStatus ?? "pending") === "pending").length, href: "/admin/pedidos?filtro=seguimiento", tone: "amber" },
    { label: "Preparar", detail: "Pagados para armar", value: approvedOrders.filter((order) => ["pendiente", "preparando"].includes(order.status)).length, href: "/admin/pedidos?filtro=preparando", tone: "blue" },
    { label: "Entregar", detail: "Listos para salir", value: approvedOrders.filter((order) => order.status === "listo").length, href: "/admin/pedidos?filtro=listo", tone: "green" },
    { label: "Reponer", detail: "Productos con stock bajo", value: lowStock.length, href: "/admin/productos?stock=bajo", tone: "red" },
  ];

  return (
    <main className="admin-content owner-dashboard">
      <section className="dashboard-welcome">
        <div><span className="eyebrow">Mesa de control · Buen día, Gonzalo</span><h1>Resumen</h1><p>Lo importante del negocio, ordenado para decidir rápido.</p></div>
        <div className="dashboard-actions"><Link href="/admin/pedidos" className="button secondary">Ver pedidos</Link><Link href="/admin/productos" className="button primary">Gestionar productos</Link></div>
      </section>
      <section className="workflow-grid" aria-label="Flujo operativo">
        {workflow.map((item, index) => <Link key={item.label} href={item.href} className={`workflow-card ${item.tone}`}><span className="workflow-step">0{index + 1}</span><strong>{item.value}</strong><div><h2>{item.label}</h2><p>{item.detail}</p></div><span aria-hidden="true">→</span></Link>)}
      </section>
      <section className="sales-panel admin-card wide">
        <div className="card-heading sales-heading"><div><span className="eyebrow">Rendimiento comercial</span><h2>Ventas aprobadas</h2><p>Solo pagos confirmados; no incluye pedidos pendientes.</p></div><div className="period-selector" role="group" aria-label="Período de ventas">{PERIODS.map((value) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? "selected" : ""} onClick={() => setPeriod(value)}>{value} días</button>)}</div></div>
        <div className="sales-metrics">
          <div><span>Facturación</span><strong>{formatCurrency(analytics.approvedTotal)}</strong><Trend value={analytics.changePercent} /></div>
          <div><span>Pedidos cobrados</span><strong>{analytics.approvedOrders}</strong><small>pagos aprobados</small></div>
          <div><span>Ticket promedio</span><strong>{formatCurrency(analytics.averageTicket)}</strong><small>por compra</small></div>
          <div><span>Unidades vendidas</span><strong>{analytics.units}</strong><small>{analytics.refundedTotal ? `${formatCurrency(analytics.refundedTotal)} reintegrados` : "sin reintegros en el período"}</small></div>
        </div>
        <div className="sales-chart" aria-label={`Ventas aprobadas de los últimos ${period} días`}>
          {analytics.points.map((point, index) => <div className="chart-column" key={`${point.label}-${index}`} title={`${point.label}: ${formatCurrency(point.total)} en ${point.orders} pedidos`}><span className="chart-value">{point.total ? formatCurrency(point.total) : ""}</span><div className="chart-track"><span style={{ height: `${Math.max(point.total ? 8 : 2, (point.total / maxPoint) * 100)}%` }} /></div><small>{point.label}</small></div>)}
        </div>
      </section>
      <div className="dashboard-lower-grid">
        <section className="admin-card dashboard-list-card attention-card"><div className="card-heading"><div><h2>Requieren atención</h2><p>Pedidos demorados o sin resolver</p></div><Link href="/admin/pedidos?filtro=demorados" className="text-button">Ver todos los demorados</Link></div>{delayed.length ? <ul className="attention-list">{delayed.slice(0, 5).map(({ order, delay }) => <li key={order.id}><Link href={`/admin/pedidos?pedido=${encodeURIComponent(order.id)}`} className="order-link">{order.id}</Link><span>{order.customerName}</span><span className="payment-status">{delay?.label}</span></li>)}</ul> : <p className="empty-inline">Todo al día. No hay pedidos demorados.</p>}</section>
        <section className="admin-card dashboard-list-card"><div className="card-heading"><div><h2>Más vendidos</h2><p>Productos líderes en {period} días</p></div></div>{analytics.topProducts.length ? <ol className="ranking-list">{analytics.topProducts.map((product, index) => <li key={product.key}><span>{index + 1}</span><div><strong>{product.name}</strong><small>{product.units} unidades</small></div><b>{formatCurrency(product.total)}</b></li>)}</ol> : <p className="empty-inline">Todavía no hay ventas aprobadas en este período.</p>}</section>
        <section className="admin-card dashboard-list-card"><div className="card-heading"><div><h2>Pedidos recientes</h2><p>Últimos movimientos</p></div><Link href="/admin/pedidos" className="text-button">Ver todos</Link></div>{orders.length ? <ul className="compact-order-list">{orders.slice(0, 5).map((order) => <li key={order.id}><div><Link href={`/admin/pedidos?pedido=${encodeURIComponent(order.id)}`} className="order-link">{order.id}</Link><small>{order.customerName} · {formatDate(order.createdAt)}</small></div><div><strong>{formatCurrency(order.total)}</strong><span className={`status status-${order.status}`}>{orderStatusLabel(order)}</span></div></li>)}</ul> : <p className="empty-inline">Todavía no hay pedidos.</p>}</section>
        <section className="admin-card dashboard-list-card health-card"><div className="card-heading"><div><h2>Salud del catálogo</h2><p>Datos que impactan en ventas</p></div><Link href="/admin/productos" className="text-button">Corregir</Link></div><dl><div><dt>Productos activos</dt><dd>{products.filter((product) => product.active).length}</dd></div><div><dt>Stock bajo</dt><dd className={lowStock.length ? "danger" : ""}>{lowStock.length}</dd></div><div><dt>Stock sin confirmar</dt><dd className={withoutStock.length ? "warning" : ""}>{withoutStock.length}</dd></div><div><dt>Compradores</dt><dd>{buyerCount}</dd></div></dl></section>
      </div>
    </main>
  );
}
