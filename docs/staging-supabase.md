# Staging de Supabase y E2E reales

Los E2E de este repo crean cuentas y pedidos de verdad. Correrlos contra el
proyecto productivo ya dejó pedidos de prueba en la base real, y por eso
`playwright.config.ts` fuerza el modo local (`localStorage`) salvo que se
declare explícitamente un backend de staging.

Este documento describe el staging que sí se puede usar hoy: el **stack local
de Supabase**, levantado con el CLI sobre Docker. Es el mismo Postgres, el
mismo GoTrue, el mismo PostgREST y el mismo runtime de Edge Functions que en
la nube, con las migraciones del repo aplicadas desde cero.

> **Por qué no hay un proyecto hosteado de staging**: la cuenta de Supabase
> está en el límite de 2 proyectos del plan free (producción
> `litoralmaq-ecommerce` + `Angel Azul base`, que ocupa cupo aunque esté
> pausada). Crear un tercero exige borrar uno o pasar a Pro. Ver
> "Limitaciones y riesgos pendientes".

---

## 1. Requisitos

- Docker Desktop corriendo (el CLI levanta ~10 contenedores, ~3 GB de imágenes
  la primera vez).
- Node 22+ (para `--env-file`).
- Nada más: el CLI de Supabase se resuelve con `npx`.

## 2. Levantar el entorno

```bash
npx supabase start           # aplica supabase/migrations/*.sql en orden y siembra
npx supabase status          # imprime API_URL, PUBLISHABLE_KEY, DB_URL, STUDIO_URL
```

`supabase start` hace, en una sola pasada:

1. crea la base y aplica las **10 migraciones** del repo, en orden;
2. ejecuta `supabase/staging/seed.sql` (declarado en `[db.seed]` de
   `supabase/config.toml`).

Para volver a un estado limpio en cualquier momento:

```bash
npx supabase db reset        # recrea la base, reaplica migraciones y vuelve a sembrar
```

Para reejecutar solo el seed, sin tocar el resto del esquema:

```bash
docker exec -i supabase_db_litoral-maq-ecommerce \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/staging/seed.sql
```

Bajar todo:

```bash
npx supabase stop
```

### Ajustes de `supabase/config.toml`

Las secciones agregadas al final del archivo aplican **solo al stack local**:

| Sección | Motivo |
|---|---|
| `[db.seed]` | apunta al seed ficticio de staging |
| `[auth] enable_anonymous_sign_ins` | el checkout de invitado usa `signInAnonymously`; sin esto no hay pedido posible |
| `[auth.email] enable_confirmations = false` | en local no hay correo real (Mailpit intercepta todo) |
| `[analytics] enabled = false` | Logflare no arranca en Docker Desktop/Windows y su health check tumbaba el `supabase start` entero |

## 3. Datos de prueba

`supabase/staging/seed.sql` es **ficticio, mínimo e idempotente**. No copia
nada de producción: ni clientes, ni pedidos, ni usuarios, ni secretos.

Crea:

- un administrador de staging (`admin@litoralmaq.com` / `admin123`, las mismas
  credenciales que el admin del modo local, para que las specs no necesiten
  dos juegos de fixtures);
- tres productos: `E2E-0001` (se compra), `E2E-0002` (se edita/borra) y
  `E2E-0003` (inactivo, para verificar que el panel ve lo que el catálogo
  público no).

Borra, y solo eso:

- pedidos con email `@e2e.litoralmaq.test`;
- productos con código `E2E-%`;
- invitados anónimos que quedaron sin pedidos asociados.

Cualquier otro registro queda intacto, así que el seed se puede reejecutar
sobre una base que ya tenga datos. Verificado: después de dos corridas
completas de E2E, una pasada del seed deja exactamente 3 productos, 1 admin,
0 pedidos de prueba y 0 invitados anónimos.

## 4. Correr los E2E contra staging

```bash
cp .env.staging.example .env.staging.local
# completar E2E_SUPABASE_PUBLISHABLE_KEY con el PUBLISHABLE_KEY de `npx supabase status`
npm run test:e2e:staging
```

`npm run test:e2e:staging` corre **solo** las specs marcadas `@staging`
(`tests/e2e/staging-supabase.spec.ts`). El resto de la suite sigue corriendo
en modo local con `npm run test:e2e`, y las `@staging` se saltean solas
cuando no hay `E2E_SUPABASE_URL`.

Qué cubren:

