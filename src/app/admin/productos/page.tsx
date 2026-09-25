"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TableScroll } from "@/components/table-scroll";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { pageWindow, paginate } from "@/lib/paginate";
import { googleSheetSyncAdapter } from "@/services/sheet-sync";
import { ConflictError, rebaseProductEdits } from "@/lib/concurrency";

const PAGE_SIZE = 50;
// Trae lo que cambiaron otras personas del panel. Pausado con la pestaña
// oculta o con el formulario abierto, para no mover nada bajo los dedos.
const PRODUCT_REFRESH_INTERVAL_MS = 60_000;

function managedBySheet(product: Product) {
  return (
    product.source === "google-sheet" &&
    !product.incomplete.includes("sheet-absent")
  );
}

function CloseIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
  );
}

function stockStatus(product: Product) {
  if (!product.incomplete.includes("stock")) return String(product.stock);
  if (product.incomplete.includes("sheet-absent")) return "Fuera del Sheet";
  if (product.source === "google-sheet") return "Gestionado en Sheet";
  return "Por confirmar";
}

const emptyProduct = (): Product => ({
  id: `manual-${Date.now()}`,
  slug: `producto-manual-${Date.now()}`,
  code: "",
  name: "",
  price: null,
  rawPrice: null,
  category: "Otros",
  brand: "Sin marca informada",
  image: null,
  images: [],
  stock: 0,
  lowStockThreshold: 5,
  purchaseLimit: 3,
  active: true,
  featured: false,
  description: "",
  variants: [],
  source: "admin",
  sourceRow: 0,
  incomplete: [],
  shippingWeightKg: null,
  shippingHeightCm: null,
  shippingWidthCm: null,
  shippingLengthCm: null,
  shippingEnabled: false,
});

