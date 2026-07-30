"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/store/store";

const links = [
  ["/admin", "Resumen", "◫"],
  ["/admin/productos", "Productos", "▦"],
  ["/admin/pedidos", "Pedidos", "▤"],
  ["/admin/categorias", "Categorías", "⌘"],
  ["/admin/clientes", "Clientes", "◎"],
  ["/admin/configuracion", "Configuración", "⚙"],
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready, setSession } = useStore();

  useEffect(() => {
    if (ready && session?.user.role !== "admin") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, session, pathname, router]);

  if (!ready || session?.user.role !== "admin") {
    return (
      <main className="center-state">
        <div className="spinner" />
        <p>Verificando acceso al panel…</p>
      </main>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-logo">
          <Image src="/brand/AZUL.png" alt="Litoral Maq" width={155} height={56} />
        </Link>
        <span className="admin-kicker">Panel de administración</span>
        <nav>
          {links.map(([href, label, icon]) => (
            <Link
              href={href}
              key={href}
              className={
                pathname === href ||
                (href !== "/admin" && pathname.startsWith(`${href}/`))
                  ? "active"
                  : ""
              }
            >
              <span>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="sidebar-logout"
          onClick={() => {
            setSession(null);
            router.push("/");
          }}
        >
          Cerrar sesión
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <strong>Gestión Litoral Maq</strong>
            <span>Datos demo persistidos en este navegador</span>
          </div>
          <Link href="/" className="button secondary">
            Ver tienda
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
