"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function Footer() {
  const pathname = usePathname();
  // Igual criterio que Header: el panel admin arma su propio layout
  // (AdminShell) y no debe mostrar navegación comercial de la tienda.
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="footer">
      <div>
        <Image src="/brand/GRIS.png" alt="Litoral Maq" width={210} height={76} />
        <p>Máquinas y herramientas para tu casa, obra o taller.</p>
      </div>
      <div>
        <a href="https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8" target="_blank" rel="noopener noreferrer">
          <strong>Ubicación</strong>
        </a>
        <Link href="/productos">Productos</Link>
        <Link href="/carrito">Carrito</Link>
        <Link href="/cuenta/pedidos">Seguimiento</Link>
      </div>
      <div>
        <strong>Ayuda</strong>
        <span>Envíos a todo el país</span>
        <span>Retiro en sucursal</span>
        <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
          WhatsApp comercial
        </a>
      </div>
      <div>
        <strong>Horarios</strong>
        <span>Lunes a viernes</span>
        <span>8:00 a 17:00 hs</span>
        <span>Sábados</span>
        <span>8:30 a 12:30 hs</span>
      </div>
    </footer>
  );
}
