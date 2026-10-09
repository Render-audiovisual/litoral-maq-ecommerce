"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import type { Product } from "@/lib/types";
import { productPhoto, isPhotoUrl, withProductPhoto } from "@/lib/product-photos";
import { getStoreUrl } from "@/lib/domain-config";
import { paginate } from "@/lib/paginate";
import { ConflictError } from "@/lib/concurrency";
import "./photos.css";

function photoSource(photo: string) {
  return photo.startsWith("/") ? getStoreUrl(photo) : photo;
}

function PhotoPreview({ photo, name }: { photo: string; name: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? <span className="photo-unavailable">Revisar imagen</span> : (
    <Image src={photoSource(photo)} alt={name} width={72} height={72} unoptimized onError={() => setBroken(true)} />
  );
}

export default function ProductPhotosPage() {
  const { products, saveProduct, refreshProducts } = useStore();
  const [query, setQuery] = useState("");
  const [missingPage, setMissingPage] = useState(1);
  const [photoPage, setPhotoPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (editing && !dialog.current?.open) dialog.current?.showModal();
    if (!editing && dialog.current?.open) dialog.current.close();
  }, [editing]);
  useEffect(() => {
    if (editing) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshProducts().catch(() => setNotice("No se pudo actualizar el listado. Recargá para ver los últimos cambios."));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [editing, refreshProducts]);
  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = products.filter((product) => !normalized || `${product.name} ${product.code ?? ""}`.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { missing: matches.filter((product) => !productPhoto(product)), withPhoto: matches.filter((product) => productPhoto(product)) };
  }, [products, query]);

  function openEditor(product: Product) {
    setPhoto(productPhoto(product) ?? ""); setError(""); setEditing(product);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    const nextPhoto = photo.trim();
    if (!isPhotoUrl(nextPhoto)) { setError("Pegá un enlace HTTPS de una imagen o una ruta /products/ del catálogo."); return; }
    setSaving(true); setError("");
    try {
      await saveProduct(withProductPhoto(editing, nextPhoto), editing);
      setEditing(null); setNotice(`Foto guardada: ${editing.name}.`);
    } catch (failure) {
      if (failure instanceof ConflictError) {
        const latest = failure.latest as Product | undefined;
        if (latest) setEditing(latest);
        else setEditing(null);
      }
      setError(failure instanceof Error ? failure.message : "No se pudo guardar. Volvé a intentar.");
    } finally { setSaving(false); }
  }

  return <div className="admin-photo-page">
    <header className="admin-heading"><div><h1>Fotos de productos</h1><p>Encontrá las fotos pendientes y revisá las que ya están cargadas.</p></div></header>
    <label className="photo-search">Buscar por nombre o código
      <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setMissingPage(1); setPhotoPage(1); }} placeholder="Ej. taladro o 3502" />
    </label>
    {notice && <p role="status" className="photo-notice">{notice}</p>}
    {error && !editing && <p role="alert">{error}</p>}
    <div className="photo-groups">
      {([{ title: "Productos sin foto", items: groups.missing, page: missingPage, setPage: setMissingPage, missing: true },
        { title: "Productos con foto", items: groups.withPhoto, page: photoPage, setPage: setPhotoPage, missing: false }]).map((group) => {
        const current = paginate(group.items, group.page, 12);
        return <section className={`photo-group${group.missing ? " pending" : ""}`} key={group.title} aria-label={group.title}>
          <div className="photo-group-heading"><h2>{group.title}</h2><span>{group.items.length}</span></div>
          <p>{group.missing ? "Pendientes de completar." : "Revisá la foto y cambiala cuando haga falta."} Incluye productos visibles y ocultos.</p>
          {!current.total ? <p className="photo-empty">{query ? "No hay coincidencias en este grupo." : group.missing ? "Todos los productos tienen una foto cargada." : "Todavía no hay fotos cargadas."}</p> : <ul className="photo-list">
            {current.items.map((product) => {
              const image = productPhoto(product);
              return <li key={product.id}>
                <div className="photo-thumbnail">{image ? <PhotoPreview key={image} photo={image} name={product.name} /> : <span aria-hidden="true">＋</span>}</div>
                <div className="photo-product-text"><strong>{product.name}</strong><small>Cód. {product.code || "Sin código"} · {product.active ? "Visible" : "Oculto"}</small></div>
                <button className="button secondary" type="button" onClick={() => openEditor(product)} aria-label={`${image ? "Cambiar foto" : "Agregar foto"} de ${product.name}`}>{image ? "Cambiar foto" : "Agregar foto"}</button>
              </li>;
            })}
          </ul>}
          {current.pageCount > 1 && <nav className="photo-pagination" aria-label={`Paginación ${group.title.toLowerCase()}`}>
            <button type="button" disabled={current.page === 1} onClick={() => group.setPage(current.page - 1)}>Anterior</button>
            <span>{current.page} / {current.pageCount}</span>
            <button type="button" disabled={current.page === current.pageCount} onClick={() => group.setPage(current.page + 1)}>Siguiente</button>
          </nav>}
        </section>;
      })}
    </div>
    <dialog ref={dialog} className="photo-dialog" aria-labelledby="photo-dialog-title" onCancel={(event) => { event.preventDefault(); if (!saving) setEditing(null); }}>
      {editing && <form onSubmit={save}>
        <h2 id="photo-dialog-title">{productPhoto(editing) ? "Cambiar foto" : "Agregar foto"}</h2>
        <p>{editing.name} · Cód. {editing.code}</p>
        <label>Enlace de la imagen<input autoFocus value={photo} onChange={(event) => setPhoto(event.target.value)} placeholder="https://…/foto.jpg" disabled={saving} required /></label>
        <p>Usá un enlace directo a la foto. Solo se actualiza la imagen; se conserva la galería y el resto de los datos.</p>
        {isPhotoUrl(photo.trim()) && <div className="photo-editor-preview"><PhotoPreview key={photo.trim()} photo={photo.trim()} name={editing.name} /></div>}
        {error && <p role="alert">{error}</p>}
        <div className="photo-dialog-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button><button className="button" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar foto"}</button></div>
      </form>}
    </dialog>
  </div>;
}
