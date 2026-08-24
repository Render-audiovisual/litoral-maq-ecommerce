"use client";

import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";

export default function CartPage() {
  const { cart, products, cartSubtotal, setCartQuantity } = useStore();
  const lines = cart.map((line) => ({
    ...line,
    product: products.find((product) => product.id === line.productId),
  })).filter((line) => line.product);
  return (
    <main className="standard-page">
      <div className="page-heading"><span className="eyebrow orange">TU COMPRA</span><h1>Carrito</h1></div>
      {!lines.length ? (
        <div className="empty-state roomy"><span>🛒</span><h2>Tu carrito está vacío</h2><p>Explorá el catálogo y elegí las herramientas que necesitás.</p><Link href="/productos" className="button primary">Ver productos</Link></div>
      ) : (
        <div className="cart-layout">
          <section className="cart-lines">
            {lines.map(({ product, quantity }) => product && (
              <article className="cart-line" key={product.id}>
                <div className="cart-thumb">
                  {product.image ? <Image src={product.image} alt={product.name} fill sizes="120px" /> : <span>LM</span>}
                </div>
                <div className="cart-product"><strong>{product.name}</strong><small>Cód. {product.code}</small><b>{formatCurrency(product.price)}</b></div>
                <div className="quantity">
                  <button type="button" onClick={() => setCartQuantity(product.id, quantity - 1)}>−</button>
                  <span>{quantity}</span>
                  <button type="button" onClick={() => setCartQuantity(product.id, quantity + 1)}>+</button>
                </div>
                <strong>{formatCurrency((product.price || 0) * quantity)}</strong>
                <button type="button" className="remove-button" onClick={() => setCartQuantity(product.id, 0)} aria-label={`Quitar ${product.name}`}>×</button>
              </article>
            ))}
            <Link href="/productos" className="text-link">← Seguir comprando</Link>
          </section>
          <aside className="order-summary">
            <h2>Resumen</h2>
            <div><span>Subtotal</span><strong>{formatCurrency(cartSubtotal)}</strong></div>
            <div><span>Entrega</span><span>Retiro gratis o envío a cotizar</span></div>
            <hr />
            <div className="summary-total"><span>Total parcial</span><strong>{formatCurrency(cartSubtotal)}</strong></div>
            <Link href="/checkout" className="button primary large full">Solicitar compra</Link>
            <small>Confirmamos stock y entrega antes de cobrar.</small>
          </aside>
        </div>
      )}
    </main>
  );
}
