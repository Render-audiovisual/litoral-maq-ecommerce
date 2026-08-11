import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/store/store";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FloatingWhatsApp } from "@/components/floating-whatsapp";

const montserrat = Montserrat({
  variable: "--font-main",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
    <html lang="es" className={montserrat.variable}>
      <body>
        <StoreProvider>
          <Header />
          {children}
          <FloatingWhatsApp />
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
