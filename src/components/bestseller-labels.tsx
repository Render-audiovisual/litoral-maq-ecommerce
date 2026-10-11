"use client";

import { FormEvent, useEffect, useState } from "react";
import { useStore } from "@/store/store";
import { getLaunchBestSellers } from "@/lib/launch-catalog";
import { labelClient, requestLabel } from "@/services/bestseller-label";
import { resolveRequestedProvider } from "@/services/provider";
import "./bestseller-labels.css";

export function BestsellerLabels() {
  const { products, refreshProducts } = useStore();
  const local = resolveRequestedProvider() === "local";
  const [authorized, setAuthorized] = useState(local);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<Record<string, boolean>>({});
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo verificar el acceso."); }
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setBusy(""); }
  }
  return <main className="label-manager">
    <h1>Etiquetas de productos</h1>
    <p>Elegí qué productos aparecen como Más vendido. No modifica precios ni stock.</p>
    {message && <p role="status">{message}</p>}
    {!authorized ? <form onSubmit={login} className="label-login">
      <h2>Acceso del equipo</h2>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="button primary" disabled={Boolean(busy)}>Ingresar</button>
    </form> : <>
      <label>Buscar por nombre o código<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="label-list">{products.filter((product) => product.active && `${product.name} ${product.code}`.toLowerCase().includes(query.toLowerCase())).map((product) => <label className="label-product" key={product.id}>
        <span><strong>{product.name}</strong><small>Cód. {product.code}</small></span>
        <span className="label-check"><input type="checkbox" checked={preview[product.id] ?? tagged.has(product.id)} disabled={Boolean(busy)} onChange={(event) => void toggle(product.id, event.target.checked)} />Más vendido</span>
      </label>)}</div>
    </>}
  </main>;
}
