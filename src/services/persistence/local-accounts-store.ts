import { normalizeEmail } from "@/lib/auth";
import type { Account } from "@/lib/types";

/**
 * Registro demo de credenciales de cliente. Deliberadamente NO forma parte
 * de `PersistenceAdapter`: no tiene equivalente en el esquema Supabase — ahí
 * las credenciales las maneja Supabase Auth por completo (`supabase.auth.*`),
 * no una tabla propia. Este módulo solo existe para la demo local y
 * desaparece cuando se conecte Auth real; mientras tanto, aísla el acceso a
 * `localStorage` en un solo lugar en vez de dejarlo inline en `mock.ts`.
 */
export interface AccountsStore {
  findByEmail(email: string): Account | null;
  upsert(account: Account): Account;
}

const ACCOUNTS_KEY = "litoral-accounts-v1";

function read(): Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as Account[]) : [];
  } catch {
    return [];
  }
}

function write(accounts: Account[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function createLocalAccountsStore(): AccountsStore {
  return {
    findByEmail(email) {
      const normalized = normalizeEmail(email);
      return read().find((account) => account.email === normalized) ?? null;
    },
    upsert(account) {
      const accounts = read();
      const index = accounts.findIndex((item) => item.email === account.email);
      const next = index === -1 ? [...accounts, account] : accounts.map((item, i) => (i === index ? account : item));
      write(next);
      return account;
    },
  };
}
