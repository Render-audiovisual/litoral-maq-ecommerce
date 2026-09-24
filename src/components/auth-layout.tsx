import Image from "next/image";
import type { ReactNode } from "react";

const BENEFITS: { text: string; icon: ReactNode }[] = [
  {
    text: "Seguí el estado de cada pedido",
    icon: <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5l8 4.5 8-4.5M12 12v9" />,
  },
  {
    text: "Retiro gratis en Sáenz 1587",
    icon: <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  },
  {
    text: "Envíos a todo el país",
    icon: <path d="M3 6.5h11v9H3v-9Zm11 3h3.8l3.2 3.2v2.8h-7M7 18.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm10 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" />,
  },
];

/**
 * Marco común del ingreso de clientes: panel de marca a la izquierda (se
 * oculta en celular) y la tarjeta del formulario a la derecha. Login,
 * registro, recuperación y confirmaciones comparten este mismo layout.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page customer-auth">
      <aside className="auth-panel visual" aria-label="Tu cuenta en Litoral Maq">
        <span className="auth-logo">
          <Image src="/brand/AZUL.png" alt="Litoral Maq" width={186} height={186} />
        </span>
        <p className="auth-visual-title">Todo tu taller, en un solo lugar.</p>
        <p className="auth-visual-lead">Con tu cuenta guardás tus pedidos y comprás más rápido la próxima vez.</p>
        <ul className="auth-benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit.text}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">{benefit.icon}</svg>
              {benefit.text}
            </li>
          ))}
        </ul>
      </aside>
      <section className="auth-panel form">
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}
