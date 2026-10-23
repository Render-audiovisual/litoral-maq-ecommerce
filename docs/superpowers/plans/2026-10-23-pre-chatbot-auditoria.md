# Plan: revisión y corrección previa al chatbot

Origen: `GUIA_CHATBOT_ECOMMERCE.md` (secciones 0.1 punto 9 y 18 pasos 1-3). Proyecto Supabase: `bhtaecnzpuotlsenbdlz`.
Objetivo: dejar la base segura y los datos reales documentados antes de escribir el agente.

## Estado verificado (2026-10-23)

- RLS activo en las 16 tablas de `public`.
- Advisor de seguridad: 0 errores, 11 warnings (detalle en cada fase).
- `admin_set_role` / `admin_set_user_active`: validan `is_admin()` adentro, revocan `anon`, conceden solo a `authenticated` (`20260925120000_admin_hardening.sql:430-433`). Warning **aceptado**.
- `is_admin`, `is_employee`, `is_admin_or_employee`: se dejan ejecutables a propósito porque las políticas RLS las llaman (`20260925120000_admin_hardening.sql:442`). Warning **aceptado**.
- `next.config.ts` tiene `output: "export"`: la web es estática. El agente NO puede vivir en la web; va en Edge Function. Ya existen 13 funciones en `supabase/functions/`.
- Guía desactualizada: dice 265 productos, hay 633 filas en `products`.

## Fase 1. Probar que no hay fuga (bloqueante)

Sin sesión, con la clave pública (anon), pedir por REST cada tabla y confirmar 0 filas ajenas.

| Tabla | Esperado con anon |
| --- | --- |
| `orders`, `payments`, `payment_events` | 0 filas |
| `profiles`, `carts`, `audit_log` | 0 filas |
| `shipping_*`, `system_*`, `catalog_sync_runs` | 0 filas |
| `customer_checkout_details`, `welcome_discount_claims`, `order_notification_outbox` | 0 filas / denegado |
| `products` | solo activos (`products_select_public_active`) |

Pasos:
1. Script `scripts/audit-anon-rls.mjs` (solo lectura, usa `NEXT_PUBLIC_SUPABASE_URL` + anon key). Imprime filas devueltas por tabla.
2. Mismo script con un usuario cliente de prueba: solo ve sus pedidos, carrito y perfil; no ve los de otro.
3. Listar políticas reales (`select * from pg_policies where schemaname='public'`) y comparar con las migraciones. Anotar diferencias.
4. Revisar columnas de `products`: que anon no vea costos, proveedor ni notas internas (relevante porque el agente reutiliza esa lectura).

Hecho cuando: informe en `docs/AUDITORIA_RLS_2026-10.md` con tabla anon/cliente/admin y 0 fugas, o fugas corregidas con migración nueva.

## Fase 2. Corregir lo pendiente del advisor

1. **Contraseñas filtradas**: activar *Leaked password protection* en Auth (panel Supabase, un clic). Verificar con advisor.
2. **Warnings `anon` sobre políticas** (14 tablas): si Fase 1 da 0 filas, documentar como falso positivo. Si alguna política usa `to public` sin necesidad, migración que la cambie a `to authenticated`.
3. **`cron.job` / `cron.job_run_details`**: política de la extensión pg_cron, no propia. Confirmar que no están expuestas por la API (esquema `cron` fuera de "Exposed schemas").
4. **Sin políticas (INFO)**: dejar. Agregar comentario `COMMENT ON TABLE` donde falte, como en `customer_checkout_details`.

Hecho cuando: advisor solo muestra warnings documentados como aceptados.

## Fase 3. Documentar esquema real (guía paso 2)

1. Volcar columnas de `products` y `orders` (tipos, estados de pedido, cómo se guarda stock y ficha técnica).
2. Anotar cómo se calcula "últimas N unidades", el tope de 3 por compra (`purchase-limits`) y el ocultado automático con ≤3 unidades.
3. Corregir la guía: 633 productos, tablas nuevas, Next estático + Edge Functions existentes, OCA/Enviopack (`0007_shipping_enviopack.sql`).

Hecho cuando: `docs/ESQUEMA_REAL.md` + guía con cifras corregidas.

## Fase 4. Inventario de lo que ya hay que el chatbot reutiliza

1. Revisar Edge Functions existentes: patrón de CORS, auth, rate limit y manejo de secretos. `chat` debe copiar el patrón, no inventar otro (`checkout-details` es el más parecido: verifica identidad).
2. Ver `src/lib/search.ts`: la búsqueda del sitio ya existe. Decidir si el agente la reutiliza o va por SQL (`pg_trgm`).
3. Ver `src/lib/whatsapp.ts` para el link de derivación.
4. Confirmar secretos disponibles: `GEMINI_API_KEY` no existe todavía.

Hecho cuando: lista corta de piezas reutilizables y qué falta crear.

## Fase 5. Contenido que depende del negocio (no de código)

Pedir al dueño, en `docs/POLITICAS_PENDIENTES.md`:
- Envíos y plazos, cambios y devoluciones, garantía, facturación A/B, cuotas, horarios, arrepentimiento.
- Qué hace "envío a cotizar" hoy con Enviopack/OCA.

Sin esto el agente solo puede derivar a WhatsApp en esos temas.

## Orden y dependencias

Fase 1 -> Fase 2 (bloquea chatbot). Fases 3-4 en paralelo. Fase 5 arranca ya (espera humana).
Después de todo: guía paso 3 en adelante (políticas, búsqueda, atributos, Edge Function `chat`).

## Riesgos

- Migraciones van a producción real (47 pedidos, 166 perfiles). Probar en rama Supabase o staging (`supabase/staging/seed.sql`) antes.
- No cambiar `is_admin*` ni sus grants: rompe RLS.
- El agente jamás usa clave pública para pedidos; solo service role dentro de la función.
