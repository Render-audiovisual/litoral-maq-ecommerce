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
      <div className="footer-brand">
        <Image src="/brand/GRIS.png" alt="Litoral Maq" width={190} height={69} />
        <p>Máquinas y herramientas para tu casa, obra o taller.</p>
      </div>

      <nav className="footer-nav">
        <a href="https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8" target="_blank" rel="noopener noreferrer">
          Ubicación
        </a>
        <span>Lun a Vie 8 a 17 hs · Sáb 8:30 a 12:30 hs</span>
        <Link href="/productos">Productos</Link>
        <Link href="/cuenta/pedidos">Seguimiento</Link>
        <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
          WhatsApp comercial
        </a>
      </nav>

      <div className="footer-bottom">
        <span>Design by Render</span>
        <div className="footer-social">
          <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.7.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2 1 2.4c.1.2 1.6 2.5 3.9 3.4.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3Z" />
            </svg>
          </a>
          <a href="https://www.instagram.com/litoralmaq/?hl=es" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.62c-3.14 0-3.5.01-4.73.07-.99.04-1.53.21-1.89.35-.47.18-.81.4-1.16.75-.35.35-.57.69-.75 1.16-.14.36-.31.9-.35 1.89-.06 1.23-.07 1.59-.07 4.73s.01 3.5.07 4.73c.04.99.21 1.53.35 1.89.18.47.4.81.75 1.16.35.35.69.57 1.16.75.36.14.9.31 1.89.35 1.23.06 1.59.07 4.73.07s3.5-.01 4.73-.07c.99-.04 1.53-.21 1.89-.35.47-.18.81-.4 1.16-.75.35-.35.57-.69.75-1.16.14-.36.31-.9.35-1.89.06-1.23.07-1.59.07-4.73s-.01-3.5-.07-4.73c-.04-.99-.21-1.53-.35-1.89-.18-.47-.4-.81-.75-1.16-.35-.35-.69-.57-1.16-.75-.36-.14-.9-.31-1.89-.35C15.5 3.79 15.14 3.78 12 3.78Zm0 4.15a4.07 4.07 0 1 1 0 8.14 4.07 4.07 0 0 1 0-8.14Zm0 1.62a2.45 2.45 0 1 0 0 4.9 2.45 2.45 0 0 0 0-4.9Zm5.19-1.8a.95.95 0 1 1-1.9 0 .95.95 0 0 1 1.9 0Z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
