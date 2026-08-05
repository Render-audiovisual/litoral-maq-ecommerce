import { isGuestCustomerId, normalizeEmail } from "@/lib/auth";
import type { Account, Customer, Order } from "@/lib/types";

/**
 * Preparación (no ejecución) de la migración de cuentas/clientes/pedidos
 * desde el modelo demo local hacia Supabase. Funciones puras, testeadas
 * directamente — no hacen ninguna llamada de red ni tocan localStorage.
 */

export type ProfileDraft = {
  email: string;
  name: string;
  role: "customer";
  hasGoogleProvider: boolean;
  requiresPasswordReset: boolean;
};

/**
 * Convierte una cuenta demo en el payload que tendría su futura fila de
 * `profiles`. Nunca incluye la contraseña: si la cuenta solo tenía
 * `providers.password`, queda marcada para que la persona la restablezca vía
 * Supabase Auth (magic link o "forgot password"), no para trasladarla.
 */
export function mapAccountToProfileDraft(account: Account): ProfileDraft {
  return {
    email: normalizeEmail(account.email),
    name: account.name,
    role: "customer",
    hasGoogleProvider: Boolean(account.providers.google),
    requiresPasswordReset: Boolean(account.providers.password) && !account.providers.google,
  };
}

export type OrderMigrationDraft = {
  order: Order;
  resolvedCustomerId: string | null;
  pendingAnonymousLink: boolean;
};

/**
 * Prepara un pedido para su futura fila de `orders`. Los pedidos de una
 * cuenta ya registrada (`customer-<email>`) resuelven directamente contra el
 * `profiles.id` real una vez creado ese usuario en Supabase Auth. Los de
 * invitado (`guest-<email>`) no tienen un `auth.uid()` real todavía —quedan
 * marcados `pendingAnonymousLink` para vincularse recién cuando ese invitado
 * inicie sesión anónima o se registre en el proyecto real; no se inventa un
 * id acá.
 */
export function prepareOrderMigration(order: Order, resolvedCustomerId: string | null): OrderMigrationDraft {
  return {
    order: { ...order, email: normalizeEmail(order.email) },
    resolvedCustomerId,
    pendingAnonymousLink: isGuestCustomerId(order.customerId) && resolvedCustomerId === null,
  };
}

export type CustomerDedupeReport = {
  customers: Customer[];
  conflicts: string[];
};

/**
 * Mismo criterio de deduplicación que la migración local v1→v2 (Etapa 3):
 * conserva el primer registro por email normalizado, reporta el resto sin
 * borrarlos, y nunca mezcla el rol admin dentro de la lista de clientes.
 */
export function dedupeCustomersByEmail(customers: Customer[]): CustomerDedupeReport {
  const byEmail = new Map<string, Customer>();
  const conflicts: string[] = [];

  for (const customer of customers) {
    if (customer.role !== "customer") continue;
    const email = normalizeEmail(customer.email);
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, { ...customer, email });
    } else {
      conflicts.push(
        `Cliente duplicado para ${email} (id previo ${existing.id} vs ${customer.id}); se conservó ${existing.id}.`,
      );
      if (!existing.phone && customer.phone) existing.phone = customer.phone;
    }
  }

  return { customers: [...byEmail.values()], conflicts };
}
