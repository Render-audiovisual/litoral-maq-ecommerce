"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readAuthErrorFromUrl } from "@/lib/auth-callbacks";
import { getAuthAdapter, waitForRestoredSession } from "@/services/auth";
import { useStore } from "@/store/store";

/**
 * Retorno de Google (Supabase OAuth).
 *
 * Compatible con `output: "export"`: no hay handler de servidor. El flujo
 * implícito devuelve los tokens en el fragmento de la URL y el SDK los
 * procesa solo (`detectSessionInUrl`), así que esta pantalla únicamente
 * espera a que la sesión exista y decide a dónde mandar a la persona. La
 * ruta se exporta como `auth/callback.html` y el `.htaccess` de Hostinger
 * ya reescribe `/auth/callback` hacia ese archivo.
 *
 * Nada de lo que pasa acá mueve pedidos: cuando el invitado vinculó Google,
 * el uid no cambió, y cuando falla, la sesión de invitado se deja intacta.
 */

const ALREADY_LINKED_CODES = ["identity_already_exists", "identity_already_linked"];

export default function OAuthCallbackPage() {
  const router = useRouter();
  const { setCustomerSession } = useStore();
  const [message, setMessage] = useState("");
  const [alreadyLinked, setAlreadyLinked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const failure = readAuthErrorFromUrl(window.location.href);
      if (failure) {
        if (ALREADY_LINKED_CODES.includes(failure.code)) {
          setAlreadyLinked(true);
          return;
        }
        setMessage(
          failure.description ||
            "No pudimos completar el ingreso con Google. Probá de nuevo o usá tu email y contraseña.",
        );
        return;
      }

      const session = await waitForRestoredSession();
      if (cancelled) return;
      if (!session) {
        setMessage("No pudimos completar el ingreso con Google. Probá de nuevo o usá tu email y contraseña.");
        return;
      }
      // Google es solo para clientes: el panel entra por /admin/login con
      // email y contraseña. Una sesión administrativa abierta por acá se
      // cierra en vez de dejarla viva en la tienda.
      if (session.user.role !== "customer") {
        await getAuthAdapter().signOut();
        setMessage("El acceso administrativo no usa Google. Ingresá desde /admin/login con tu email y contraseña.");
        return;
      }
      await setCustomerSession(session);
      router.replace("/cuenta/pedidos");
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [router, setCustomerSession]);

  if (alreadyLinked) {
    return <main className="simple-auth-page"><section className="auth-card">
      <span className="eyebrow orange">INGRESO CON GOOGLE</span><h1>Esa cuenta de Google ya está en uso</h1>
      <div className="error-message" role="alert">
        Ya existe una cuenta de Litoral Maq asociada a ese Google. No unimos automáticamente los datos de dos
        cuentas: ingresá con ella para ver sus pedidos.
      </div>
      <Link className="button primary large full" href="/login">Ingresar a esa cuenta</Link>
      <p><Link href="/cuenta/pedidos">Seguir como invitado en este navegador</Link></p>
    </section></main>;
  }

  if (message) {
    return <main className="simple-auth-page"><section className="auth-card">
      <span className="eyebrow orange">INGRESO CON GOOGLE</span><h1>No pudimos completar el ingreso</h1>
      <div className="error-message" role="alert">{message}</div>
      <Link className="button primary large full" href="/login">Volver a intentar</Link>
      <p><Link href="/productos">Seguir comprando</Link></p>
    </section></main>;
  }

  return <main className="center-state" aria-live="polite"><div className="spinner" /><p>Confirmando tu ingreso…</p></main>;
}
