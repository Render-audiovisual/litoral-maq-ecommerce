"use client";

import { useMemo, useState } from "react";
import { TableScroll } from "@/components/table-scroll";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ADMIN_ORDER_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  resolveOrderLines,
} from "@/lib/order-details";
import type { Order, PaymentStatus } from "@/lib/types";
import { createShipping, downloadShippingLabel } from "@/services/shipping";
import { flushOrderNotifications } from "@/services/order-notifications";

const statuses = Object.keys(ORDER_STATUS_LABELS) as Order["status"][];

/**
 * `pago_simulado` ("Pago demo") quedó del período de pruebas. Los pedidos
 * históricos que lo tienen se siguen mostrando —por eso no se borra de
 * ORDER_STATUS_LABELS—, pero no se ofrece más como opción elegible: verlo en
 * el desplegable de un panel en producción hace parecer que el sistema sigue
 * siendo una demo.
 */
const SELECTABLE_STATUSES: Order["status"][] = statuses.filter(
  (status) => status !== "pago_simulado",
);

/** Los estados de la fila incluyen el actual aunque ya no sea elegible. */
function statusOptionsFor(current: Order["status"]) {
  return SELECTABLE_STATUSES.includes(current)
    ? SELECTABLE_STATUSES
    : [current, ...SELECTABLE_STATUSES];
}

function deliveryAmountLabel(order: Order) {
  if (order.deliveryMethod === "retiro") return "Gratis";
  if (!order.shippingQuoteId) return "A cotizar";
  return formatCurrency(order.shipping);
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  approved: "Confirmado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reintegrado",
  charged_back: "Contracargo",
};

