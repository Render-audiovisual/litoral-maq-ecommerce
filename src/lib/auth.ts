import type { Session } from "./types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function customerIdFromEmail(email: string): string {
  return `customer-${normalizeEmail(email)}`;
}

export function guestIdFromEmail(email: string): string {
  return `guest-${normalizeEmail(email)}`;
}

export function isGuestCustomerId(id: string): boolean {
  return id.startsWith("guest-");
}

export const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export function createExpiry(now: number = Date.now()): number {
  return now + SESSION_TTL_MS;
}

export function isSessionExpired(session: Session | null, now: number = Date.now()): boolean {
  if (!session) return false;
  // Un expiresAt ausente o corrupto (localStorage manipulado) se trata como
  // vencido: es más seguro rechazar una sesión malformada que aceptarla.
  if (typeof session.expiresAt !== "number") return true;
  return session.expiresAt <= now;
}

export function isValidCustomerSession(session: Session | null): session is Session {
  return !!session && session.user?.role === "customer" && !isSessionExpired(session);
}

export function isValidAdminSession(session: Session | null): session is Session {
  return !!session && session.user?.role === "admin" && !isSessionExpired(session);
}
