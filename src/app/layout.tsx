import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/store/store";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FloatingWhatsApp } from "@/components/floating-whatsapp";
import { TabTitleAlert } from "@/components/tab-title-alert";
import { readStoreDomain } from "@/lib/domain-config";

const montserrat = Montserrat({
  variable: "--font-main",
  subsets: ["latin"],
});

const storeDomain = readStoreDomain();

export const metadata: Metadata = {
  // Sin NEXT_PUBLIC_STORE_DOMAIN (desarrollo local) no hay dominio base que
  // declarar. Solo fija metadataBase: el canonical de cada ruta lo declara
  // esa ruta (ver src/app/page.tsx) — ponerlo acá cascadearía "/" a todas
  // las páginas hijas, incluida cada ficha de producto y el propio admin.
  ...(storeDomain.status === "ok"
    ? { metadataBase: new URL(storeDomain.url) }
    : {}),
  title: {
    default: "Litoral Maq | Máquinas y herramientas",
    template: "%s | Litoral Maq",
  },
  description:
    "Catálogo online de máquinas y herramientas con compra y envío a todo el país.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={montserrat.variable} data-scroll-behavior="smooth">
      <body>
        <StoreProvider>
          <Header />
          {children}
          <FloatingWhatsApp />
          <TabTitleAlert />
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