export default function AdminOrdersPage() {
  const {
    orders,
    products,
    customers,
    updateOrderStatus,
    updateOrderPaymentStatus,
    refreshOrders,
  } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Order["status"] | "">("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shippingAction, setShippingAction] = useState("");
  const [processingEmails, setProcessingEmails] = useState(false);
  const paymentAutomatic =
    process.env.NEXT_PUBLIC_MERCADO_PAGO_ENABLED === "true";

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter(
      (order) =>
        (!status || order.status === status) &&
        (!normalized ||
          [order.id, order.customerName, order.email, order.address].some(
            (value) => value?.toLowerCase().includes(normalized),
          )),
    );
  }, [orders, query, status]);

  /**
   * Resumen de productos por fila. Antes la columna decía "1 unidades · 1
   * renglones", que no responde la pregunta que uno le hace a la tabla:
   * *qué* pidió el cliente. Se resuelve acá y no en el render de cada fila
   * para no recorrer el catálogo entero en cada repintado.
   */
  const rows = useMemo(
    () =>
      filtered.map((order) => {
        const lines = resolveOrderLines(order, products);
        const units = lines.reduce((sum, line) => sum + line.quantity, 0);
        return { order, first: lines[0], extra: lines.length - 1, units };
      }),
    [filtered, products],
  );

  const pendingCount = orders.filter((order) =>
    ["pendiente", "pago_simulado"].includes(order.status),
  ).length;
  const preparingCount = orders.filter(
    (order) => order.status === "preparando",
  ).length;
  const shippedCount = orders.filter(
    (order) => order.status === "enviado",
  ).length;
  const totalAmount = orders
    .filter((order) => order.status !== "cancelado")
    .reduce((sum, order) => sum + order.total, 0);

  async function changeStatus(order: Order, nextStatus: Order["status"]) {
    if (nextStatus === order.status) return;
    setUpdatingId(order.id);
    setError("");
    setMessage("");
    try {
      const persisted = await updateOrderStatus(order.id, nextStatus);
      setSelected((current) =>
        current?.id === order.id ? persisted : current,
      );
      setMessage(
        `${order.id} actualizado a ${ADMIN_ORDER_STATUS_LABELS[nextStatus]}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo actualizar el pedido.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function changePaymentStatus(order: Order, nextStatus: PaymentStatus) {
    setUpdatingId(order.id);
    setError("");
    setMessage("");
    try {
      const persisted = await updateOrderPaymentStatus(order.id, nextStatus);
      setSelected((current) =>
        current?.id === order.id ? persisted : current,
      );
      setMessage(`Pago de ${order.id}: ${PAYMENT_LABELS[nextStatus]}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo actualizar el pago.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function generateShipment(order: Order) {
    setShippingAction(order.id);
    setError("");
    setMessage("");
    try {
      const result = await createShipping(order.id);
      const latest = await refreshOrders();
      const refreshed = latest.find((item) => item.id === order.id);
      if (refreshed) setSelected(refreshed);
      setMessage(
        result.idempotent
          ? `La guía de ${order.id} ya existía y fue reconciliada.`
          : `Guía de ${order.id} creada correctamente.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo crear la guía.",
      );
    } finally {
      setShippingAction("");
    }
  }

  async function downloadLabel(order: Order) {
    setShippingAction(order.id);
    setError("");
    try {
      await downloadShippingLabel(order.id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo descargar la etiqueta.",
      );
    } finally {
      setShippingAction("");
    }
  }

  async function retryPendingEmails() {
    setProcessingEmails(true);
    setError("");
    setMessage("");
    try {
      const result = await flushOrderNotifications();
      setMessage(
        result.claimed === 0
          ? "No hay correos pendientes."
          : `Correos procesados: ${result.sent} enviados${result.failed ? ` · ${result.failed} pendientes de reintento` : ""}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudieron procesar los correos pendientes.",
      );
    } finally {
      setProcessingEmails(false);
    }
  }

  const selectedLines = selected ? resolveOrderLines(selected, products) : [];
  const selectedCustomer = selected
    ? customers.find((customer) => customer.id === selected.customerId)
    : null;

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <span className="eyebrow orange">VENTAS</span>
          <h1>Pedidos</h1>
          <p>
            Consultá cada solicitud y avanzá su preparación con confirmación
            real de Supabase.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button secondary"
            disabled={processingEmails}
            onClick={() => void retryPendingEmails()}
          >
            {processingEmails
              ? "Procesando correos…"
              : "Reintentar correos pendientes"}
          </button>
        </div>
      </div>

      <section className="stats-grid order-stats">
        <article className="warning">
          <span>Paso 0 · Pedido recibido</span>
          <strong>{pendingCount}</strong>
          <small>Esperan confirmación del equipo</small>
        </article>
        <article>
          <span>Paso 1 · Preparando</span>
          <strong>{preparingCount}</strong>
          <small>Pedidos en proceso</small>
        </article>
        <article>
          <span>Paso 3 · Enviado</span>
          <strong>{shippedCount}</strong>
          <small>Marcados como enviados</small>
        </article>
        <article>
          <span>Total registrado</span>
          <strong>{formatCurrency(totalAmount)}</strong>
          <small>Sin pedidos cancelados</small>
        </article>
      </section>

      {message && (
        <div className="success-message dismissible">
          {message}
          <button type="button" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="error-message dismissible">
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      <section className="admin-card">
        <div className="table-toolbar order-filters">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pedido, cliente, email o domicilio…"
          />
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as Order["status"] | "")
            }
          >
            <option value="">Todos los estados</option>
            {statusOptionsFor(status || "pendiente").map((item) => (
              <option value={item} key={item}>
                {ADMIN_ORDER_STATUS_LABELS[item]}
              </option>
            ))}
          </select>
          <span>
            {filtered.length} de {orders.length} pedidos
          </span>
        </div>
        {!orders.length ? (
          <div className="empty-state">
            <span>▤</span>
            <h2>No hay pedidos todavía</h2>
            <p>Los pedidos confirmados desde la tienda van a aparecer acá.</p>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <span>⌕</span>
            <h2>No hay coincidencias</h2>
            <p>Probá otro término o limpiá el filtro de estado.</p>
          </div>
        ) : (
          <TableScroll>
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Productos</th>
                  <th>Entrega</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order, first, extra, units }) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.id}</strong>
                      <small>{formatDate(order.createdAt)}</small>
                    </td>
                    <td>
                      {order.customerName}
                      <small>{order.email}</small>
                    </td>
                    <td className="order-products">
                      <strong title={first?.productName}>
                        {first?.productName ?? "Sin productos"}
                      </strong>
                      <small>
                        {units} {units === 1 ? "unidad" : "unidades"}
                        {first?.productCode ? ` · Cód. ${first.productCode}` : ""}
                        {extra > 0
                          ? ` · +${extra} producto${extra === 1 ? "" : "s"} más`
                          : ""}
                      </small>
                    </td>
                    <td>
                      {order.deliveryMethod === "envio"
                        ? order.shippingCarrier || "Envío manual"
                        : "Retiro"}
                      <small>
                        {order.shippingStatus || order.address || "Sáenz 1587"}
                      </small>
                    </td>
                    <td>
                      {formatCurrency(order.total)}
                      <small>Entrega {deliveryAmountLabel(order)}</small>
                    </td>
                    <td>
                      <span
                        className={`payment-status payment-${order.paymentStatus || "pending"}`}
                      >
                        {PAYMENT_LABELS[order.paymentStatus || "pending"]}
                      </span>
                    </td>
                    <td>
                      <select
                        aria-label={`Estado de ${order.id}`}
                        className={`status-select status-${order.status}`}
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(event) =>
                          void changeStatus(
                            order,
                            event.target.value as Order["status"],
                          )
                        }
                      >
                        {statusOptionsFor(order.status).map((item) => (
                          <option value={item} key={item}>
                            {ADMIN_ORDER_STATUS_LABELS[item]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-detail-button"
                        onClick={() => setSelected(order)}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section
            className="modal order-detail-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow orange">PEDIDO {selected.id}</span>
                <small className="order-detail-created-at">
                  {formatDate(selected.createdAt)}
                </small>
                <h2>Detalle operativo</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div className="order-detail-grid">
              <div>
                <span>Cliente</span>
                <strong>{selected.customerName}</strong>
                <small>{selected.email}</small>
                <small>
                  {selectedCustomer?.phone || "Teléfono no disponible"}
                </small>
              </div>
              <div>
                <span>Entrega</span>
                <strong>
                  {selected.deliveryMethod === "envio"
                    ? "Envío a domicilio"
                    : "Retiro en sucursal"}
                </strong>
                <small>{selected.address || "Sáenz 1587"}</small>
              </div>
              <label>
                Pago
                <select
                  aria-label={`Pago de ${selected.id}`}
                  className={`status-select payment-${selected.paymentStatus || "pending"}`}
                  value={selected.paymentStatus || "pending"}
                  disabled={updatingId === selected.id || paymentAutomatic}
                  onChange={(event) =>
                    void changePaymentStatus(
                      selected,
                      event.target.value as PaymentStatus,
                    )
                  }
                >
                  {(Object.keys(PAYMENT_LABELS) as PaymentStatus[]).map(
                    (item) => (
                      <option value={item} key={item}>
                        {PAYMENT_LABELS[item]}
                      </option>
                    ),
                  )}
                </select>
                <small>
                  {paymentAutomatic
                    ? "Estado confirmado automáticamente por Mercado Pago"
                    : selected.paymentReference || "Sin referencia"}
                </small>
              </label>
              <label>
                Estado
                <select
                  aria-label={`Estado de ${selected.id} en detalle`}
                  className={`status-select status-${selected.status}`}
                  value={selected.status}
                  disabled={updatingId === selected.id}
                  onChange={(event) =>
                    void changeStatus(
                      selected,
                      event.target.value as Order["status"],
                    )
                  }
                >
                  {statuses.map((item) => (
                    <option value={item} key={item}>
                      {ADMIN_ORDER_STATUS_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selected.deliveryMethod === "envio" && (
              <div className="shipping-operation">
                <div>
                  <span>Logística</span>
                  <strong>
                    {selected.shippingCarrier || "Cotización manual"}
                  </strong>
                  <small>
                    {selected.shippingDeliveryType === "sucursal"
                      ? `${selected.shippingBranchName || "Sucursal"} · ${selected.shippingBranchAddress || ""}`
                      : selected.address}
                  </small>
                  <small>
                    Estado: {selected.shippingStatus || "pendiente"}
                    {selected.shippingTrackingNumber
                      ? ` · Tracking ${selected.shippingTrackingNumber}`
                      : ""}
                  </small>
                </div>
                <div className="shipping-actions">
                  {selected.shippingQuoteId && !selected.shippingLabelReady && (
                    <button
                      type="button"
                      className="button primary"
                      disabled={
                        shippingAction === selected.id ||
                        selected.paymentStatus !== "approved"
                      }
                      onClick={() => void generateShipment(selected)}
                    >
                      {shippingAction === selected.id
                        ? "Procesando…"
                        : selected.paymentStatus !== "approved"
                          ? "Confirmá el pago primero"
                          : selected.shippingStatus === "error"
                            ? "Reconciliar guía"
                            : "Crear guía"}
                    </button>
                  )}
                  {selected.shippingLabelReady && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={shippingAction === selected.id}
                      onClick={() => void downloadLabel(selected)}
                    >
                      {shippingAction === selected.id
                        ? "Descargando…"
                        : "Descargar etiqueta PDF"}
                    </button>
                  )}
                  {!selected.shippingQuoteId && (
                    <small>
                      Este pedido requiere cotización manual; no se crea una
                      guía automática.
                    </small>
                  )}
                </div>
              </div>
            )}
            <div className="order-lines">
              <div className="order-lines-heading">
                <strong>Productos</strong>
                <span>
                  {selected.lines.reduce((sum, line) => sum + line.quantity, 0)}{" "}
                  unidades
                </span>
              </div>
              {selectedLines.map((line) => (
                <div
                  className="order-line-detail"
                  key={`${line.productId}-${line.productCode}`}
                >
                  <div>
                    <strong>{line.productName}</strong>
                    <small>
                      Cód. {line.productCode || line.productId}
                      {!line.historicalSnapshot
                        ? " · pedido anterior sin foto histórica"
                        : ""}
                    </small>
                  </div>
                  <span>
                    {line.quantity} × {formatCurrency(line.unitPrice)}
                  </span>
                  <strong>{formatCurrency(line.lineTotal)}</strong>
                </div>
              ))}
            </div>
            <div className="order-totals">
              <div>
                <span>Productos</span>
                <strong>
                  {formatCurrency(selected.total - selected.shipping)}
                </strong>
              </div>
              <div>
                <span>Entrega</span>
                <strong>{deliveryAmountLabel(selected)}</strong>
              </div>
              <div className="summary-total">
                <span>Total</span>
                <strong>{formatCurrency(selected.total)}</strong>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
