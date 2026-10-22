"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useStore } from "@/store/store";
import { paginate } from "@/lib/paginate";
import { productPhoto } from "@/lib/product-photos";
import { getLaunchBestSellers } from "@/lib/launch-catalog";
import { labelClient, requestLabel } from "@/services/bestseller-label";
import { resolveRequestedProvider } from "@/services/provider";
import "./bestseller-labels.css";

type Filter = "all" | "tagged" | "untagged";
const PAGE_SIZE = 25;

export function BestsellerLabels() {
  const { products, refreshProducts } = useStore();
  const local = resolveRequestedProvider() === "local";
  const [authorized, setAuthorized] = useState(local);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessageText] = useState("");
  const [busy, setBusy] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Record<string, boolean>>({});
  const setMessage = (text: string, isError = false) => { setMessageText(text); setMessageIsError(isError); };
  useEffect(() => {
    if (local) return;
    let cancelled = false;
    requestLabel({ action: "check" }).then(() => { if (!cancelled) setAuthorized(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [local]);
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy("login"); setMessage("");
    try {
      const { error } = await labelClient().auth.signInWithPassword({ email, password });
      if (error) throw new Error("No se pudo iniciar sesión.");
      await requestLabel({ action: "check" }); setPassword(""); setAuthorized(true); await refreshProducts();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo verificar el acceso.", true); }
    finally { setBusy(""); }
  }
  const tagged = new Set(getLaunchBestSellers(products).map((product) => product.id));
  async function toggle(id: string, value: boolean) {
    setBusy(id); setMessage("");
    try {
      if (local) { setPreview((current) => ({ ...current, [id]: value })); setMessage("Vista local: no se modificó la base de datos."); }
      else {
        const product = products.find((item) => item.id === id);
        if (!product?.updatedAt) throw new Error("Actualizá la lista antes de guardar.");
        await requestLabel({ productId: id, bestSeller: value, updatedAt: product.updatedAt });
        await refreshProducts(); setMessage("Etiqueta guardada.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar.", true); }
    finally { setBusy(""); }
  }
  const isTagged = (id: string) => preview[id] ?? tagged.has(id);
  const activeProducts = products.filter((product) => product.active);
  const taggedCount = activeProducts.filter((product) => isTagged(product.id)).length;
  const needle = query.trim().toLowerCase();
  const visible = activeProducts
    .filter((product) => `${product.name} ${product.code}`.toLowerCase().includes(needle))
    .filter((product) => filter === "all" || (filter === "tagged") === isTagged(product.id));
  const paged = paginate(visible, page, PAGE_SIZE);
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: activeProducts.length },
    { id: "tagged", label: "Más vendidos", count: taggedCount },
    { id: "untagged", label: "Sin marcar", count: activeProducts.length - taggedCount },
  ];
  return <main className="label-manager">
    <header className="label-head">
      <h1>Etiquetas de productos</h1>
      <p>Elegí qué productos aparecen como <strong>Más vendido</strong>. No modifica precios ni stock.</p>
    </header>
    {message && <p role="status" className={`label-message ${messageIsError ? "error" : "ok"}`}>{message}</p>}
    {!authorized ? <form onSubmit={login} className="label-login">
      <h2>Acceso del equipo</h2>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="button primary" disabled={Boolean(busy)}>Ingresar</button>
    </form> : <>
      <div className="label-toolbar">
        <label className="label-search">
          <span>Buscar por nombre o código</span>
          <input type="search" placeholder="Ej: amoladora o 3403" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        </label>
        <div className="label-filters" role="group" aria-label="Filtrar productos">
          {filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setPage(1); }}>
            {item.label}<span>{item.count}</span>
          </button>)}
        </div>
      </div>
      <div className="label-list">{paged.items.map((product) => {
        const checked = isTagged(product.id);
        const photo = productPhoto(product);
        return <label className={`label-product${checked ? " is-tagged" : ""}`} key={product.id}>
          <span className="label-thumb">{photo && !failedImages.has(photo) ? <Image src={photo} alt="" fill sizes="56px" onError={() => setFailedImages((current) => new Set(current).add(photo))} /> : null}</span>
          <span className="label-info"><strong>{product.name}</strong><small>Cód. {product.code}{product.category ? ` · ${product.category}` : ""}</small></span>
          <span className="label-check">
            <span className="label-state">{busy === product.id ? "Guardando…" : checked ? "Más vendido" : "Sin etiqueta"}</span>
            <input type="checkbox" role="switch" aria-label={`Más vendido: ${product.name}`} checked={checked} disabled={Boolean(busy)} onChange={(event) => void toggle(product.id, event.target.checked)} />
          </span>
        </label>;
      })}
      {paged.total === 0 && <p className="label-empty">{needle ? `No hay productos para “${query.trim()}”.` : "No hay productos en este filtro."}</p>}
      </div>
      {paged.total > 0 && <nav className="label-pager" aria-label="Paginación">
        <span>{paged.from}–{paged.to} de {paged.total}</span>
        <div>
          <button type="button" disabled={paged.page === 1} onClick={() => setPage(paged.page - 1)}>Anterior</button>
          <span>Página {paged.page} de {paged.pageCount}</span>
          <button type="button" disabled={paged.page === paged.pageCount} onClick={() => setPage(paged.page + 1)}>Siguiente</button>
        </div>
      </nav>}
    </>}
  </main>;
}
