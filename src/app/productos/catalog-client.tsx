"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { useStore } from "@/store/store";

const PAGE_SIZE = 24;

export function CatalogClient() {
  const params = useSearchParams();
  const initialCategory = params.get("categoria") || "";
  const offersOnly = initialCategory === "Ofertas";
  const { products } = useStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(
    initialCategory === "Ofertas" ? "" : initialCategory,
  );
  const [sort, setSort] = useState("featured");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products
      .filter((product) => {
        const matches =
          !normalized ||
          product.name.toLowerCase().includes(normalized) ||
          product.code?.toLowerCase().includes(normalized) ||
          product.brand.toLowerCase().includes(normalized);
        return (
          product.active &&
          matches &&
          (!offersOnly || product.featured) &&
          (!category || product.category === category) &&
          (!onlyAvailable || product.stock > 0)
        );
      })
      .sort((a, b) => {
        if (sort === "price-asc") return (a.price || 0) - (b.price || 0);
        if (sort === "price-desc") return (b.price || 0) - (a.price || 0);
        if (sort === "name") return a.name.localeCompare(b.name);
        return Number(b.featured) - Number(a.featured);
      });
  }, [products, query, category, onlyAvailable, offersOnly, sort]);

  function resetVisibleCount() {
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <main className="catalog-page">
      <div className="page-hero compact">
        <span className="eyebrow orange">CATÁLOGO COMPLETO</span>
        <h1>Máquinas y herramientas</h1>
        <p>Precios y códigos importados desde la lista comercial de Litoral Maq.</p>
      </div>
      <div className="catalog-layout">
        <aside className="filters">
          <strong>Filtrar productos</strong>
          <label className="catalog-search">Buscar
            <input value={query} onChange={(event) => { setQuery(event.target.value); resetVisibleCount(); }} placeholder="Producto, marca o código" />
          </label>
          <label>Categoría
            <select value={category} onChange={(event) => { setCategory(event.target.value); resetVisibleCount(); }}>
              <option value="">Todas las categorías</option>
              {categories.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={onlyAvailable} onChange={(event) => { setOnlyAvailable(event.target.checked); resetVisibleCount(); }} />
            Solo disponibles
          </label>
          <button type="button" className="button secondary full" onClick={() => {
            setQuery(""); setCategory(""); setOnlyAvailable(false); resetVisibleCount();
          }}>Limpiar filtros</button>
        </aside>
        <section>
          <div className="catalog-toolbar">
            <span><strong>{filtered.length}</strong> productos encontrados</span>
            <select value={sort} onChange={(event) => { setSort(event.target.value); resetVisibleCount(); }}>
              <option value="featured">Destacados primero</option>
              <option value="price-asc">Menor precio</option>
              <option value="price-desc">Mayor precio</option>
              <option value="name">Nombre A–Z</option>
            </select>
          </div>
          {filtered.length ? (
            <div className="product-grid catalog-grid">
              {filtered.slice(0, visibleCount).map((product) => <ProductCard product={product} key={product.id} />)}
            </div>
          ) : (
            <div className="empty-state"><span>⌕</span><h2>No encontramos productos</h2><p>Probá con otro término o limpiá los filtros.</p></div>
          )}
          {filtered.length > visibleCount && (
            <button
              type="button"
              className="button secondary catalog-load-more"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Mostrar más productos
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
