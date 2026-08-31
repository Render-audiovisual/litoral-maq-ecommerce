import type { AuthAdapter } from "./types";

const unavailable = async (): Promise<never> => {
  throw new Error(
    "El adaptador local de autenticación no está incluido en este artefacto de producción.",
  );
};

/**
 * Reemplazo de compilación para producción. Conserva el contrato para que
 * una configuración accidental en modo local falle de forma visible, sin
 * incluir cuentas ni credenciales demo en el JavaScript publicado.
 */
export const localAuthAdapter: AuthAdapter = {
  signInCustomer: unavailable,
  signUpCustomer: unavailable,
  signInAdmin: unavailable,
  requestPasswordReset: unavailable,
  resendCustomerConfirmation: unavailable,
  updateCustomerPassword: unavailable,
  signOut: unavailable,
};
