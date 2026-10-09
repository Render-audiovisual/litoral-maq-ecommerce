"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import type { Product } from "@/lib/types";
import { productPhoto, isPhotoUrl, productGallery, withProductGallery } from "@/lib/product-photos";
import { uploadProductPhoto } from "@/services/product-photo-upload";
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
  const [selectedGroup, setSelectedGroup] = useState<"missing" | "withPhoto" | null>(null);
  const [missingPage, setMissingPage] = useState(1);
  const [photoPage, setPhotoPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [photo, setPhoto] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
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
    setPhoto(""); setGallery(productGallery(product)); setError(""); setEditing(product);
  }
  async function loadFiles(files: FileList | null, replace?: number) {
    if (!editing || !files?.length || uploading) return;
    if ((replace === undefined && gallery.length + files.length > 3) || (replace !== undefined && files.length > 1)) {
      setError("Podés guardar hasta 3 fotos. Para reemplazar, elegí una sola."); return;
    }
    setUploading(true); setError("");
    try {
      const next = [...gallery];
      // Keep each successful upload in the editor even if a later file fails.
      for (const file of Array.from(files)) {
        const url = await uploadProductPhoto(editing.id, file);
        if (replace !== undefined) next[replace] = url; else next.push(url);
        setGallery([...next]);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo subir."); }
    finally { setUploading(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving || uploading) return;
    const nextPhoto = photo.trim();
    if (nextPhoto && !isPhotoUrl(nextPhoto)) { setError("Pegá un enlace HTTPS de una imagen o una ruta /products/ del catálogo."); return; }
    const photos = [...new Set([...gallery, ...(nextPhoto ? [nextPhoto] : [])])];
    if (!photos.length || photos.length > 3) { setError("Guardá entre 1 y 3 fotos. Quitá las adicionales si tenés más de 3."); return; }
    setSaving(true); setError("");
    try {
      await saveProduct(withProductGallery(editing, photos), editing);
      setSelectedGroup("withPhoto");
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
    <div className="photo-containers" role="group" aria-label="Estado de fotos">
      {([{ key: "missing", label: "Productos sin foto", hint: "Completar fotos pendientes", count: groups.missing.length },
        { key: "withPhoto", label: "Productos con foto", hint: "Revisar o cambiar fotos", count: groups.withPhoto.length }] as const).map((group) => <button
          key={group.key} type="button" className={`photo-container ${group.key}`}
          aria-pressed={selectedGroup === group.key} aria-expanded={selectedGroup === group.key} aria-controls="photo-selected-list"
          onClick={() => setSelectedGroup((current) => current === group.key ? null : group.key)}>
          <span className="photo-container-count">{group.count}</span>
          <strong>{group.label}</strong><span>{group.hint}</span><span className="photo-container-action">{selectedGroup === group.key ? "Cerrar listado ↑" : "Ver productos →"}</span>
        </button>)}
    </div>
    <div className="photo-groups" id="photo-selected-list">
      {([{ title: "Productos sin foto", items: groups.missing, page: missingPage, setPage: setMissingPage, missing: true },
        { title: "Productos con foto", items: groups.withPhoto, page: photoPage, setPage: setPhotoPage, missing: false }]).map((group) => {
        if ((group.missing ? "missing" : "withPhoto") !== selectedGroup) return null;
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
    <dialog ref={dialog} className="photo-dialog" aria-labelledby="photo-dialog-title" onCancel={(event) => { event.preventDefault(); if (!saving && !uploading) setEditing(null); }}>
      {editing && <form onSubmit={save}>
        <h2 id="photo-dialog-title">{productPhoto(editing) ? "Cambiar foto" : "Agregar foto"}</h2>
        <p>{editing.name} · Cód. {editing.code}</p>
        <fieldset disabled={saving || uploading} className="photo-upload-fields">
          <label className="photo-file-button">Subir desde archivos o galería
            <input autoFocus type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={gallery.length >= 3 || saving || uploading} onChange={(event) => { void loadFiles(event.target.files); event.target.value = ""; }} />
          </label>
          <p>{gallery.length}/3 fotos · JPG, PNG o WebP · Hasta 5 MB cada una.</p>
          <div className="photo-gallery-editor">
            {gallery.map((image, index) => <div className="photo-gallery-item" key={`${index}-${image}`}>
              <div className="photo-editor-preview"><PhotoPreview photo={image} name={`${editing.name}, foto ${index + 1}`} /></div>
              <strong>{index === 0 ? "Principal" : `Foto ${index + 1}`}</strong>
              {index > 0 && <button type="button" onClick={() => setGallery([image, ...gallery.filter((_, i) => i !== index)])}>Usar como principal</button>}
              <label>Reemplazar<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void loadFiles(event.target.files, index); event.target.value = ""; }} /></label>
              <button type="button" onClick={() => setGallery(gallery.filter((_, i) => i !== index))}>Quitar del producto</button>
            </div>)}
          </div>
          <label>Enlace de la imagen (opcional)<input value={photo} onChange={(event) => setPhoto(event.target.value)} placeholder="https://…/foto.jpg" /></label>
        </fieldset>
        <p>Solo cambian las fotos. Precio y stock se conservan. Los cambios se aplican al guardar.</p>
        {uploading && <p role="status">Subiendo foto…</p>}
        {isPhotoUrl(photo.trim()) && <div className="photo-editor-preview"><PhotoPreview key={photo.trim()} photo={photo.trim()} name={editing.name} /></div>}
        {error && <p role="alert">{error}</p>}
        <div className="photo-dialog-actions"><button type="button" className="button secondary" disabled={saving || uploading} onClick={() => setEditing(null)}>Cancelar</button><button className="button" type="submit" disabled={saving || uploading}>{saving ? "Guardando…" : "Guardar foto"}</button></div>
      </form>}
    </dialog>
  </div>;
}
