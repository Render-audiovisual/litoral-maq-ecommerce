"use client";

import { useState } from "react";
import { useStore } from "@/store/store";
import { normalizeEmail } from "@/lib/auth";
import { paginate } from "@/lib/paginate";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function AdminCustomersPage() {
  const { customers, orders } = useStore();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const rows = customers.map((customer) => {
    const customerOrders = orders.filter((order) => order.customerId === customer.id || normalizeEmail(order.email) === normalizeEmail(customer.email));
    const lastOrderAt = customerOrders.reduce<string | null>((latest, order) => (!latest || order.createdAt > latest ? order.createdAt : latest), null);
    return { customer, orderCount: customerOrders.length, lastOrderAt };
  });
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(({ customer }) => [customer.name, customer.email, customer.phone ?? ""].some((value) => value.toLowerCase().includes(needle)))
    : rows;
  const current = paginate(filtered, page, PAGE_SIZE);

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <h1>Clientes</h1>
          <p>Personas que crearon su cuenta o hicieron un pedido en la tienda.</p>
        </div>
      </div>
      <section className="admin-card list-card">
        {!customers.length ? (
          <div className="orders-empty">
            <h2>Todavía no hay clientes</h2>
            <p>Cada persona que crea su cuenta o hace un pedido, aunque compre como invitada, aparece acá con su email, su teléfono y cuántos pedidos hizo.</p>
          </div>
        ) : (
          <>
            <div className="table-toolbar list-filters">
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Nombre, email o teléfono…"
                aria-label="Buscar clientes"
              />
              <span className="list-count" aria-live="polite">
                {current.total
                  ? current.pageCount > 1
                    ? `Mostrando ${current.from}–${current.to} de ${current.total}`
                    : `${current.total} ${current.total === 1 ? "cliente" : "clientes"}`
                  : "Sin resultados"}
              </span>
            </div>
            {!current.total ? (
              <div className="orders-empty">
                <h2>Ningún cliente coincide con la búsqueda</h2>
                <p>Probá con otra parte del nombre, del email o del teléfono.</p>
                <button type="button" className="button secondary" onClick={() => setQuery("")}>Limpiar búsqueda</button>
              </div>
            ) : (
              <table className="admin-list customers-list" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" className="cell-name">Cliente</th>
                    <th role="columnheader" className="cell-email">Email</th>
                    <th role="columnheader" className="cell-phone">Teléfono</th>
                    <th role="columnheader" className="cell-number">Pedidos</th>
                    <th role="columnheader" className="cell-date">Último pedido</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {current.items.map(({ customer, orderCount, lastOrderAt }) => (
                    <tr role="row" key={customer.id}>
                      <th role="rowheader" scope="row" className="cell-name">{customer.name}</th>
                      <td role="cell" className="cell-email">{customer.email}</td>
                      <td role="cell" className={customer.phone ? "cell-phone" : "cell-phone is-missing"}>{customer.phone || "Sin teléfono"}</td>
                      <td role="cell" className={orderCount ? "cell-number" : "cell-number is-zero"} data-label={orderCount === 1 ? "pedido" : "pedidos"}>{orderCount}</td>
                      <td role="cell" className={lastOrderAt ? "cell-date" : "cell-date is-missing"}>{lastOrderAt ? formatDate(lastOrderAt) : "Sin pedidos"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {current.pageCount > 1 && (
              <nav className="pager" aria-label="Paginación">
                <span className="pager-range">Página {current.page} de {current.pageCount}</span>
                <div className="pager-controls">
                  <button type="button" className="button secondary" onClick={() => setPage(current.page - 1)} disabled={current.page === 1}>Anterior</button>
                  <button type="button" className="button secondary" onClick={() => setPage(current.page + 1)} disabled={current.page === current.pageCount}>Siguiente</button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}
