"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { googleSheetSyncAdapter } from "@/services/sheet-sync";
import { resolveRequestedProvider } from "@/services/provider";

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

export default function AdminProductsPage() {
  const { products, saveProduct, deleteProduct, replaceProducts } = useStore();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">(
    "success",
  );
  const [syncing, setSyncing] = useState(false);
  const provider = resolveRequestedProvider();
  const sheetProductCount = products.filter(
    (product) => product.source === "google-sheet",
  ).length;
  const filtered = useMemo(
    () =>
      products
        .filter(
          (product) =>
            !query ||
            product.name.toLowerCase().includes(query.toLowerCase()) ||
            product.code?.includes(query),
        )
        .slice(0, 100),
    [products, query],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !editing?.name.trim() ||
      !editing.code?.trim() ||
      editing.price === null ||
      editing.price < 0
    ) {
      setMessage("Completá nombre, código y un precio válido.");
      return;
    }
    if (
      !Number.isInteger(editing.purchaseLimit ?? 3) ||
      (editing.purchaseLimit ?? 3) < 1 ||
      (editing.purchaseLimit ?? 3) > 99
    ) {
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
      setMessage(
        "Para habilitar envío automático completá peso, alto, ancho y largo del producto embalado.",
      );
      return;
    }
    saveProduct({
      ...editing,
      incomplete: editing.incomplete.filter(
        (item) => !["code", "price"].includes(item),
      ),
    });
    setEditing(null);
    setMessageKind("success");
    setMessage("Producto guardado correctamente.");
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
      const result = await googleSheetSyncAdapter.sync(products);
      const persisted = await replaceProducts(result.products);
      const localNotice =
        provider === "local"
          ? " Modo preview: el cambio se guardó solo en este navegador."
          : "";
      setMessageKind("success");
      setMessage(
        `Google Sheet sincronizado: ${persisted.filter((product) => product.source === "google-sheet").length} productos · ` +
          `${result.created} nuevos · ${result.updated} actualizados · ${result.removed} retirados.${localNotice}`,
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

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <span className="eyebrow orange">CATÁLOGO</span>
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
            disabled={syncing}
          >
            {syncing ? "Sincronizando…" : "↻ Actualizar desde Sheet"}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => setEditing(emptyProduct())}
          >
            + Nuevo producto
          </button>
        </div>
      </div>
      <div className="source-of-truth-note">
        <strong>Fuente de verdad:</strong> el Google Sheet controla código,
        nombre, precio y qué productos siguen en catálogo. El panel controla
        visibilidad, ficha, logística y límite por compra. Sin stock numérico,
        el límite predeterminado es 3 unidades por producto.
      </div>
      {message && (
        <div
          className={`${messageKind === "error" ? "error-message" : "success-message"} dismissible`}
        >
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <section className="admin-card">
        <div className="table-toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o código…"
          />
          <span>Mostrando {filtered.length} resultados</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Código</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Logística</th>
                <th>Visible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    <small>{product.brand}</small>
                  </td>
                  <td>{product.code}</td>
                  <td>{product.category}</td>
                  <td>{formatCurrency(product.price)}</td>
                  <td>
                    <span
                      className={
                        product.source === "google-sheet" &&
                        !product.incomplete.includes("sheet-absent")
                          ? "shipping-ready"
                          : "stock-pending"
                      }
                      title={
                        product.source === "google-sheet" &&
                        !product.incomplete.includes("sheet-absent")
                          ? "Código, precio y disponibilidad vienen del Google Sheet vigente, administrado por Litoral."
                          : undefined
                      }
                    >
                      {stockStatus(product)}
                    </span>
                  </td>
                  <td>
                    {product.shippingEnabled ? (
                      <span className="shipping-ready">Automático</span>
                    ) : (
                      <span className="stock-pending">Manual</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={product.active ? "toggle active" : "toggle"}
                      onClick={() =>
                        saveProduct({ ...product, active: !product.active })
                      }
                    >
                      <span />
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => setEditing({ ...product })}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => {
                          if (confirm(`¿Eliminar ${product.name}?`))
                            deleteProduct(product.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <form
            className="modal"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow orange">ADMINISTRAR</span>
                <h2>
                  {editing.source === "admin"
                    ? "Nuevo producto"
                    : "Editar producto"}
                </h2>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                ×
              </button>
            </div>
            <div className="form-grid">
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
                  <small>Se actualiza desde el Google Sheet.</small>
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
              <div className="shipping-fields wide">
                <strong>Bulto embalado</strong>
                <small>
                  Se usa para cotizar Envíopack. Sin estos datos, el producto
                  queda en cotización manual.
                </small>
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
            {message && <div className="error-message">{message}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button className="button primary">Guardar producto</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
