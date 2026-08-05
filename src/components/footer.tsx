"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  // Igual criterio que Header: el panel admin arma su propio layout
  // (AdminShell) y no debe mostrar navegación comercial de la tienda.
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="footer">
      <div>
        <Image src="/brand/GRIS.png" alt="Litoral Maq" width={170} height={62} />
        <p>Máquinas y herramientas para tu casa, obra o taller.</p>
      </div>
      <div>
        <strong>Comprar</strong>
        <Link href="/productos">Catálogo</Link>
        <Link href="/carrito">Carrito</Link>
        <Link href="/cuenta/pedidos">Seguimiento</Link>
      </div>
      <div>
        <strong>Ayuda</strong>
        <span>Envíos a todo el país</span>
        <span>Retiro en sucursal</span>
        <span>WhatsApp comercial</span>
      </div>
    </footer>
  );
}
