"use client";

import Link from "next/link";
import { useStore } from "@/store/store";

export default function AdminCategoriesPage() {
  const { products } = useStore();
  const categories = [...new Set(products.map((product) => product.category))].sort();
  return <main className="admin-content"><div className="admin-heading"><div><span className="eyebrow orange">ORGANIZACIÓN</span><h1>Categorías</h1><p>Categorías inferidas del catálogo; listas para administrar en base real.</p></div></div><div className="category-admin-grid">{categories.map((category) => { const items = products.filter((product) => product.category === category); return <article className="admin-card" key={category}><span className="category-icon">⌘</span><h2>{category}</h2><p>{items.length} productos · {items.filter((product) => product.active).length} visibles</p><Link href={`/productos?categoria=${encodeURIComponent(category)}`} className="text-link">Ver en tienda →</Link></article>; })}</div></main>;
}
