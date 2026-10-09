"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import {
  getLaunchBestSellerRankMap,
  LAUNCH_FAMILIES,
  matchesLaunchFamily,
} from "@/lib/launch-catalog";
import { useStore } from "@/store/store";
import { getProductAvailability } from "@/lib/product-availability";
import { searchProducts } from "@/lib/search";
import "./catalog-refined.css";

const PAGE_SIZE = 24;

export function CatalogClient() {
  const params = useSearchParams();
  const initialCategory = params.get("categoria") || "";
  const initialFamily = params.get("familia") || "";
  const initialQuery = params.get("q") || "";
  const offersOnly = initialCategory === "Ofertas";
  const { products } = useStore();
  const [query, setQuery] = useState(initialQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState(
    initialCategory === "Ofertas" ? "" : initialCategory,
  );
  const [family, setFamily] = useState(initialFamily);
  const [brand, setBrand] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [sort, setSort] = useState("featured");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const catalogProducts = useMemo(
    () => products.filter((product) => product.active),
    [products],
  );
  const winnerRanks = useMemo(() => getLaunchBestSellerRankMap(catalogProducts), [catalogProducts]);
  const availableBrands = useMemo(
    () => Array.from(new Set(
      catalogProducts
        .filter((product) => !family || matchesLaunchFamily(product, family))
        .map((product) => product.brand)
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b)),
    [catalogProducts, family],
  );
  const filtered = useMemo(() => {
    const minimum = minimumPrice === "" ? null : Number(minimumPrice);
    const maximum = maximumPrice === "" ? null : Number(maximumPrice);
    // Mismo matcher que las sugerencias del header: si el cartel ofrece
    // "ver los 23 resultados", la grilla tiene que mostrar esos 23.
    return searchProducts(catalogProducts, query)
      .filter((product) => {
        return (
          product.active &&
          (!offersOnly || winnerRanks.has(product.id)) &&
          (!family || matchesLaunchFamily(product, family)) &&
          (!brand || product.brand === brand) &&
          (minimum === null || (product.price !== null && product.price >= minimum)) &&
          (maximum === null || (product.price !== null && product.price <= maximum)) &&
          (!category || product.category === category) &&
          (!onlyAvailable || getProductAvailability(product) === "available")
        );
      })
      .sort((a, b) => {
        if (sort === "price-asc") return (a.price || 0) - (b.price || 0);
        if (sort === "price-desc") return (b.price || 0) - (a.price || 0);
        if (sort === "name") return a.name.localeCompare(b.name);
        const rankA = winnerRanks.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rankB = winnerRanks.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return rankA - rankB || Number(b.featured) - Number(a.featured) || b.stock - a.stock;
      });
  }, [catalogProducts, query, family, brand, minimumPrice, maximumPrice, category, onlyAvailable, offersOnly, sort, winnerRanks]);

  function resetVisibleCount() {
    setVisibleCount(PAGE_SIZE);
  }

  // Cuántos filtros (además de la búsqueda) hay aplicados: se muestra en el botón "Filtros" del celular.
  const activeFilterCount = [category, family, brand, minimumPrice, maximumPrice, onlyAvailable ? "1" : ""].filter(Boolean).length;

  function clearFilters() {
    setQuery(""); setFamily(""); setBrand(""); setMinimumPrice(""); setMaximumPrice(""); setCategory(""); setOnlyAvailable(false); resetVisibleCount();
  }

  return (
    <main className="catalog-page catalog-refined">
      <div className="catalog-layout">
        <aside className="filters">
          <div className="filters-head">
            <strong>Filtrar productos</strong>
            <button
              type="button"
              className="filters-toggle"
              aria-expanded={filtersOpen}
              aria-controls="catalog-more-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
          </div>
          <label className="catalog-search">Buscar productos
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); resetVisibleCount(); }} placeholder="¿Qué estás buscando? Ej. taladro, escalera…" />
          </label>
          <div className="catalog-category-shortcuts" role="group" aria-label="Accesos rápidos del catálogo">
            <button type="button" aria-pressed={!family && !category} onClick={() => { setFamily(""); setCategory(""); setBrand(""); resetVisibleCount(); }}>Todos</button>
            {LAUNCH_FAMILIES.map((item) => <button type="button" key={item.slug} aria-pressed={family === item.slug} onClick={() => { setFamily(item.slug); setCategory(""); setBrand(""); resetVisibleCount(); }}>{item.label}</button>)}
          </div>
          {(query || activeFilterCount > 0) && <div className="catalog-active-filters" aria-label="Filtros aplicados">
            {query && <button type="button" onClick={() => { setQuery(""); resetVisibleCount(); }}>Búsqueda: {query} ×</button>}
            {family && <button type="button" onClick={() => { setFamily(""); setBrand(""); resetVisibleCount(); }}>{LAUNCH_FAMILIES.find((item) => item.slug === family)?.label ?? family} ×</button>}
            {category && <button type="button" onClick={() => { setCategory(""); resetVisibleCount(); }}>{category} ×</button>}
            {brand && <button type="button" onClick={() => { setBrand(""); resetVisibleCount(); }}>{brand} ×</button>}
            {(minimumPrice || maximumPrice) && <button type="button" onClick={() => { setMinimumPrice(""); setMaximumPrice(""); resetVisibleCount(); }}>Precio {minimumPrice || "0"} – {maximumPrice || "sin límite"} ×</button>}
            {onlyAvailable && <button type="button" onClick={() => { setOnlyAvailable(false); resetVisibleCount(); }}>Con stock ×</button>}
            <button type="button" className="catalog-clear-all" onClick={clearFilters}>Limpiar todo</button>
          </div>}
          <div id="catalog-more-filters" className={filtersOpen ? "filters-more open" : "filters-more"}>
          <label>Categoría
            <select value={family} onChange={(event) => { setFamily(event.target.value); setBrand(""); resetVisibleCount(); }}>
              <option value="">Todas las categorías</option>
              {LAUNCH_FAMILIES.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}
            </select>
          </label>
          <label>Marca
            <select value={brand} onChange={(event) => { setBrand(event.target.value); resetVisibleCount(); }}>
              <option value="">Todas las marcas</option>
              {availableBrands.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <div className="price-filter-grid">
            <label>Precio mínimo
              <input type="number" min="0" step="1000" inputMode="numeric" value={minimumPrice} onChange={(event) => { setMinimumPrice(event.target.value); resetVisibleCount(); }} placeholder="$ 0" />
            </label>
            <label>Precio máximo
              <input type="number" min="0" step="1000" inputMode="numeric" value={maximumPrice} onChange={(event) => { setMaximumPrice(event.target.value); resetVisibleCount(); }} placeholder="Sin límite" />
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={onlyAvailable} onChange={(event) => { setOnlyAvailable(event.target.checked); resetVisibleCount(); }} />
            Solo con stock confirmado
          </label>
          <button type="button" className="button secondary full" onClick={clearFilters}>Limpiar filtros</button>
          </div>
        </aside>
        <section>
          <div className="catalog-toolbar">
            <span role="status" aria-live="polite"><strong>{filtered.length}</strong> productos encontrados</span>
            <div className="catalog-sort-options" role="group" aria-label="Ordenar productos">
              <span>Ordenar por</span>
              {[
                { value: "featured", label: "Destacados" },
                { value: "price-asc", label: "Menor precio" },
                { value: "price-desc", label: "Mayor precio" },
                { value: "name", label: "Nombre A–Z" },
              ].map((option) => <button type="button" key={option.value} aria-pressed={sort === option.value} onClick={() => { setSort(option.value); resetVisibleCount(); }}>{option.label}</button>)}
            </div>
          </div>
          {filtered.length ? (
            <div className="product-grid catalog-grid">
              {filtered.slice(0, visibleCount).map((product) => {
                const winnerRank = winnerRanks.get(product.id);
                return <ProductCard product={product} badge={winnerRank ? "Más vendido" : undefined} key={product.id} />;
              })}
            </div>
          ) : (
            <div className="catalog-empty">
              <h2>No encontramos productos</h2>
              <p>Probá con otra palabra, buscá por marca o código, o quitá algún filtro.</p>
              <button type="button" className="button secondary" onClick={clearFilters}>Limpiar filtros</button>
            </div>
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