| Spec | Cubre |
|---|---|
| `un pedido se crea, se ve en el panel, cambia de estado y persiste tras recargar` | alta de pedido como invitado anónimo (RLS de `orders`), lectura desde el panel con sesión admin, cambio de estado, recarga y relectura desde Postgres |
| `el panel crea, edita y elimina un producto, y muestra los errores del backend` | validación de formulario, error real del backend (violación del índice único `products_code_key`) sin guardado silencioso, alta, edición con persistencia tras recarga, y baja |

Las specs se limpian solas: el producto que crean lo borran, y el pedido queda
bajo el dominio `@e2e.litoralmaq.test` que el seed elimina. Correrlas dos veces
seguidas sin resetear la base funciona — cada corrida usa su propio sufijo.

## 5. Variables de entorno

Solo por nombre: ningún valor va a un commit, un log ni una captura.

| Variable | Dónde vive | Para qué |
|---|---|---|
| `E2E_SUPABASE_URL` | `.env.staging.local` (gitignoreado) / GitHub Secrets | backend contra el que corren los E2E. `playwright.config.ts` aborta si es el host de producción |
| `E2E_SUPABASE_PUBLISHABLE_KEY` | idem | clave publicable del mismo entorno |
| `NEXT_PUBLIC_SUPABASE_URL` | entorno de build | la deriva `playwright.config.ts` de `E2E_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | entorno de build | idem |
| `NEXT_PUBLIC_PERSISTENCE_PROVIDER` | entorno de build | `supabase` cuando hay staging declarado; `local` si no |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.migration.local` únicamente | scripts de migración de catálogo. Jamás con prefijo `NEXT_PUBLIC_` |

Los valores del stack local son constantes públicas del CLI (iguales en toda
máquina) y se leen con `npx supabase status`. Los de cualquier proyecto
hosteado son secretos reales y van a GitHub Secrets con **los mismos nombres**
que ya espera `.github/workflows/deploy-hostinger.yml`.

## 6. Limitaciones y riesgos pendientes

1. **No hay staging hosteado.** El stack local no es alcanzable desde GitHub
   Actions tal como está: para usarlo en CI hay que levantar `supabase start`
   dentro del job (está soportado, pero suma varios minutos al pipeline) o
   crear un proyecto hosteado. Los secrets `E2E_SUPABASE_URL` y
   `E2E_SUPABASE_PUBLISHABLE_KEY` ya están cableados en el workflow, así que
   ese paso se reduce a cargarlos.

2. **El proyecto local está linkeado a producción.** `supabase/.temp/` apunta
   a `bhtaecnzpuotlsenbdlz`. `supabase start`, `db reset` y `status` son
   locales, pero cualquier comando con `--linked` (o `db push`) va a
   **producción**. No usar esos flags en este flujo.

3. **Los errores del backend llegan a la UI como texto genérico.** Los errores
   de PostgREST no son instancias de `Error`, y las pantallas del panel usan
   `error instanceof Error ? error.message : "<fallback>"`. Resultado: un
   código duplicado y un "no tenés permiso" se ven exactamente igual
   ("No se pudo guardar el producto."). Se muestra un error y nada se guarda
   en silencio, pero quien administra no puede distinguir la causa. Arreglarlo
   es una decisión de producto — implica definir cuánto texto del motor se
   expone — y quedó deliberadamente fuera de esta rama.

4. **Las Edge Functions se sirven pero no se pueden ejercitar de punta a
   punta.** Las 7 responden en `http://127.0.0.1:54321/functions/v1/<nombre>`
   (401 o 200, nunca 404), pero necesitan secretos de proveedor (Envíopack,
   Mercado Pago, correo) que deliberadamente no se cargaron. Por eso
   `order-notifications` devuelve 500 y el store loguea "el correo quedó en la
   cola para reintento": el pedido se guarda igual, que es el comportamiento
   esperado y el que verifica la spec.

5. **`next dev` compila cada ruta la primera vez que se visita**, y contra
   Supabase eso se suma a la latencia de red real. Las specs `@staging` usan
   timeouts largos por eso. Las specs locales `admin-orders` y
   `assisted-checkout` fallan de forma intermitente por la misma razón en una
   corrida en frío y pasan en caliente (en CI lo tapa `retries: 2`). Es
   preexistente: no lo introduce esta rama.

6. **El admin de staging tiene contraseña conocida.** El seed está pensado
   para un stack local, donde todas las claves ya son públicas por diseño. No
   correrlo nunca contra un proyecto hosteado sin cambiar esas credenciales.
