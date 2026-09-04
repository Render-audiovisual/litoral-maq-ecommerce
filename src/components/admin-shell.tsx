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

const links = [
  ["/admin", "Resumen", "◫"],
  ["/admin/productos", "Productos", "▦"],
  ["/admin/pedidos", "Pedidos", "▤"],
  ["/admin/categorias", "Categorías", "⌘"],
  ["/admin/clientes", "Clientes", "◎"],
  ["/admin/configuracion", "Configuración", "⚙"],
];

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
              {href === "/admin/pedidos" && pendingOrderCount > 0 && <b className="nav-notification-badge">{pendingOrderCount}</b>}
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
          <div className="admin-topbar-actions">
            <Link href="/admin/pedidos" className={pendingOrderCount > 0 ? "admin-notification active" : "admin-notification"} aria-label={`${pendingOrderCount} pedidos pendientes`}><span aria-hidden>●</span><strong>{pendingOrderCount}</strong><small>por revisar</small></Link>
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
              ⚠ Dominio de tienda mal configurado
            </span>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
