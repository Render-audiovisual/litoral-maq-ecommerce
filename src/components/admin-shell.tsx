"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useStore } from "@/store/store";
import { isValidAdminSession, isValidCustomerSession } from "@/lib/auth";
import { getStoreUrl } from "@/lib/domain-config";
import { resolveRequestedProvider } from "@/services/provider";

const links = [
  ["/admin", "Resumen", "◫"],
  ["/admin/productos", "Productos", "▦"],
  ["/admin/pedidos", "Pedidos", "▤"],
  ["/admin/categorias", "Categorías", "⌘"],
  ["/admin/clientes", "Clientes", "◎"],
  ["/admin/configuracion", "Configuración", "⚙"],
];

const ADMIN_LOGIN_PATH = "/admin/login";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { adminSession, customerSession, ready, setAdminSession } = useStore();
  const isLoginRoute = pathname === ADMIN_LOGIN_PATH;
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (isValidAdminSession(adminSession)) loggingOutRef.current = false;
  }, [adminSession]);

  useEffect(() => {
    if (isLoginRoute || !ready || loggingOutRef.current) return;
    if (isValidAdminSession(adminSession)) return;
    if (adminSession) setAdminSession(null);
    const insufficientPermission = isValidCustomerSession(customerSession);
    router.replace(
      `${ADMIN_LOGIN_PATH}?${insufficientPermission ? "denied=1&" : ""}next=${encodeURIComponent(pathname)}`,
    );
  }, [ready, adminSession, customerSession, pathname, router, isLoginRoute, setAdminSession]);

  function logout() {
    loggingOutRef.current = true;
    setAdminSession(null);
    router.replace(ADMIN_LOGIN_PATH);
  }

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (!ready || !isValidAdminSession(adminSession)) {
    return (
      <main className="center-state">
        <div className="spinner" />
        <p>Verificando acceso al panel…</p>
      </main>
    );
  }

  // Único enlace configurable "volver a la tienda" (§4.2 del pedido de
  // Etapa 6): con NEXT_PUBLIC_STORE_DOMAIN configurada, cruza al dominio
  // real de la tienda (necesario porque, desplegado por separado, el
  // artefacto admin no contiene ninguna página de tienda — un <Link>
  // interno a "/" ahí daría 404). Sin configurar (desarrollo local, mismo
  // origen), cae a una ruta relativa. Si la variable está presente pero mal
  // formada, no arma un link roto en silencio: lo muestra como error visible.
  let storeUrl = "/";
  let storeUrlError: string | null = null;
  try {
    storeUrl = getStoreUrl("/");
  } catch (error) {
    storeUrlError = error instanceof Error ? error.message : String(error);
  }
  const isExternalStoreLink = storeUrl.startsWith("http");

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        {/* El logo no navega a la tienda: es el mismo panel admin, nunca
            un segundo enlace comercial (ver punto 8 del pedido). */}
        <Link href="/admin" className="admin-logo">
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
          onClick={logout}
        >
          Cerrar sesión
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <strong>Gestión Litoral Maq</strong>
            <span>
              {resolveRequestedProvider() === "supabase"
                ? "Datos reales — Supabase"
                : "Datos demo persistidos en este navegador"}
            </span>
          </div>
          {isExternalStoreLink ? (
            <a href={storeUrl} className="button secondary" target="_blank" rel="noopener noreferrer">
              Ver tienda
            </a>
          ) : (
            <Link href={storeUrl} className="button secondary">
              Ver tienda
            </Link>
          )}
          {storeUrlError && (
            <span className="admin-domain-warning" title={storeUrlError} role="alert">
              ⚠ Dominio de tienda mal configurado
            </span>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
