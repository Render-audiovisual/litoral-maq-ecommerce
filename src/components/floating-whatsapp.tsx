"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function FloatingWhatsApp() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <a
      className="floating-whatsapp"
      href={getWhatsAppUrl("Hola, tengo una consulta sobre Litoral Maq.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultar por WhatsApp"
      title="Consultar por WhatsApp"
    >
      <Image src="/icons/whatsapp.svg" alt="" width={30} height={30} aria-hidden />
    </a>
  );
}
