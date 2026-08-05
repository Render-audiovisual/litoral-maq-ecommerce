"use client";

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
  const cards = categories.map((category) => {
    const items = products.filter((product) => product.category === category);
    return <article className="admin-card" key={category}><span className="category-icon">⌘</span><h2>{category}</h2><p>{items.length} productos · {items.filter((product) => product.active).length} visibles</p>{storeUrlError ? <span className="admin-domain-warning" title={storeUrlError} role="alert">⚠ Dominio de tienda mal configurado</span> : <a href={getStoreUrl(`/productos?categoria=${encodeURIComponent(category)}`)} target="_blank" rel="noopener noreferrer" className="text-link">Ver en tienda →</a>}</article>;
  });
  return <main className="admin-content"><div className="admin-heading"><div><span className="eyebrow orange">ORGANIZACIÓN</span><h1>Categorías</h1><p>Categorías inferidas del catálogo; listas para administrar en base real.</p></div></div><div className="category-admin-grid">{cards}</div></main>;
}