function AdminProductsContent() {
  const {
    products,
    saveProduct,
    deleteProduct,
    refreshProducts,
    adminSession,
  } = useStore();
  // Acceso directo desde /admin/categorias: la categoría llega por query
  // string y queda en estado local para poder limpiarla sin navegar.
  const [category, setCategory] = useState(
    useSearchParams().get("categoria") ?? "",
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [sortBy, setSortBy] = useState<"name" | "recent">("name");
  // La página se vuelve a 1 al cambiar filtros, búsqueda u orden; al editar
  // o eliminar se conserva (paginate la acota si la última queda vacía).
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLElement>(null);
  // En celular la nota arranca plegada: ocupaba media pantalla antes del
  // primer producto. En escritorio queda abierta.
  const sourceNoteRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (sourceNoteRef.current && window.matchMedia("(max-width: 560px)").matches) {
      sourceNoteRef.current.open = false;
    }
  }, []);
  const [editing, setEditing] = useState<Product | null>(null);
  // Copia del producto al abrir el formulario: define qué cambió la persona
  // y la versión (updatedAt) que se exige al guardar. null = producto nuevo.
  const [original, setOriginal] = useState<Product | null>(null);
  const formOpen = editing !== null;
  useEffect(() => {
    if (formOpen) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshProducts().catch((error) =>
        console.warn("No se pudo actualizar el catálogo.", error),
      );
    }, PRODUCT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [formOpen, refreshProducts]);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">(
    "success",
  );
  const [syncing, setSyncing] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const sheetProductCount = products.filter(
    (product) => product.source === "google-sheet",
  ).length;
  const activeCount = products.filter((product) => product.active).length;
  const inactiveCount = products.length - activeCount;
  const filtered = useMemo(
    () =>
      products
        .filter((product) => !category || product.category === category)
        .filter((product) =>
          status === "all" ? true : status === "active" ? product.active : !product.active,
        )
        .filter(
          (product) =>
            !query ||
            product.name.toLowerCase().includes(query.toLowerCase()) ||
            product.code?.includes(query),
        )
        .sort((a, b) =>
          sortBy === "recent"
            ? (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
            : a.name.localeCompare(b.name),
        ),
    [products, query, category, status, sortBy],
  );
  const current = paginate(filtered, page, PAGE_SIZE);

  function goToPage(next: number) {
    setPage(next);
    listRef.current?.scrollIntoView({ block: "start" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !editing?.name.trim() ||
      !editing.code?.trim() ||
      editing.price === null ||
      editing.price < 0
    ) {
      setMessageKind("error");
      setMessage("Completá nombre, código y un precio válido.");
      return;
    }
    if (
      !Number.isInteger(editing.purchaseLimit ?? 3) ||
      (editing.purchaseLimit ?? 3) < 1 ||
      (editing.purchaseLimit ?? 3) > 99
    ) {
      setMessageKind("error");
      setMessage(
        "El límite por compra debe ser un número entero entre 1 y 99.",
      );
      return;
    }
    if (
      editing.shippingEnabled &&
      [
        editing.shippingWeightKg,
        editing.shippingHeightCm,
        editing.shippingWidthCm,
        editing.shippingLengthCm,
      ].some((value) => !value || value <= 0)
    ) {
      setMessageKind("error");
      setMessage(
        "Para habilitar envío automático completá peso, alto, ancho y largo del producto embalado.",
      );
      return;
    }
    const product = {
      ...editing,
      incomplete: editing.incomplete.filter(
        (item) => !["code", "price"].includes(item),
      ),
    };
    setPendingProductId(product.id);
    setMessage("");
    try {
      await saveProduct(product, original ?? undefined);
      setEditing(null);
      setMessageKind("success");
      setMessage("Producto guardado correctamente.");
    } catch (error) {
      if (error instanceof ConflictError && original) {
        // Otra persona guardó antes: se muestra su versión con lo que esta
        // persona escribió encima, para revisar y volver a guardar.
        const latest = error.latest as Product | undefined;
        if (latest) {
          setEditing(rebaseProductEdits(latest, original, product));
          setOriginal(latest);
        } else {
          setEditing(null);
        }
      }
      setMessageKind("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto.",
      );
    } finally {
      setPendingProductId(null);
    }
  }

  async function toggleVisibility(product: Product) {
    setPendingProductId(product.id);
    setMessage("");
    try {
      await saveProduct({ ...product, active: !product.active }, product);
      setMessageKind("success");
      setMessage("Visibilidad actualizada correctamente.");
    } catch (error) {
      setMessageKind("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar la visibilidad.",
      );
    } finally {
      setPendingProductId(null);
    }
  }

  async function removeProduct(product: Product) {
    if (!confirm(`¿Eliminar ${product.name}?`)) return;
    setPendingProductId(product.id);
    setMessage("");
    try {
      await deleteProduct(product.id);
      setMessageKind("success");
      setMessage("Producto eliminado correctamente.");
    } catch (error) {
      setMessageKind("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el producto.",
      );
    } finally {
      setPendingProductId(null);
    }
  }

  function setStockConfirmed(confirmed: boolean) {
    if (!editing) return;
    setEditing({
      ...editing,
      incomplete: confirmed
        ? editing.incomplete.filter((item) => item !== "stock")
        : Array.from(new Set([...editing.incomplete, "stock"])),
    });
  }

  async function sync() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await googleSheetSyncAdapter.sync(adminSession?.token || "");
      const persisted = await refreshProducts();
      setMessageKind("success");
      setMessage(
        `Google Sheet sincronizado: ${result.total} productos · ` +
          `${result.created} nuevos · ${result.updated} actualizados · ` +
          `${result.unchanged} sin cambios · ${result.removed} retirados. ` +
          `Catálogo recargado: ${persisted.length} registros.`,
      );
    } catch (error) {
      setMessageKind("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo sincronizar Google Sheets.",
      );
    } finally {
      setSyncing(false);
    }
  }

  const statusTabs = [
    { value: "active", label: "Activos", count: activeCount },
    { value: "inactive", label: "No activos", count: inactiveCount },
    { value: "all", label: "Todos", count: products.length },
  ] as const;

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <h1>Productos</h1>
          <p>
            {products.length} productos · {sheetProductCount} provenientes del
            Google Sheet
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button secondary"
            onClick={sync}
            disabled={syncing || pendingProductId !== null}
          >
            <svg className="button-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></svg>
            {syncing ? "Sincronizando…" : "Actualizar desde Sheet"}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setEditing(emptyProduct());
              setOriginal(null);
            }}
            disabled={pendingProductId !== null}
          >
            <svg className="button-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
            Nuevo producto
          </button>
        </div>
      </div>
      <details className="source-of-truth-note" open ref={sourceNoteRef}>
        <summary>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          Cómo se actualiza el catálogo
        </summary>
        <p>
          <strong>Fuente de verdad:</strong> el Google Sheet controla código,
          nombre, precio y qué productos siguen en catálogo. El panel controla
          visibilidad, ficha, logística y límite por compra. Sin stock numérico,
          el límite predeterminado es 3 unidades por producto.
        </p>
      </details>
      {message && (
        <div
          className={`${messageKind === "error" ? "error-message" : "success-message"} dismissible`}
          role="status"
        >
          {message}
          <button type="button" onClick={() => setMessage("")} aria-label="Cerrar aviso">
            <CloseIcon />
          </button>
        </div>
      )}
      <section
        className="admin-card products-card"
        ref={listRef}
        aria-label="Lista de productos"
      >
        <div className="status-tabs" role="group" aria-label="Mostrar productos">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={status === tab.value ? "status-tab selected" : "status-tab"}
              aria-pressed={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
            >
              {tab.label} <span>({tab.count})</span>
            </button>
          ))}
        </div>
        <div className="table-toolbar product-filters">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre o código…"
            aria-label="Buscar productos"
          />
          {category && (
            <button
              type="button"
              className="filter-chip"
              onClick={() => {
                setCategory("");
                setPage(1);
              }}
              aria-label={`Quitar filtro de categoría ${category}`}
            >
              {category}
              <CloseIcon />
            </button>
          )}
          <select
            className="sort-select"
            value={sortBy}
            aria-label="Ordenar productos"
            onChange={(event) => {
              setSortBy(event.target.value as "name" | "recent");
              setPage(1);
            }}
          >
            <option value="name">Ordenar: nombre (A-Z)</option>
            <option value="recent">Ordenar: editados recientemente</option>
          </select>
          <span className="order-filters-count" aria-live="polite">
            {current.total
              ? `Mostrando ${current.from}–${current.to} de ${current.total}`
              : "Sin resultados"}
          </span>
        </div>
        {!current.total ? (
          <div className="orders-empty">
            <h2>
              {products.length
                ? "Ningún producto coincide con la búsqueda"
                : "Todavía no hay productos"}
            </h2>
            <p>
              {products.length
                ? "Probá con otro nombre o código, o mirá todos los productos sin filtrar."
                : "Actualizá desde el Google Sheet o cargá un producto nuevo."}
            </p>
            {products.length > 0 && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                  setStatus("all");
                  setPage(1);
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            <TableScroll>
              {/* Tabla real en escritorio; en una tarjeta angosta cada fila
                  pasa a ser una ficha (ver .products-table en globals.css).
                  Los roles explícitos mantienen la semántica de tabla aunque
                  el CSS cambie el display de las filas. */}
              <table className="products-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" className="cell-product">Producto</th>
                    <th role="columnheader" className="cell-code">Código</th>
                    <th role="columnheader" className="cell-category">Categoría</th>
                    <th role="columnheader" className="cell-price">Precio</th>
                    <th role="columnheader" className="cell-stock">Stock</th>
                    <th role="columnheader" className="cell-visible">Visible</th>
                    <th role="columnheader" className="cell-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {current.items.map((product) => (
                    <tr role="row" key={product.id}>
                      <th role="rowheader" scope="row" className="cell-product">
                        <strong>{product.name}</strong>
                        <small>{product.brand}</small>
                      </th>
                      <td role="cell" className="cell-code">{product.code}</td>
                      <td role="cell" className="cell-category">{product.category}</td>
                      <td role="cell" className="cell-price">{formatCurrency(product.price)}</td>
                      <td role="cell" className="cell-stock">
                        <span
                          className={
                            managedBySheet(product)
                              ? "stock-pill ok"
                              : "stock-pill pending"
                          }
                          title={
                            managedBySheet(product)
                              ? "Código, precio y disponibilidad vienen del Google Sheet vigente, administrado por Litoral."
                              : undefined
                          }
                        >
                          {stockStatus(product)}
                        </span>
                        <small>
                          {product.shippingEnabled
                            ? "Envío automático"
                            : "Envío manual"}
                        </small>
                      </td>
                      <td role="cell" className="cell-visible">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={product.active}
                          aria-label={`Visible en la tienda: ${product.name}`}
                          className="visibility-switch"
                          onClick={() => void toggleVisibility(product)}
                          disabled={pendingProductId !== null}
                        >
                          <span className={product.active ? "toggle active" : "toggle"}>
                            <span />
                          </span>
                          <span className="visibility-label" aria-hidden="true">
                            {product.active ? "Visible" : "Oculto"}
                          </span>
                        </button>
                      </td>
                      <td role="cell" className="cell-actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button secondary row-edit"
                            aria-label={`Editar ${product.name}`}
                            onClick={() => {
                              setEditing({ ...product });
                              setOriginal(product);
                            }}
                            disabled={pendingProductId !== null}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="row-delete"
                            aria-label={`Eliminar ${product.name}`}
                            onClick={() => void removeProduct(product)}
                            disabled={pendingProductId !== null}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {current.pageCount > 1 && (
              <nav className="pager" aria-label="Paginación">
                <span className="pager-range">
                  Mostrando {current.from}–{current.to} de {current.total}
                </span>
                <div className="pager-controls">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => goToPage(current.page - 1)}
                    disabled={current.page === 1}
                  >
                    <svg className="button-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m15 18-6-6 6-6" /></svg>
                    Anterior
                  </button>
                  <ol className="pager-pages">
                    {pageWindow(current.page, current.pageCount).map((number, index) =>
                      number === null ? (
                        <li key={`salto-${index}`} className="pager-gap" aria-hidden="true">
                          …
                        </li>
                      ) : (
                        <li key={number}>
                          <button
                            type="button"
                            aria-label={`Página ${number}`}
                            aria-current={number === current.page ? "page" : undefined}
                            onClick={() => goToPage(number)}
                          >
                            {number}
                          </button>
                        </li>
                      ),
                    )}
                  </ol>
                  <span className="pager-status">
                    <span className="sr-only">Página </span>
                    {current.page} de {current.pageCount}
                  </span>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => goToPage(current.page + 1)}
                    disabled={current.page === current.pageCount}
                  >
                    Siguiente
                    <svg className="button-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
      {editing && (
        <div
          className="modal-backdrop"
          onMouseDown={() => {
            if (pendingProductId !== editing.id) setEditing(null);
          }}
        >
          <form
            className="modal product-form"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
            aria-labelledby="product-form-title"
          >
            <div className="modal-heading">
              <h2 id="product-form-title">
                {editing.source === "admin"
                  ? "Nuevo producto"
                  : "Editar producto"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={pendingProductId === editing.id}
                aria-label="Cerrar"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="form-grid">
              <h3 className="form-section-title wide">Datos del catálogo</h3>
              <label className="wide">
                Nombre
                <input
                  value={editing.name}
                  readOnly={editing.source === "google-sheet"}
                  onChange={(event) =>
                    setEditing({ ...editing, name: event.target.value })
                  }
                />
                {editing.source === "google-sheet" && (
                  <small>
                    Nombre, código y precio se actualizan desde el Google Sheet.
                  </small>
                )}
              </label>
              <label>
                Código
                <input
                  value={editing.code || ""}
                  readOnly={editing.source === "google-sheet"}
                  onChange={(event) =>
                    setEditing({ ...editing, code: event.target.value })
                  }
                />
              </label>
              <label>
                Precio
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.price ?? ""}
                  readOnly={editing.source === "google-sheet"}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      price: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Categoría
                <input
                  value={editing.category}
                  onChange={(event) =>
                    setEditing({ ...editing, category: event.target.value })
                  }
                />
              </label>
              <label>
                Marca
                <input
                  value={editing.brand}
                  onChange={(event) =>
                    setEditing({ ...editing, brand: event.target.value })
                  }
                />
              </label>
              <h3 className="form-section-title wide">Stock y compra</h3>
              <label>
                Stock
                <input
                  type="number"
                  min="0"
                  value={editing.stock}
                  disabled={editing.incomplete.includes("stock")}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      stock: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Alerta de stock bajo
                <input
                  type="number"
                  min="0"
                  value={editing.lowStockThreshold}
                  disabled={editing.incomplete.includes("stock")}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      lowStockThreshold: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Límite por compra
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={editing.purchaseLimit ?? 3}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      purchaseLimit: Number(event.target.value),
                    })
                  }
                />
                <small>
                  No representa stock físico; limita el riesgo mientras el Sheet
                  no informa cantidades.
                </small>
              </label>
              <label className="check-row wide">
                <input
                  type="checkbox"
                  checked={!editing.incomplete.includes("stock")}
                  onChange={(event) => setStockConfirmed(event.target.checked)}
                />
                Stock verificado por el negocio
              </label>
              <div className="form-section-title shipping-fields wide">
                <h3>Bulto embalado</h3>
                <p>
                  Se usa para cotizar Envíopack. Sin estos datos, el producto
                  queda en cotización manual.
                </p>
              </div>
              <label>
                Peso (kg)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editing.shippingWeightKg ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      shippingWeightKg: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Alto (cm)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editing.shippingHeightCm ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      shippingHeightCm: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Ancho (cm)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editing.shippingWidthCm ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      shippingWidthCm: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Largo (cm)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editing.shippingLengthCm ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      shippingLengthCm: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label className="check-row wide">
                <input
                  type="checkbox"
                  checked={editing.shippingEnabled ?? false}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      shippingEnabled: event.target.checked,
                    })
                  }
                />
                Peso y medidas embaladas verificados; habilitar cotización
                automática
              </label>
              <h3 className="form-section-title wide">Ficha y publicación</h3>
              <label className="wide">
                Descripción
                <textarea
                  value={editing.description || ""}
                  onChange={(event) =>
                    setEditing({ ...editing, description: event.target.value })
                  }
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(event) =>
                    setEditing({ ...editing, active: event.target.checked })
                  }
                />
                Producto visible
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={editing.featured}
                  onChange={(event) =>
                    setEditing({ ...editing, featured: event.target.checked })
                  }
                />
                Producto destacado
              </label>
            </div>
            {message && (
              <div className="error-message" role="alert">
                {message}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
                disabled={pendingProductId === editing.id}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={pendingProductId === editing.id}
              >
                {pendingProductId === editing.id
                  ? "Guardando…"
                  : "Guardar producto"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default function AdminProductsPage() {
  return (
    <Suspense
      fallback={
        <main className="admin-content">
          <div className="spinner" />
        </main>
      }
    >
      <AdminProductsContent />
    </Suspense>
  );
}
