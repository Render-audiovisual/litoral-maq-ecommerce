# Onboarding para un programador nuevo (front + back)

Litoral Maq (venta de máquinas y herramientas, Corrientes). Repo:
`github.com/Render-audiovisual/litoral-maq-ecommerce`. Este documento es
para alguien que se suma al proyecto y necesita saber qué stack hay, cómo
correrlo y qué accesos pedir.

## 1. El proyecto en una página

- **Front:** Next.js (App Router), exportado como sitio **estático** (no hay
  servidor Node en producción). TypeScript. CSS propio en
  `src/app/globals.css` (sin Tailwind ni librería de componentes).
- **Back:** Supabase — Postgres con RLS, Auth, y lógica de servidor en
  **Edge Functions (Deno)**, no en Next. El front llega a la base solo a
  través de esas funciones o de la API REST de Supabase con RLS.
- **Hosting:** Hostinger (dos sitios: la tienda y el panel admin), se
  publican solos desde GitHub Actions. Nadie sube nada a mano por FTP/SSH.
- **Integraciones reales y activas:** Mercado Pago (cobro real, no
  sandbox), Resend (emails), Google Sheets (fuente de verdad del catálogo),
  Cloudflare Turnstile (captcha). Envíos: todavía sin API de logística
  conectada (en evaluación OCA e-Pak).
- **⚠️ Leer `AGENTS.md` antes de tocar nada de Next:** esta versión tiene
  cambios que rompen compatibilidad con lo que un asistente de código
  pueda "saber" de memoria. La doc real vive en
  `node_modules/next/dist/docs/`.

## 2. Cómo correrlo en tu máquina (no hace falta ningún acceso para esto)

```bash
git clone https://github.com/Render-audiovisual/litoral-maq-ecommerce.git
cd litoral-maq-ecommerce
nvm use        # Node 22 (ver .nvmrc)
npm install
cp .env.example .env.local   # no hace falta llenar nada para este modo
npm run dev
```

Así arranca en **modo demo local**: los datos (productos, pedidos,
cuentas) viven en el `localStorage` del navegador, no en Supabase real.
Login admin de prueba: `admin@litoralmaq.com` / `admin123` — **es un dato
fijo del código para este modo, no sirve en producción y no es secreto.**

Antes de abrir un PR, todo esto tiene que pasar en limpio:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit      # vitest
npm run test:e2e       # playwright, corre solo contra el modo local
```

## 3. Si necesita probar contra una base real (sin tocar producción)

Hay un stack de Supabase que corre **100% en tu máquina** con Docker, con
las mismas migraciones y Edge Functions que producción. No requiere ningún
acceso de Franco. Instrucciones completas: `docs/staging-supabase.md`.

```bash
npx supabase start
npx supabase status   # imprime URL, claves y datos de conexión locales
```

## 4. Accesos que sí hacen falta — y quién los da

| Qué | Para qué | Quién lo da | Nivel recomendado |
|---|---|---|---|
| **GitHub, invitación al repo** | Clonar, hacer push de ramas, abrir PRs | Franco (Settings → Collaborators) | **Write**, no Admin |
| **Node 22 + Docker Desktop** | Correr el proyecto y el stack local de Supabase | lo instala cada uno | — |
| **Supabase Dashboard (proyecto real)** | Solo si va a tocar backend de producción de verdad (migraciones, secrets, logs) | Franco, desde Project Settings → Team | Si hace falta, rol **Developer**, nunca Owner |
| **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** | Correr el front contra la base real (no el stack local) | Franco se las pasa; son **públicas por diseño**, viajan en el bundle del navegador | — |
| **Secretos de GitHub Actions / `SUPABASE_SERVICE_ROLE_KEY` / Hostinger SSH** | Nada — los usa solo el CI | Nadie los comparte. Nunca por chat, nunca en el repo. | No aplica |

**Lo que el programador NO necesita nunca:** acceso a Hostinger, al panel
admin de litoralmaq.com (si no es parte del equipo que opera la tienda),
ni la `service_role key` de Supabase.

## 5. Flujo de trabajo

1. Rama nueva desde `main` por cada cambio.
2. PR a `main`. El CI corre tipos, lint, tests, build y — si el cambio
   toca `supabase/` — valida y aplica migraciones (siempre aditivas; una
   migración destructiva pide aprobación manual en un Environment aparte).
3. **El merge a `main` dispara el deploy real** (tienda + panel +
   funciones). Por ahora los mergea Franco (o yo, con su autorización
   explícita cada vez). Un programador nuevo no mergea directo a
   producción sin su OK.

## 6. Reglas de seguridad ya establecidas (no son opcionales)

- Ninguna migración hace `DROP TABLE/COLUMN/SCHEMA/DATABASE` ni
  `TRUNCATE` sin pasar por el Environment `production-destructive-migration`
  (revisores humanos).
- Los roles de cuenta (`admin`/`employee`/`customer`) se cambian solo con
  la función `admin_set_role`, nunca a mano. Ver `docs/ADMIN_CUENTAS.md`.
- `verify_jwt` de cada Edge Function está declarado en
  `supabase/config.toml`: no se cambia sin entender por qué una función lo
  necesita o no.
- Mercado Pago está en modo real. No se toca su configuración de sandbox.
- Nunca se comparten contraseñas, tokens o claves por chat; se cargan
  directo donde corresponda (Supabase, GitHub Secrets).

## 7. Dónde está cada cosa

- `src/app/` — rutas (App Router).
- `src/components/` — UI compartida.
- `src/lib/` — lógica pura, testeada con vitest (acá va la mayoría de las
  reglas de negocio: pedidos, WhatsApp, precios, etc.).
- `src/services/` — adaptadores: persistencia (Supabase vs. local),
  autenticación, pagos, envíos. Mismo contrato, dos implementaciones.
- `supabase/functions/` — Edge Functions (Deno). `_shared/` tiene la
  lógica común (emails, notificaciones, alertas, salud del sistema).
- `supabase/migrations/` — SQL, siempre aditivo.
- `docs/` — toda la documentación operativa. Antes de tocar un área,
  buscar si ya hay un doc: `ADMIN_CUENTAS.md`, `ALERTAS.md`,
  `ENVIOPACK_INTEGRATION.md`, `MERCADO_PAGO_INTEGRATION.md`,
  `staging-supabase.md`, `CATALOGO_Y_CORREOS_OPERATIVOS.md`.

## 8. Para que Franco lo active

Solo hace falta esto, nada más:

1. El **usuario o email de GitHub** de la persona, para invitarla al repo.
2. Decidir si necesita Supabase Dashboard (la mayoría de las tareas de
   backend se prueban con el stack local del punto 3, sin necesitarlo).
