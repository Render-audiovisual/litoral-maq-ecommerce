"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { isValidAdminSession, isValidCustomerSession } from "@/lib/auth";
import { getStoreUrl } from "@/lib/domain-config";
import { isAdminLoginPath } from "@/lib/admin-routing";
import { resolveRequestedProvider } from "@/services/provider";
import { getAuthAdapter, supportsSessionRestore } from "@/services/auth";

// Un solo set de iconos (trazo 1,75, 24×24, currentColor) para todo el menú.
const links: [string, string, React.ReactNode][] = [
  ["/admin", "Resumen", <><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>],
  ["/admin/productos", "Productos", <><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="m7.5 4.27 9 5.15" /></>],
  ["/admin/pedidos", "Pedidos", <><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></>],
  ["/admin/categorias", "Categorías", <><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></>],
  ["/admin/clientes", "Clientes", <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>],
  ["/admin/configuracion", "Configuración", <><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" /></>],
];

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="admin-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const ADMIN_LOGIN_PATH = "/admin/login";
const SESSION_RESTORE_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("La verificación de sesión agotó el tiempo de espera.")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { adminSession, customerSession, orders, ready, setAdminSession, signOutAdmin } = useStore();
  // El hosting estático puede servir esta página como /admin/login/.
  // Ambas URL deben quedar fuera del shell; de otro modo el formulario se
  // monta dentro del panel autenticado y las dos interfaces se superponen.
  const isLoginRoute = isAdminLoginPath(pathname);
  const loggingOutRef = useRef(false);
  const [authCheck, setAuthCheck] = useState(0);
  const pendingOrderCount = useMemo(
    () => orders.filter((order) => order.status === "pendiente").length,
    [orders],
  );

  useEffect(() => {
    if (isValidAdminSession(adminSession)) loggingOutRef.current = false;
  }, [adminSession]);

  useEffect(() => {
    if (isLoginRoute || !ready || loggingOutRef.current) return;

    // React no vuelve a renderizar solo porque Date.now() alcanzó el
    // expiresAt guardado. Programamos una comprobación exacta y otra al
    // regresar a la pestaña, cubriendo suspensión del equipo y pestañas
    // inactivas sin depender del refresco periódico de pedidos.
    const delay = adminSession?.expiresAt
      ? Math.max(0, adminSession.expiresAt - Date.now() + 50)
      : 0;
    const timer = window.setTimeout(() => setAuthCheck((value) => value + 1), delay);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") setAuthCheck((value) => value + 1);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ready, adminSession, isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute || !ready || loggingOutRef.current) return;
    if (isValidAdminSession(adminSession)) return;

    let cancelled = false;
    const verifyAccess = async () => {
      try {
        const authAdapter = getAuthAdapter();
        const restored = supportsSessionRestore(authAdapter)
          ? await withTimeout(authAdapter.restoreSession(), SESSION_RESTORE_TIMEOUT_MS)
          : null;
        if (cancelled) return;
        if (isValidAdminSession(restored)) {
          await setAdminSession(restored);
          return;
        }
      } catch (error) {
        console.warn("No se pudo renovar la sesión administrativa.", error);
      }
      if (cancelled) return;
      if (adminSession) await setAdminSession(null);
      const insufficientPermission = isValidCustomerSession(customerSession);
      router.replace(
        `${ADMIN_LOGIN_PATH}?${insufficientPermission ? "denied=1&" : ""}next=${encodeURIComponent(pathname)}`,
      );
    };
    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [ready, adminSession, customerSession, pathname, router, isLoginRoute, setAdminSession, authCheck]);

  async function logout() {
    loggingOutRef.current = true;
    try {
      await signOutAdmin();
      router.replace(ADMIN_LOGIN_PATH);
    } catch {
      loggingOutRef.current = false;
    }
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
        <div className="admin-brand">
          <Link href="/admin" className="admin-logo">
            <Image src="/brand/AZUL.png" alt="Litoral Maq" width={155} height={56} priority />
          </Link>
          <span className="admin-kicker">Panel de administración</span>
        </div>
        <nav aria-label="Secciones del panel">
          {links.map(([href, label, icon]) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
            return (
              <Link href={href} key={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                <NavIcon>{icon}</NavIcon>
                <span>{label}</span>
                {href === "/admin/pedidos" && pendingOrderCount > 0 && <b className="nav-notification-badge">{pendingOrderCount}</b>}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className="sidebar-logout"
          onClick={logout}
        >
          <NavIcon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></NavIcon>
          Cerrar sesión
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-context">
            <strong>Gestión Litoral Maq</strong>
            <span>
              {resolveRequestedProvider() === "supabase"
                ? "Datos reales — Supabase"
                : "Datos demo persistidos en este navegador"}
            </span>
          </div>
          <div className="admin-topbar-actions">
            <Link href="/admin/pedidos" className={pendingOrderCount > 0 ? "admin-notification active" : "admin-notification"} aria-label={`${pendingOrderCount} pedidos pendientes`}><span className="admin-notification-dot" aria-hidden="true" /><strong>{pendingOrderCount}</strong> por revisar</Link>
            {isExternalStoreLink ? (
              <a href={storeUrl} className="button secondary" target="_blank" rel="noopener noreferrer">
                Ver tienda
              </a>
            ) : (
              <Link href={storeUrl} className="button secondary">
                Ver tienda
              </Link>
            )}
          </div>
          {storeUrlError && (
            <span className="admin-domain-warning" title={storeUrlError} role="alert">
              Dominio de tienda mal configurado
            </span>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
