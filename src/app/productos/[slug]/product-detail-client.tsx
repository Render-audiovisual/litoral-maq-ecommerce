"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";

export function ProductDetailClient({ slug }: { slug: string }) {
  const { products, addToCart } = useStore();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const product = products.find((item) => item.slug === slug);
  if (!product || !product.active) {
    return <main className="center-state"><span className="state-icon">?</span><h1>Producto no encontrado</h1><Link href="/productos" className="button primary">Volver al catálogo</Link></main>;
  }
  return (
    <main className="product-detail-page">
      <div className="breadcrumbs"><Link href="/">Inicio</Link> / <Link href="/productos">Productos</Link> / <span>{product.name}</span></div>
      <section className="product-detail">
        <div className="detail-image">
          {product.image ? <Image src={product.image} alt={product.name} fill sizes="50vw" priority /> : (
            <div className="product-placeholder large"><span>LM</span><small>Imagen pendiente de carga</small></div>
          )}
        </div>
        <div className="detail-info">
          <span className="eyebrow orange">{product.brand}</span>
          <h1>{product.name}</h1>
          <span className="detail-code">Código de producto: <strong>{product.code}</strong></span>
          <strong className="detail-price">{formatCurrency(product.price)}</strong>
          <div className="availability"><span className={product.stock > 0 ? "dot green" : "dot red"} />{product.stock > 0 ? "Disponible" : "Agotado"}<small>Stock de demostración: {product.stock} unidades</small></div>
          <p className="detail-description">{product.description || "Información técnica y descripción comercial pendientes de completar desde el panel."}</p>
          <div className="buy-row">
            <div className="quantity">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((value) => Math.min(product.stock, value + 1))}>+</button>
            </div>
            <button type="button" className="button primary large" disabled={!product.stock || product.price === null} onClick={() => { addToCart(product.id, quantity); setAdded(true); }}>
              {added ? "Agregado ✓" : "Agregar al carrito"}
            </button>
          </div>
          {added && <Link href="/carrito" className="text-link">Ir al carrito →</Link>}
          <div className="purchase-benefits">
            <div><span>🚚</span><strong>Envíos</strong><small>Cotización simulada por CP</small></div>
            <div><span>💳</span><strong>Mercado Pago</strong><small>Flujo listo para conectar</small></div>
            <div><span>↻</span><strong>Compra segura</strong><small>Seguimiento del pedido</small></div>
          </div>
        </div>
      </section>
    </main>
  );
}
