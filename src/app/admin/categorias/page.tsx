"use client";

import Link from "next/link";
import { useStore } from "@/store/store";
import { getStoreUrl } from "@/lib/domain-config";

// "Ver en tienda" NO puede ser un <Link> interno a "/productos": esa ruta
// no existe en el artefacto admin desplegado por separado (Etapa 6) — daría
// 404 en producción real. Mismo patrón domain-aware que el botón "Ver
// tienda" de AdminShell: ruta relativa sin NEXT_PUBLIC_STORE_DOMAIN
// configurada (desarrollo, mismo origen), URL absoluta al dominio real de
// tienda cuando está configurada. Este archivo es cliente-renderizado
// (lee `products` de localStorage), por lo que el link no aparece en el
// HTML estático exportado — solo se ve probando en el navegador real, no
// inspeccionando el HTML generado.
// En cambio "/admin/productos?categoria=…" SÍ es un <Link> interno: vive
// dentro del mismo artefacto admin.
export default function AdminCategoriesPage() {
  const { products } = useStore();
  const categories = [...new Set(products.map((product) => product.category))].sort();
  // Igual que el "Ver tienda" de AdminShell: si NEXT_PUBLIC_STORE_DOMAIN
  // está presente pero mal formada, getStoreUrl() lanza — se resuelve UNA
  // sola vez para toda la grilla, no dentro de cada iteración del .map().
  let storeUrlError: string | null = null;
  try {
    getStoreUrl("/productos");
  } catch (error) {
    storeUrlError = error instanceof Error ? error.message : String(error);
  }
  const rows = categories.map((category) => {
    const items = products.filter((product) => product.category === category);
    return { category, total: items.length, visible: items.filter((product) => product.active).length };
  });
  const visibleTotal = rows.reduce((sum, row) => sum + row.visible, 0);
  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <h1>Categorías</h1>
          <p>
            {categories.length} categorías · {products.length} productos, {visibleTotal} visibles en la tienda
          </p>
        </div>
      </div>
      <section className="admin-card list-card">
        {!rows.length ? (
          <div className="orders-empty">
            <h2>Todavía no hay categorías</h2>
            <p>Las categorías salen de los productos: actualizá el catálogo desde el Google Sheet en Productos.</p>
            <Link href="/admin/productos" className="button secondary">Ir a Productos</Link>
          </div>
        ) : (
          <table className="admin-list categories-list" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" className="cell-name">Categoría</th>
                <th role="columnheader" className="cell-number">Productos</th>
                <th role="columnheader" className="cell-number">Visibles</th>
                <th role="columnheader" className="cell-actions"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.map((row) => (
                <tr role="row" key={row.category}>
                  <th role="rowheader" scope="row" className="cell-name">{row.category}</th>
                  <td role="cell" className="cell-number" data-label={row.total === 1 ? "producto" : "productos"}>{row.total}</td>
                  <td role="cell" className={row.visible ? "cell-number" : "cell-number is-zero"} data-label={row.visible === 1 ? "visible" : "visibles"}>{row.visible}</td>
                  <td role="cell" className="cell-actions">
                    <div className="row-actions">
                      <Link
                        href={`/admin/productos?categoria=${encodeURIComponent(row.category)}`}
                        className="button secondary row-edit"
                        aria-label={`Administrar ${row.category}`}
                      >
                        Administrar
                      </Link>
                      {storeUrlError ? (
                        <span className="admin-domain-warning" title={storeUrlError} role="alert">Dominio de tienda mal configurado</span>
                      ) : (
                        <a
                          href={getStoreUrl(`/productos?categoria=${encodeURIComponent(row.category)}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-button"
                          aria-label={`Ver ${row.category} en la tienda (se abre en otra pestaña)`}
                        >
                          Ver en tienda
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" /></svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
