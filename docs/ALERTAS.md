# Alertas y monitoreo

Cuando algo se rompe en la tienda (correos que no salen, un pago que no se aplica, el catálogo que no se sincroniza), el equipo recibe un correo. Además hay un endpoint de salud para que un monitor externo avise si el sistema entero se cae.

## Cómo funciona

- El cron `litoral-order-notifications-every-5-minutes` llama a la función `order-notifications` cada 5 minutos.
- En cada corrida deja un **latido** en `system_heartbeat` (hora de la corrida y resultado del vencimiento de pedidos).
- Después de mandar los correos de pedidos, revisa la base y abre, recuerda o cierra alertas en `system_alerts`. Todo corre en segundo plano: si las alertas fallan, los correos de pedidos siguen saliendo igual.
- En el panel, **Configuración → Estado del sistema** muestra el último latido, las alertas activas y la última sincronización del catálogo.

## Qué alertas existen

| Alerta | Prioridad | Cuándo salta | Qué hacer |
| --- | --- | --- | --- |
| Correos de pedidos sin enviar (`outbox_failed`) | Alta | Hay correos fallidos creados en los últimos 7 días, o correos pendientes hace más de 30 min | Revisar `RESEND_API_KEY` y `RESEND_FROM_EMAIL`, el dominio en Resend y los logs de `order-notifications` |
| Falló la sincronización del catálogo (`catalog_sync_failed`) | Media | La última sincronización del Sheet falló o se frenó por seguridad | Revisar encabezados y filas del Sheet y sincronizar a mano desde el panel |
| Catálogo sin sincronizar (`catalog_sync_stalled`) | Alta | No hay una sincronización exitosa en las últimas 12 h (la automática corre cada 3 h) | Revisar la sincronización en el panel y los logs de `order-notifications` |
| Pago aprobado sin aplicar (`payment_not_applied`) | Crítica | Mercado Pago aprobó un pago hace más de 10 min y el pedido no figura pagado | Revisar el webhook de Mercado Pago y el pedido en el panel. Si hace falta, marcar el pago a mano |
| Pedidos vencidos sin cancelar / cron caído (`lifecycle_stalled`) | Alta | Pedidos sin pago vencidos hace más de 30 min, o el último latido tiene más de 20 min | Revisar el job de `pg_cron` y los logs de `order-notifications` |
| Pedidos pagados sin preparar (`paid_not_started`) | Media | Pedidos pagados que siguen en "Pendiente" hace más de 12 h | Pasarlos a preparación o contactar al cliente desde el panel |

Los umbrales están al principio de `supabase/functions/_shared/health-checks.ts`.

### Cuándo llega un correo

- **Alerta nueva:** un correo en el momento. Si en la misma corrida hay varias, van juntas en un solo correo.
- **Sigue activa:** recordatorio cada 6 h (prioridad crítica o alta) o cada 24 h (media).
- **Se resolvió:** un único correo con "Resuelto". Si la alerta nunca llegó a avisarse, se cierra sin correo.
- Si el envío falla, se reintenta en la próxima corrida (5 min). No se duplican correos.

El asunto es `[Litoral Maq] Alerta crítica: …`, `[Litoral Maq] Alerta: …` o `[Litoral Maq] Resuelto: …`.

## Quién recibe los correos

1. En Supabase → **Edge Functions → Secrets**, cargar `LITORAL_ALERTS_EMAIL` con uno o varios correos separados por coma (por ejemplo `franco@…,ventas@…`).
2. Si no se carga, las alertas van a `LITORAL_ORDERS_EMAIL` (la casilla de pedidos nuevos).
3. Si no hay ninguna de las dos, no se manda nada. El problema queda en los logs de la función (`"scope":"alerting"`).

Se usa la misma cuenta de Resend que los correos de pedidos (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). No hace falta otro servicio.

## Privacidad

Los correos de alerta y el endpoint de salud **no llevan datos personales**: solo números de pedido, cantidades y el tipo de problema. En los mensajes de error se tapan los emails y los números largos (DNI, teléfonos).

## Monitor externo (gratis)

Si Supabase entero se cae, el cron no puede avisar. Para eso conviene un monitor externo como [UptimeRobot](https://uptimerobot.com) (el plan gratis alcanza):

1. Crear una cuenta y cargar tu email en **Alert contacts**.
2. Crear tres monitores del tipo **HTTP(s)**, cada 5 minutos:
   - `https://litoralmaq.com`: la tienda.
   - `https://admin.litoralmaq.com`: el panel.
   - `https://bhtaecnzpuotlsenbdlz.supabase.co/functions/v1/health`: el estado del backend.
3. En los tres, activar el aviso por email al contacto del paso 1.

El endpoint `health` responde **200** cuando el cron corrió hace menos de 15 minutos y no hay alertas críticas ni altas abiertas. En cualquier otro caso responde **503**, y UptimeRobot lo toma como caída. La respuesta es un JSON sin datos sensibles:

```json
{"ok":true,"lastTickMinutesAgo":2,"activeAlerts":{"critical":0,"high":0,"medium":0}}
```

## Logs

Los errores de `mercado-pago-webhook`, `enviopack-webhook`, `payment-create`, el envío de correos y las alertas quedan como una línea JSON con `"level":"error"` y `"scope":"<función>"`. Se ven en Supabase → Edge Functions → Logs.
