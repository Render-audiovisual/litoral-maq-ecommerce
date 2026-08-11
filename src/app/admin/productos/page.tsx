"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { googleSheetSyncAdapter } from "@/services/sheet-sync";
import { resolveRequestedProvider } from "@/services/provider";

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
  active: true,
  featured: false,
  description: "",
  variants: [],
  source: "admin",
  sourceRow: 0,
  incomplete: [],
});

export default function AdminProductsPage() {
  const { products, saveProduct, deleteProduct, replaceProducts } = useStore();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const [syncing, setSyncing] = useState(false);
  const provider = resolveRequestedProvider();
  const sheetProductCount = products.filter((product) => product.source === "google-sheet").length;
  const filtered = useMemo(() => products.filter((product) => !query || product.name.toLowerCase().includes(query.toLowerCase()) || product.code?.includes(query)).slice(0, 100), [products, query]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing?.name.trim() || !editing.code?.trim() || editing.price === null || editing.price < 0) {
      setMessage("Completá nombre, código y un precio válido."); return;
    }
    saveProduct({ ...editing, incomplete: editing.incomplete.filter((item) => !["code", "price"].includes(item)) });
    setEditing(null); setMessageKind("success"); setMessage("Producto guardado correctamente.");
  }

  async function sync() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await googleSheetSyncAdapter.sync(products);
      const persisted = await replaceProducts(result.products);
      const localNotice = provider === "local" ? " Modo preview: el cambio se guardó solo en este navegador." : "";
      setMessageKind("success");
      setMessage(
        `Google Sheet sincronizado: ${persisted.filter((product) => product.source === "google-sheet").length} productos · ` +
        `${result.created} nuevos · ${result.updated} actualizados · ${result.removed} retirados.${localNotice}`,
      );
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "No se pudo sincronizar Google Sheets.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="admin-content">
      <div className="admin-heading"><div><span className="eyebrow orange">CATÁLOGO</span><h1>Productos</h1><p>{products.length} productos · {sheetProductCount} provenientes del Google Sheet</p></div><div className="heading-actions"><button type="button" className="button secondary" onClick={sync} disabled={syncing}>{syncing ? "Sincronizando…" : "↻ Actualizar desde Sheet"}</button><button type="button" className="button primary" onClick={() => setEditing(emptyProduct())}>+ Nuevo producto</button></div></div>
      {message && <div className={`${messageKind === "error" ? "error-message" : "success-message"} dismissible`}>{message}<button onClick={() => setMessage("")}>×</button></div>}
      <section className="admin-card">
        <div className="table-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o código…" /><span>Mostrando {filtered.length} resultados</span></div>
        <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Código</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Visible</th><th /></tr></thead><tbody>{filtered.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.brand}</small></td><td>{product.code}</td><td>{product.category}</td><td>{formatCurrency(product.price)}</td><td><span className={product.stock <= product.lowStockThreshold ? "stock-alert" : ""}>{product.stock}</span></td><td><button type="button" className={product.active ? "toggle active" : "toggle"} onClick={() => saveProduct({ ...product, active: !product.active })}><span /></button></td><td><div className="row-actions"><button type="button" onClick={() => setEditing({ ...product })}>Editar</button><button type="button" className="danger-link" onClick={() => { if (confirm(`¿Eliminar ${product.name}?`)) deleteProduct(product.id); }}>Eliminar</button></div></td></tr>)}</tbody></table></div>
      </section>
      {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow orange">ADMINISTRAR</span><h2>{editing.source === "admin" ? "Nuevo producto" : "Editar producto"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><div className="form-grid"><label className="wide">Nombre<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><label>Código<input value={editing.code || ""} onChange={(event) => setEditing({ ...editing, code: event.target.value })} /></label><label>Precio<input type="number" min="0" step="0.01" value={editing.price ?? ""} onChange={(event) => setEditing({ ...editing, price: event.target.value ? Number(event.target.value) : null })} /></label><label>Categoría<input value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label><label>Marca<input value={editing.brand} onChange={(event) => setEditing({ ...editing, brand: event.target.value })} /></label><label>Stock<input type="number" min="0" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: Number(event.target.value) })} /></label><label>Alerta de stock bajo<input type="number" min="0" value={editing.lowStockThreshold} onChange={(event) => setEditing({ ...editing, lowStockThreshold: Number(event.target.value) })} /></label><label className="wide">Descripción<textarea value={editing.description || ""} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label><label className="check-row"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />Producto visible</label><label className="check-row"><input type="checkbox" checked={editing.featured} onChange={(event) => setEditing({ ...editing, featured: event.target.checked })} />Producto destacado</label></div>{message && <div className="error-message">{message}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button primary">Guardar producto</button></div></form></div>}
    </main>
  );
}
