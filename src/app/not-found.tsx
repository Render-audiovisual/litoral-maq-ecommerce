import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <main className="center-state">
      <div className="cart-empty">
        <span className="cart-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.4-4.4" />
          </svg>
        </span>
        <h1>No encontramos esta página</h1>
        <p>El enlace puede estar mal escrito o la página ya no existe. Seguí desde el catálogo.</p>
        <Link href="/productos" className="button primary">
          Ver productos
        </Link>
      </div>
    </main>
  );
}
