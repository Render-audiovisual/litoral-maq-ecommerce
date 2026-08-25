"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS, resolveOrderLines } from "@/lib/order-details";
import { isAndreaniUiEnabled } from "@/services/shipping/andreani-admin-client";
import type { Order } from "@/lib/types";

// Con la integración apagada (default) el panel no muestra ningún control de
// Andreani. La guarda real es server-side (ANDREANI_ENABLED en las Edge
// Functions); esto solo evita mostrar un botón que devolvería 503.
const showAndreaniControls = isAndreaniUiEnabled();

const statuses = Object.keys(ORDER_STATUS_LABELS) as Order["status"][];

function deliveryAmountLabel(order: Order) {
  if (order.paymentReference === "Pago a coordinar") {
    return order.deliveryMethod === "envio" ? "A cotizar" : "Gratis";
  }
  return formatCurrency(order.shipping);
}

export default function AdminOrdersPage() {
  const { orders, products, customers, updateOrderStatus, createAndreaniShipment } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Order["status"] | "">("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState("");
  const [shippingId, setShippingId] = useState("");
  const [confirmingShipmentId, setConfirmingShipmentId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) =>
      (!status || order.status === status) &&
      (!normalized || [order.id, order.customerName, order.email, order.address]
        .some((value) => value?.toLowerCase().includes(normalized))),
    );
  }, [orders, query, status]);

  const pendingCount = orders.filter((order) => ["pendiente", "pago_simulado"].includes(order.status)).length;
  const preparingCount = orders.filter((order) => order.status === "preparando").length;
  const shippedCount = orders.filter((order) => order.status === "enviado").length;
  const totalAmount = orders.filter((order) => order.status !== "cancelado").reduce((sum, order) => sum + order.total, 0);

  async function changeStatus(order: Order, nextStatus: Order["status"]) {
    if (nextStatus === order.status) return;
    setUpdatingId(order.id);
    setError("");
    setMessage("");
    try {
      const persisted = await updateOrderStatus(order.id, nextStatus);
      setSelected((current) => current?.id === order.id ? persisted : current);
      setMessage(`${order.id} actualizado a ${ORDER_STATUS_LABELS[nextStatus]}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el pedido.");
    } finally {
      setUpdatingId("");
    }
  }

  // Nunca se llama a esto directamente desde un click: pasa primero por el
  // resumen de confirmación de abajo. El estado "preparando" solo HABILITA
  // el botón — la creación real del envío requiere esta confirmación
  // explícita, nunca es un efecto silencioso de cambiar el estado.
  async function generateShipment(order: Order) {
    setConfirmingShipmentId("");
    setShippingId(order.id);
    setError("");
    setMessage("");
    try {
      const persisted = await createAndreaniShipment(order.id);
      setSelected((current) => current?.id === order.id ? persisted : current);
      setMessage(`Envío Andreani ${persisted.andreaniShipmentNumber} generado para ${order.id}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo generar el envío de Andreani.");
    } finally {
      setShippingId("");
    }
  }

  // Mismo bulto por defecto que supabase/functions/_shared/andreani.ts
  // (DEFAULT_PARCEL) — duplicado acá a propósito: son runtimes distintos
  // (Deno vs. Next.js) sin un paquete compartido, y es un solo valor.
  const DEFAULT_PARCEL_LABEL = "3 kg · 30×20×15 cm (bulto por defecto — el catálogo todavía no tiene peso/dimensiones por producto)";

  const selectedLines = selected ? resolveOrderLines(selected, products) : [];
  const selectedCustomer = selected ? customers.find((customer) => customer.id === selected.customerId) : null;

  return (
    <main className="admin-content">
      <div className="admin-heading"><div><span className="eyebrow orange">VENTAS</span><h1>Pedidos</h1><p>Consultá cada solicitud y avanzá su preparación con confirmación real de Supabase.</p></div></div>

      <section className="stats-grid order-stats">
        <article className="warning"><span>Para revisar</span><strong>{pendingCount}</strong><small>Pendientes o con pago demo</small></article>
        <article><span>Preparando</span><strong>{preparingCount}</strong><small>Pedidos en proceso</small></article>
        <article><span>En camino</span><strong>{shippedCount}</strong><small>Marcados como enviados</small></article>
        <article><span>Total registrado</span><strong>{formatCurrency(totalAmount)}</strong><small>Sin pedidos cancelados</small></article>
      </section>

      {message && <div className="success-message dismissible">{message}<button type="button" onClick={() => setMessage("")}>×</button></div>}
      {error && <div className="error-message dismissible">{error}<button type="button" onClick={() => setError("")}>×</button></div>}

      <section className="admin-card">
        <div className="table-toolbar order-filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente, email o domicilio…" />
          <select value={status} onChange={(event) => setStatus(event.target.value as Order["status"] | "")}>
            <option value="">Todos los estados</option>
            {statuses.map((item) => <option value={item} key={item}>{ORDER_STATUS_LABELS[item]}</option>)}
          </select>
          <span>{filtered.length} de {orders.length} pedidos</span>
        </div>
        {!orders.length ? <div className="empty-state"><span>▤</span><h2>No hay pedidos todavía</h2><p>Los pedidos confirmados desde la tienda van a aparecer acá.</p></div> : !filtered.length ? <div className="empty-state"><span>⌕</span><h2>No hay coincidencias</h2><p>Probá otro término o limpiá el filtro de estado.</p></div> : (
          <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th>Entrega</th><th>Total productos</th><th>Fecha</th><th>Estado</th><th /></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.id}</strong><small>{order.paymentReference || "Sin referencia de pago"}</small></td><td>{order.customerName}<small>{order.email}</small></td><td>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} unidades<small>{order.lines.length} renglones</small></td><td>{order.deliveryMethod === "envio" ? "Envío" : "Retiro"}<small>{order.address || "Sáenz 1587"}</small></td><td>{formatCurrency(order.total)}<small>Entrega {deliveryAmountLabel(order)}</small></td><td>{formatDate(order.createdAt)}</td><td><select aria-label={`Estado de ${order.id}`} className={`status-select status-${order.status}`} value={order.status} disabled={updatingId === order.id} onChange={(event) => void changeStatus(order, event.target.value as Order["status"])}>{statuses.map((item) => <option value={item} key={item}>{ORDER_STATUS_LABELS[item]}</option>)}</select></td><td><button type="button" className="table-detail-button" onClick={() => setSelected(order)}>Ver detalle</button></td></tr>)}</tbody></table></div>
        )}
      </section>

      {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal order-detail-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow orange">PEDIDO {selected.id}</span><h2>Detalle operativo</h2></div><button type="button" onClick={() => setSelected(null)}>×</button></div>
        <div className="order-detail-grid">
          <div><span>Cliente</span><strong>{selected.customerName}</strong><small>{selected.email}</small><small>{selectedCustomer?.phone || "Teléfono no disponible"}</small></div>
          <div><span>Entrega</span><strong>{selected.deliveryMethod === "envio" ? "Envío a domicilio" : "Retiro en sucursal"}</strong><small>{selected.address || "Sáenz 1587"}</small></div>
          <div><span>Fecha</span><strong>{formatDate(selected.createdAt)}</strong><small>{selected.paymentReference || "Sin referencia de pago"}</small></div>
          <label>Estado<select aria-label={`Estado de ${selected.id} en detalle`} className={`status-select status-${selected.status}`} value={selected.status} disabled={updatingId === selected.id} onChange={(event) => void changeStatus(selected, event.target.value as Order["status"])}>{statuses.map((item) => <option value={item} key={item}>{ORDER_STATUS_LABELS[item]}</option>)}</select></label>
          {showAndreaniControls && <div><span>Envío Andreani</span>
            {selected.andreaniShipmentNumber
              ? <>
                  <strong>{selected.andreaniShipmentNumber}</strong>
                  <small>{selected.andreaniStatus || "Sin estado informado"}</small>
                  {selected.andreaniTrackingUrl && <small><a href={selected.andreaniTrackingUrl} target="_blank" rel="noreferrer">Ver tracking</a></small>}
                  {selected.andreaniLabelUrl && <small><a href={selected.andreaniLabelUrl} target="_blank" rel="noreferrer">Ver etiqueta</a></small>}
                </>
              : <strong>Sin generar</strong>}

            {confirmingShipmentId === selected.id ? (
              <div className="andreani-confirm">
                <p>Confirmá los datos antes de generar el envío real (o simulado, en modo mock):</p>
                <dl>
                  <dt>Destinatario</dt><dd>{selected.customerName} · {selected.email}</dd>
                  <dt>Destino</dt><dd>{selected.address || "Sin domicilio cargado"}</dd>
                  <dt>Bultos</dt><dd>{DEFAULT_PARCEL_LABEL}</dd>
                  <dt>Valor declarado</dt><dd>{formatCurrency(selected.total)}</dd>
                </dl>
                <div className="andreani-confirm-actions">
                  <button type="button" onClick={() => setConfirmingShipmentId("")}>Cancelar</button>
                  <button type="button" className="table-detail-button" disabled={shippingId === selected.id} onClick={() => void generateShipment(selected)}>
                    {shippingId === selected.id ? "Generando…" : "Confirmar y crear envío"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="table-detail-button"
                disabled={selected.status !== "preparando"}
                title={selected.status !== "preparando" ? 'Pasá el pedido a "Preparando" para poder generar el envío.' : undefined}
                onClick={() => setConfirmingShipmentId(selected.id)}
              >
                {selected.andreaniShipmentNumber ? "Generar envío nuevamente" : "Generar envío"}
              </button>
            )}
          </div>}
        </div>
        <div className="order-lines"><div className="order-lines-heading"><strong>Productos</strong><span>{selected.lines.reduce((sum, line) => sum + line.quantity, 0)} unidades</span></div>{selectedLines.map((line) => <div className="order-line-detail" key={`${line.productId}-${line.productCode}`}><div><strong>{line.productName}</strong><small>Cód. {line.productCode || line.productId}{!line.historicalSnapshot ? " · pedido anterior sin foto histórica" : ""}</small></div><span>{line.quantity} × {formatCurrency(line.unitPrice)}</span><strong>{formatCurrency(line.lineTotal)}</strong></div>)}</div>
        <div className="order-totals"><div><span>Productos</span><strong>{formatCurrency(selected.paymentReference === "Pago a coordinar" ? selected.total : selected.total - selected.shipping)}</strong></div><div><span>Entrega</span><strong>{deliveryAmountLabel(selected)}</strong></div><div className="summary-total"><span>{selected.paymentReference === "Pago a coordinar" ? "Total de productos" : "Total"}</span><strong>{formatCurrency(selected.total)}</strong></div></div>
      </section></div>}
    </main>
  );
}
