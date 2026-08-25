import { createExpiry, customerIdFromEmail, normalizeEmail } from "@/lib/auth";
import type { Account, Session } from "@/lib/types";
import { createLocalAccountsStore } from "@/services/persistence/local-accounts-store";
import { EmailConfirmationRequiredError, type AuthAdapter } from "./types";

const wait = (duration = 350) => new Promise((resolve) => setTimeout(resolve, duration));

/**
 * DEMO ONLY: credencial administrativa fija en el bundle cliente. Un
 * almacenamiento realmente seguro (hash + sal, verificado en servidor) no es
 * posible sin backend — queda fuera de alcance mientras el sitio siga siendo
 * 100% estático. No se agrega hashing client-side porque compararlo también
 * ocurriría en el cliente, dando una falsa sensación de seguridad.
 */
const ADMIN_EMAIL = "admin@litoralmaq.com";
const ADMIN_PASSWORD = "admin123";
const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos.";

const accountsStore = createLocalAccountsStore();

function findAccountByEmail(email: string): Account | undefined {
  return accountsStore.findByEmail(email) ?? undefined;
}

function upsertAccount(account: Account) {
  accountsStore.upsert(account);
}

function sessionFromAccount(account: Account): Session {
  return {
    user: { id: account.id, name: account.name, email: account.email, role: "customer" },
    token: `demo-${Date.now()}`,
    expiresAt: createExpiry(),
  };
}

/**
 * Adaptador de autenticación activo por defecto: modelo demo, credenciales
 * en `local-accounts-store` (localStorage). No tiene identidad anónima real
 * — el "invitado" del modelo local es un id determinístico por email
 * (`guest-<email>`, ver `lib/auth.ts`), sin sesión.
 */
export const localAuthAdapter: AuthAdapter = {
  async signInCustomer(email, password) {
    await wait();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes("@")) {
      throw new Error(GENERIC_LOGIN_ERROR);
    }
    if (normalizedEmail === ADMIN_EMAIL) {
      throw new Error("Ese email corresponde al acceso administrativo. Ingresá desde /admin/login.");
    }
    const account = findAccountByEmail(normalizedEmail);
    if (!account || account.providers.password?.value !== password) {
      throw new Error(GENERIC_LOGIN_ERROR);
    }
    return sessionFromAccount(account);
  },
  async signUpCustomer(name, email, password) {
    await wait();
    const normalizedEmail = normalizeEmail(email);
    if (name.trim().length < 2 || !normalizedEmail.includes("@") || password.length < 6) {
      throw new Error("Completá nombre, email válido y una clave de 6 caracteres.");
    }
    if (normalizedEmail === ADMIN_EMAIL) {
      throw new Error("Ese email está reservado para el administrador y no puede registrarse como cliente.");
    }
    const existing = findAccountByEmail(normalizedEmail);
    if (existing) {
      // Misma salida que un alta nueva: si acá se dijera "ya existe", el
      // formulario de registro revelaría qué emails son clientes. El
      // adaptador Supabase se comporta igual (ver auth-enumeration.test.ts).
      throw new EmailConfirmationRequiredError(normalizedEmail);
    }
    const account: Account = {
      id: customerIdFromEmail(normalizedEmail),
      name: name.trim(),
      email: normalizedEmail,
      role: "customer",
      providers: { password: { value: password } },
      createdAt: new Date().toISOString(),
    };
    upsertAccount(account);
    return sessionFromAccount(account);
  },
  async signInAdmin(email, password) {
    await wait();
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      throw new Error("Credenciales de administrador incorrectas.");
    }
    return {
      user: {
        id: "admin-1",
        name: "Administrador Litoral Maq",
        email: ADMIN_EMAIL,
        role: "admin",
      },
      token: `demo-admin-${Date.now()}`,
      expiresAt: createExpiry(),
    };
  },
  async requestPasswordReset(email) {
    await wait(150);
    if (!normalizeEmail(email).includes("@")) throw new Error("Ingresá un email válido.");
  },
  async resendCustomerConfirmation(email) {
    await wait(150);
    if (!normalizeEmail(email).includes("@")) throw new Error("Ingresá un email válido.");
  },
  async updateCustomerPassword(password) {
    await wait(150);
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  },
  async signOut() {
    await wait(100);
  },
};
