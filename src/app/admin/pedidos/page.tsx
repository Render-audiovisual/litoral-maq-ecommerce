"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TableScroll } from "@/components/table-scroll";
import { useStore } from "@/store/store";
import { getPendingOrderCustomerWhatsAppUrl, paymentMethodLabel } from "@/lib/whatsapp";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  adminOrderStatusLabel,
  isShippingToCoordinate,
  ADMIN_ORDER_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  orderStatusOptions,
  resolveOrderLines,
} from "@/lib/order-details";
import { getOrderDelay } from "@/lib/order-delays";
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
function filterStatusOptions(current: Order["status"]) {
  return SELECTABLE_STATUSES.includes(current)
    ? SELECTABLE_STATUSES
    : [current, ...SELECTABLE_STATUSES];
}

function deliveryAmountLabel(order: Order) {
  if (order.deliveryMethod === "retiro") return "Gratis";
  if (isShippingToCoordinate(order)) return "a coordinar";
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

type CommercialFilter = "active" | "followup" | "delayed" | "paid" | "expired" | "all";

/** Filtros que se pueden pedir por URL (?filtro=…), p. ej. desde el Resumen. */
const URL_FILTERS: Record<string, CommercialFilter> = {
  demorados: "delayed",
  seguimiento: "followup",
};

function matchesCommercialFilter(order: Order, filter: CommercialFilter, now: Date) {
  const payment = order.paymentStatus || "pending";
  if (filter === "all") return true;
  if (filter === "delayed") return getOrderDelay(order, now) !== null;
  if (filter === "followup") {
    return payment === "pending" && order.status === "pendiente" && !!order.followUpAt;
  }
  if (filter === "paid") return payment === "approved";
  if (filter === "expired") {
    return payment === "cancelled" && order.status === "cancelado";
  }
  return order.status !== "cancelado" && payment !== "cancelled";
}

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
  const [commercialFilter, setCommercialFilter] = useState<CommercialFilter>("active");
  const [selected, setSelected] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shippingAction, setShippingAction] = useState("");
  const [processingEmails, setProcessingEmails] = useState(false);
  const paymentAutomatic =
    process.env.NEXT_PUBLIC_MERCADO_PAGO_ENABLED === "true";
  // Enlace directo desde el Resumen: /admin/pedidos?pedido=LM-… abre el
  // detalle de ese pedido una sola vez, cuando la lista ya cargó.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !orders.length) return;
    const requested = new URLSearchParams(window.location.search).get("pedido");
    const match = requested ? orders.find((order) => order.id === requested) : undefined;
    const timer = window.setTimeout(() => {
      deepLinkHandled.current = true;
      if (match) setSelected(match);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [orders]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("filtro");
    const filter = requested ? URL_FILTERS[requested] : undefined;
    if (!filter) return;
    const timer = window.setTimeout(() => setCommercialFilter(filter), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Hora de referencia fijada al abrir la página: las demoras se miden en
  // horas, no hace falta un reloj en vivo.
  const [now] = useState(() => new Date());

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter(
      (order) =>
        matchesCommercialFilter(order, commercialFilter, now) &&
        (!status || order.status === status) &&
        (!normalized ||
          [order.id, order.customerName, order.email, order.address].some(
            (value) => value?.toLowerCase().includes(normalized),
          )),
    );
  }, [orders, query, status, commercialFilter, now]);

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
        return {
          order,
          first: lines[0],
          extra: lines.length - 1,
          units,
          delay: getOrderDelay(order, now),
        };
      }),
    [filtered, products, now],
  );

  const pendingCount = orders.filter((order) =>
    ["pendiente", "pago_simulado"].includes(order.status) &&
    (order.paymentStatus || "pending") === "pending",
  ).length;
  const followUpCount = orders.filter((order) =>
    matchesCommercialFilter(order, "followup", now)
  ).length;
  const delayedCount = orders.filter((order) =>
    matchesCommercialFilter(order, "delayed", now)
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
        `${order.id} actualizado a ${adminOrderStatusLabel(nextStatus, order.deliveryMethod)}.`,
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
  // Cómo pagó el cliente. Solo existe cuando Mercado Pago ya acreditó el pago.
  const paymentSummary = selected?.paymentStatus === "approved"
    ? [
      paymentMethodLabel(selected.paymentMethodId),
      selected.paymentInstallments && selected.paymentInstallments > 1
        ? `${selected.paymentInstallments} cuotas${
          selected.paymentInstallmentAmount
            ? ` de ${formatCurrency(selected.paymentInstallmentAmount)}`
            : ""
        }`
        : "1 pago",
    ].filter(Boolean).join(" · ")
    : "";
  const selectedCustomer = selected
    ? customers.find((customer) => customer.id === selected.customerId)
    : null;
  const selectedPhone = selected?.phone || selectedCustomer?.phone || "";
  const recoveryWhatsAppUrl = selected && selected.paymentStatus !== "approved"
    ? getPendingOrderCustomerWhatsAppUrl(selected, selectedPhone)
    : "";

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <h1>Pedidos</h1>
          <p>
            Consultá cada pedido y avanzá su preparación.
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
        <article className={pendingCount ? "warning" : undefined}>
          <span>Paso 0 · Pedido recibido</span>
          <strong>{pendingCount}</strong>
          <small>{followUpCount} listos para seguimiento comercial</small>
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

      <section className="admin-card orders-card">
        <div className="table-toolbar order-filters">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pedido, cliente, email o domicilio…"
            aria-label="Buscar pedidos"
          />
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as Order["status"] | "")
            }
          >
            <option value="">Todos los estados</option>
            {filterStatusOptions(status || "pendiente").map((item) => (
              <option value={item} key={item}>
                {ADMIN_ORDER_STATUS_LABELS[item]}
              </option>
            ))}
          </select>
          <select
            value={commercialFilter}
            onChange={(event) =>
              setCommercialFilter(event.target.value as CommercialFilter)
            }
            aria-label="Circuito comercial"
          >
            <option value="active">Activos</option>
            <option value="followup">Seguimiento comercial</option>
            <option value="delayed">Demorados</option>
            <option value="paid">Pagados</option>
            <option value="expired">Vencidos</option>
            <option value="all">Todos</option>
          </select>
          {delayedCount > 0 && commercialFilter !== "delayed" && (
            <button
              type="button"
              className="payment-status delay-shortcut"
              onClick={() => setCommercialFilter("delayed")}
            >
              {delayedCount} {delayedCount === 1 ? "demorado" : "demorados"}
            </button>
          )}
          <span className="order-filters-count" aria-live="polite">
            {filtered.length} de {orders.length} pedidos
          </span>
        </div>
        {!orders.length ? (
          <div className="orders-empty">
            <h2>Todavía no hay pedidos</h2>
            <p>
              Cuando un cliente envíe una solicitud desde la tienda, aparece
              acá para que la prepares.
            </p>
          </div>
        ) : !filtered.length ? (
          <div className="orders-empty">
            <h2>Ningún pedido coincide con estos filtros</h2>
            <p>
              Probá con otro número, nombre o email, o mirá todos los pedidos
              sin filtrar.
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setQuery("");
                setStatus("");
                setCommercialFilter("all");
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <TableScroll>
            {/* Cada fila es una grilla (ver .orders-table en globals.css):
                pedido y cliente, productos y entrega, total y pago, y las
                acciones. Entra entera en una notebook sin scroll lateral.
                Los roles explícitos conservan la semántica de tabla para los
                lectores de pantalla aunque el CSS cambie el display. */}
            <table className="orders-table" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" className="cell-order">Pedido</th>
                  <th role="columnheader" className="cell-customer">Cliente</th>
                  <th role="columnheader" className="cell-products">Productos</th>
                  <th role="columnheader" className="cell-delivery">Entrega</th>
                  <th role="columnheader" className="cell-total">Total</th>
                  <th role="columnheader" className="cell-payment">Pago</th>
                  <th role="columnheader" className="cell-actions">Estado</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map(({ order, first, extra, units, delay }) => (
                  <tr role="row" key={order.id}>
                    <td role="cell" className="cell-order">
                      <strong>{order.id}</strong>
                      <small>{formatDate(order.createdAt)}</small>
                      {delay && (
                        <span className="payment-status delay-pill" title={delay.label}>
                          Demorado
                        </span>
                      )}
                      {delay && <small className="delay-note">{delay.label}</small>}
                    </td>
                    <td role="cell" className="cell-customer">
                      <span>{order.customerName}</span>
                      <small title={order.email}>{order.email}</small>
                    </td>
                    <td role="cell" className="cell-products order-products">
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
                    <td role="cell" className="cell-delivery">
                      <span>
                        {order.deliveryMethod === "retiro"
                          ? "Retiro en local"
                          : isShippingToCoordinate(order)
                            ? `Envío a coordinar${order.shippingCarrier ? ` · ${order.shippingCarrier}` : ""}`
                            : order.shippingCarrier || "Envío"}
                      </span>
                      <small title={order.address || "Sáenz 1587"}>
                        {order.address || "Sáenz 1587"}
                      </small>
                    </td>
                    <td role="cell" className="cell-total">
                      <strong>{formatCurrency(order.total)}</strong>
                      <small>Entrega {deliveryAmountLabel(order)}</small>
                    </td>
                    <td role="cell" className="cell-payment">
                      <span
                        className={`payment-status payment-${order.paymentStatus || "pending"}`}
                      >
                        {PAYMENT_LABELS[order.paymentStatus || "pending"]}
                      </span>
                      {matchesCommercialFilter(order, "followup", now) && (
                        <small>Contactar al cliente</small>
                      )}
                    </td>
                    <td role="cell" className="cell-actions">
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
                        {orderStatusOptions(order).map((item) => (
                          <option value={item} key={item}>
                            {adminOrderStatusLabel(item, order.deliveryMethod)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="button secondary table-detail-button"
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
              <button
                type="button"
                aria-label="Cerrar detalle"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <div className="order-detail-grid">
              <div>
                <span>Cliente</span>
                <strong>{selected.customerName}</strong>
                <small>{selected.email}</small>
                <small>
                  {selectedPhone || "Teléfono no disponible"}
                </small>
                <small>DNI {selected.dni || "no disponible"}</small>
                {recoveryWhatsAppUrl && (
                  <div className="detail-action">
                    <a
                      href={recoveryWhatsAppUrl}
                      className="button whatsapp-button"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Contactar por WhatsApp
                    </a>
                    <small>Se abre un mensaje ya armado con el pedido.</small>
                  </div>
                )}
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
                  {paymentSummary && (
                    <>
                      <br />
                      💳 {paymentSummary}
                    </>
                  )}
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
                  {orderStatusOptions(selected).map((item) => (
                    <option value={item} key={item}>
                      {adminOrderStatusLabel(item, selected.deliveryMethod)}
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
                    Estado:{" "}
                    {selected.shippingStatus === "manual_quote"
                      ? "cotización manual"
                      : (selected.shippingStatus || "pendiente").replace(/_/g, " ")}
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
                  {selected.lines.reduce((sum, line) => sum + line.quantity, 0) === 1
                    ? "unidad"
                    : "unidades"}
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
