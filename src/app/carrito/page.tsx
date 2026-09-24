"use client";

import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { getPurchaseLimit } from "@/lib/purchase-limits";
import { isMercadoPagoEnabled } from "@/services/payments";

export default function CartPage() {
  const { cart, products, cartSubtotal, setCartQuantity } = useStore();
  const lines = cart
    .map((line) => ({
      ...line,
      product: products.find((product) => product.id === line.productId),
    }))
    .filter((line) => line.product);
  const units = lines.reduce((total, line) => total + line.quantity, 0);
  return (
    <main className="standard-page cart-page">
      <div className="page-heading">
        <h1>Carrito</h1>
        {lines.length > 0 && (
          <p>
            {units} {units === 1 ? "unidad" : "unidades"} de {lines.length}{" "}
            {lines.length === 1 ? "producto" : "productos"}
          </p>
        )}
      </div>
      {!lines.length ? (
        <div className="cart-empty">
          <span className="cart-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="18" cy="20" r="1.5" />
              <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" />
            </svg>
          </span>
          <h2>Tu carrito está vacío</h2>
          <p>Explorá el catálogo y elegí las herramientas que necesitás.</p>
          <Link href="/productos" className="button primary">
            Ver productos
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <section className="cart-lines" aria-label="Productos en el carrito">
            {lines.map(
              ({ product, quantity }) =>
                product && (
                  <article className="cart-line" key={product.id}>
                    <Link
                      href={`/producto?slug=${encodeURIComponent(product.slug)}`}
                      className="cart-thumb"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {product.image ? (
                        <Image
                          src={product.image}
                          alt=""
                          fill
                          sizes="96px"
                        />
                      ) : (
                        <span>LM</span>
                      )}
                    </Link>
                    <div className="cart-product">
                      <Link href={`/producto?slug=${encodeURIComponent(product.slug)}`}>
                        {product.name}
                      </Link>
                      <small>Cód. {product.code}</small>
                      <span>{formatCurrency(product.price)} c/u</span>
                    </div>
                    <div className="cart-line-controls">
                      <div className="cart-qty" role="group" aria-label={`Cantidad de ${product.name}`}>
                        <button
                          type="button"
                          aria-label="Restar una unidad"
                          onClick={() =>
                            setCartQuantity(product.id, quantity - 1)
                          }
                        >
                          −
                        </button>
                        <output aria-live="polite">{quantity}</output>
                        <button
                          type="button"
                          aria-label="Sumar una unidad"
                          disabled={quantity >= getPurchaseLimit(product)}
                          onClick={() =>
                            setCartQuantity(product.id, quantity + 1)
                          }
                        >
                          +
                        </button>
                      </div>
                      <strong className="cart-line-total">
                        {formatCurrency((product.price || 0) * quantity)}
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => setCartQuantity(product.id, 0)}
                      aria-label={`Quitar ${product.name}`}
                      title="Quitar del carrito"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3" />
                        <path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                      </svg>
                    </button>
                  </article>
                ),
            )}
            <Link href="/productos" className="cart-back">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 12H5M11 6l-6 6 6 6" />
              </svg>
              Seguir comprando
            </Link>
          </section>
          <aside className="order-summary">
            <h2>Resumen</h2>
            <div>
              <span>Subtotal</span>
              <strong>{formatCurrency(cartSubtotal)}</strong>
            </div>
            <div>
              <span>Entrega</span>
              <span>Retiro gratis o envío a cotizar</span>
            </div>
            <hr />
            <div className="summary-total">
              <span>Total parcial</span>
              <strong>{formatCurrency(cartSubtotal)}</strong>
            </div>
            <Link href="/checkout" className="button primary full">
              Iniciar compra
            </Link>
            <small>
              {isMercadoPagoEnabled()
                ? "Pagás seguro con Mercado Pago: cuotas, débito o dinero en cuenta."
                : "Enviás la solicitud sin cargo y coordinamos el pago con vos."}
            </small>
          </aside>
        </div>
      )}
    </main>
  );
}
