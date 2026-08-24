"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useStore } from "@/store/store";
import { isValidCustomerSession } from "@/lib/auth";
import { selectOwnOrders } from "@/lib/orders";
import { isActiveOrder } from "@/lib/order-details";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount, customerSession, orders } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeOrderCount = isValidCustomerSession(customerSession)
    ? selectOwnOrders(orders, customerSession).filter(isActiveOrder).length
    : 0;
  if (pathname.startsWith("/admin")) return null;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(normalized ? `/productos?q=${encodeURIComponent(normalized)}` : "/productos");
    setOpen(false);
  }

  return (
    <>
      <div className="announcement">
        {/* ponytail: 8 copias cubren hasta ~2900px de ancho; si aparece un hueco en pantallas mas grandes, subir el numero */}
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} aria-hidden={i > 0}>
            Envíos a todo el país · Compra segura · Atención personalizada
          </span>
        ))}
      </div>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Litoral Maq, inicio">
          <Image
            src="/brand/AZUL.png"
            alt="Litoral Maq"
            width={176}
            height={64}
            priority
          />
        </Link>
        <form className="header-search" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="site-search">Buscar en el catálogo</label>
          <input
            id="site-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar productos, marcas o categorías"
            autoComplete="off"
          />
          <button type="submit" aria-label="Buscar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </button>
        </form>
        <nav className={open ? "nav open" : "nav"} aria-label="Navegación principal">
          <Link href="/" onClick={() => setOpen(false)}>
            Inicio
          </Link>
          <Link href="/productos" onClick={() => setOpen(false)}>
            Productos
          </Link>
          <Link href="/productos?categoria=Ofertas" onClick={() => setOpen(false)}>
            Ofertas
          </Link>
          <Link href="/cuenta/pedidos" className="nav-orders-link" onClick={() => setOpen(false)}>
            Mis pedidos {activeOrderCount > 0 && <b>{activeOrderCount}</b>}
          </Link>
        </nav>
        <div className="header-actions">
          <Link href={customerSession ? "/cuenta/pedidos" : "/login"} className="icon-link">
            <span aria-hidden>◎</span>
            <span className="desktop-only">
              {customerSession ? customerSession.user.name.split(" ")[0] : "Ingresar"}
            </span>
          </Link>
          <Link href="/carrito" className="cart-link" aria-label={`Carrito, ${cartCount} productos`}>
            <Image src="/icons/cart.svg" alt="" width={22} height={22} aria-hidden />
            {cartCount > 0 && <strong>{cartCount}</strong>}
          </Link>
          <button
            type="button"
            className="menu-button"
            aria-label="Abrir menú"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            ☰
          </button>
        </div>
      </header>
    </>
  );
}
