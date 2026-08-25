import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

/**
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma de Edge
 * Functions automáticamente en todo function runtime — no hace falta
 * definirlos a mano como secret (ver supabase/functions/.env.example).
 *
 * Client con privilegio total (bypassea RLS). Nunca exponer esta factory
 * fuera de supabase/functions/ — es el equivalente, para Edge Functions, de
 * la regla que ya rige SUPABASE_SERVICE_ROLE_KEY en scripts/
 * (.env.migration.example): jamás en código que corra en el navegador.
 *
 * "Mínimo alcance posible": Supabase no ofrece una service_role recortada
 * por tabla/columna — es todo o nada a nivel Postgres role. El alcance se
 * minimiza en el USO: cada índice/función de este árbol selecciona solo las
 * columnas que necesita (nunca `select("*")` salvo donde de verdad hace
 * falta el objeto completo) y solo escribe las columnas que cambia.
 */
// deno-lint-ignore no-explicit-any
export function createAdminClient(): any {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno de la función.");
  }
  // deno-lint-ignore no-explicit-any
  return createClient<any>(url, key, { auth: { persistSession: false } });
}

export type Staff = { id: string; role: "admin" | "employee" };

// deno-lint-ignore no-explicit-any
export type MinimalSupabaseClient = any;

/**
 * Exige que quien llama sea un admin/employee autenticado (mismo criterio
 * que is_admin_or_employee() en 0004_add_employee_role.sql).
 *
 * El rol NUNCA se toma de nada que mande el frontend (body, query string,
 * headers propios) — se resuelve siempre server-side: el JWT del header
 * Authorization se valida contra Supabase Auth (auth.getUser), y el rol se
 * busca en profiles por el id de usuario que devuelve ESA validación, no
 * uno declarado por el cliente. Cubierto por
 * andreani.test.ts "ignora un rol admin declarado en el body/headers".
 *
 * `client` es inyectable para poder testear esta lógica con un doble falso,
 * sin tocar la red — mismo patrón que supabase-adapter.ts en src/ ("para
 * poder testearse con un cliente falso, sin tocar la red").
 */
export async function requireStaff(req: Request, client: MinimalSupabaseClient = createAdminClient()): Promise<Staff> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Falta el header Authorization.");

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData?.user) throw new HttpError(401, "Sesión inválida o vencida.");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw new HttpError(500, "No se pudo verificar el rol.");
  if (!profile || (profile.role !== "admin" && profile.role !== "employee")) {
    throw new HttpError(403, "Se requiere rol admin o employee.");
  }
  return { id: userData.user.id, role: profile.role };
}
