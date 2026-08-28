import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const policies = readFileSync(join(process.cwd(), "supabase/migrations/0003_rls_policies.sql"), "utf8");

describe("aislamiento RLS de clientes", () => {
  it("un cliente solo puede leer y crear pedidos con su propio auth.uid()", () => {
    expect(policies).toContain("auth.uid() = customer_id or public.is_admin()");
    expect(policies).toContain("for insert with check (auth.uid() = customer_id or public.is_admin())");
  });

  it("cada carrito solo puede ser leído o escrito por su dueño, sin excepción administrativa", () => {
    expect(policies).toContain(
      "for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)",
    );
  });
});

const profileTriggers = readFileSync(join(process.cwd(), "supabase/migrations/0002_profiles_trigger.sql"), "utf8");
const identitySync = readFileSync(join(process.cwd(), "supabase/migrations/0009_auth_identity_sync.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "supabase/migrations/0001_schema.sql"), "utf8");

describe("un cliente nunca puede obtener el rol admin", () => {
  it("el perfil se crea con role='customer' literal, sin leer la metadata del usuario", () => {
    // La metadata la elige el navegador (options.data del signUp, o los
    // claims que traiga Google). Si el trigger la leyera, un registro
    // público podría pedir role='admin'.
    const insert = profileTriggers.slice(
      profileTriggers.indexOf("insert into public.profiles"),
      profileTriggers.indexOf("on conflict"),
    );
    expect(insert).toContain("'customer'");
    expect(insert).not.toMatch(/raw_user_meta_data\s*->>\s*'role'/);
  });

  it("un update del propio perfil no puede cambiar el rol si no sos admin", () => {
    expect(identitySync).toContain("if new.role is distinct from old.role and not public.is_admin() then");
    expect(identitySync).toContain("new.role := old.role;");
  });

  it("el guardia corre como BEFORE UPDATE sobre profiles", () => {
    expect(identitySync).toMatch(/create trigger profiles_identity_guard\s+before update on public\.profiles/);
  });
});

describe("identidad del perfil: reflejo de auth.users, no dato editable", () => {
  it("profiles.id es la misma fila que auth.users.id", () => {
    expect(schema).toContain("id uuid primary key references auth.users (id) on delete cascade");
  });

  it("email es único, así no quedan dos perfiles para la misma persona", () => {
    expect(schema).toContain("create unique index if not exists profiles_email_key");
  });

  it("convertir un invitado sincroniza email/is_anonymous SIN cambiar el uid", () => {
    // El update es por id y no lo toca: el uid del invitado —y con él sus
    // pedidos— se conserva.
    expect(identitySync).toContain("update public.profiles p");
    expect(identitySync).toContain("is_anonymous = coalesce(new.is_anonymous, false)");
    expect(identitySync).toContain("where p.id = new.id");
    const setClause = identitySync.slice(
      identitySync.indexOf("update public.profiles p"),
      identitySync.indexOf("where p.id = new.id"),
    );
    expect(setClause).not.toMatch(/\bid\s*=/);
  });

  it("el navegador no puede declararse cuenta permanente por su cuenta", () => {
    // Solo se aceptan los valores que auth.users YA tiene.
    expect(identitySync).toContain("from auth.users u");
    expect(identitySync).toContain("coalesce(u.is_anonymous, false) = new.is_anonymous");
    expect(identitySync).toContain("new.is_anonymous := old.is_anonymous;");
  });
});
