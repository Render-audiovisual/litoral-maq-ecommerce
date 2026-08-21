"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/store/store";

export function Header() {
  const pathname = usePathname();
  const { cartCount, customerSession } = useStore();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      <div
        className="announcement"
        aria-label="Envíos a todo el país, compra segura y retiro gratis en el local"
      >
        {/* Ocho copias cubren pantallas ultrawide sin dejar huecos en el marquee. */}
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} aria-hidden="true">
            ENVÍOS A TODO EL PAÍS <b>•</b> COMPRA SEGURA <b>•</b> RETIRO GRATIS EN EL LOCAL <b>•</b>
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
          <Link href="/cuenta/pedidos" onClick={() => setOpen(false)}>
            Mis pedidos
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
