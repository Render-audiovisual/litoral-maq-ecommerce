# Automatizaciones sin APIs nuevas — Plan

**Goal:** Que la tienda trabaje sola con lo que ya hay (cron de Supabase cada 5 minutos, Resend, Google Sheet público): avisar al cliente a la hora y al vencer el pedido, marcar en el panel lo que se demora, y mantener el catálogo al día sin apretar "Actualizar desde Sheet".

**Decidido por Franco (2026-09-24):** las cuatro automatizaciones entran en este deploy. Sigue manual: la cotización de envío (falta la API de logística) y el contacto humano por WhatsApp.

**Ya existía (Wilson, #83):** a la hora de un pedido sin pago se marca `follow_up_at` (aparece en el panel como "seguimiento"); a las 24 h se cancela solo (`process_pending_order_lifecycle()`, disparado por el cron de `order-notifications`).

## Global Constraints
- Migraciones solo aditivas (sin DROP TABLE/COLUMN/SCHEMA ni TRUNCATE: el gate de CI las frenaría). Un `drop constraint` para ampliar un CHECK está permitido.
- Sin secretos nuevos y sin tocar los existentes. El cron sigue siendo el job `litoral-order-notifications-every-5-minutes`; no se crean jobs nuevos.
- Ninguna automatización puede romper el envío de correos existentes: un error en el ciclo de vida o en la sincronización se registra y el resto del tick sigue.
- Nada de correos a pedidos viejos: solo pedidos creados o vencidos en las últimas 48 h.
- `verify_jwt` de las funciones no cambia (`supabase/config.toml`).
- Textos de cara al cliente en español rioplatense, tono cálido (como el mensaje de WhatsApp del panel).

## Tareas
1. **T1 Recordatorio a la hora + aviso de vencimiento por email.** Migración `20260924150000_pending_order_notifications.sql`, plantillas en `supabase/functions/_shared/order-email.ts`, tolerancia a errores en `order-notifications`, tests Deno.
2. **T2 Sincronización automática del catálogo.** Módulo compartido `_shared/catalog-sync.ts`, ejecución periódica (cada 3 h) dentro del tick del cron, con freno de seguridad si el Sheet viene incompleto; migración `20260924153000_catalog_auto_sync.sql`.
3. **T3 Indicadores de demora en el panel.** Migración `20260924160000_order_status_changed_at.sql` (columna `status_changed_at` + trigger), helper puro `src/lib/order-delays.ts` con tests, etiqueta "Demorado" y filtro en Pedidos, bloque "Requieren atención" en Resumen.

## Cierre
Suite completa (`deno test`, `npx tsc`, lint, vitest, Playwright), validación de cada SQL dentro de una transacción con rollback contra la base real (sin dejar cambios), PR y deploy junto con el resto del trabajo.
