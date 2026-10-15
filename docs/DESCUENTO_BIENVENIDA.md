# Beneficio de bienvenida: 5%

Implementación preparada; no activar el anuncio sin desplegar y verificar el backend.

## Reglas
- Cuenta permanente con email verificado (Google o email), nunca una sesión anónima.
- Primera compra pagada por cuenta. Pedidos aprobados, reembolsados y contracargos excluyen nuevas redenciones.
- 5% sobre productos, redondeado por unidad a centavos como Mercado Pago; no sobre envío.
- El servidor recalcula precios, verifica identidad y reserva el beneficio bajo bloqueo transaccional por cuenta.
- Un segundo pedido/pestaña no obtiene una segunda reserva. Reintentar el mismo pedido conserva el beneficio.
- Abrir/cerrar Mercado Pago no consume el beneficio: el estado pagado proviene del webhook existente.
- **Reserva pendiente:** se reanuda el mismo pedido. Solo se libera automáticamente una reserva vencida sin ningún registro de preparación de pago. Si hubo un pago preparado, el equipo debe revisar y resolver su estado; no se libera a ciegas porque podría acreditarse después.
- No cambia Auth, profiles, roles, credenciales ni configuración de Mercado Pago.

## Datos de compra
La precarga deriva de la cuenta y del pedido propio más reciente, incluso si llegan después de abrir el checkout. No pisa campos que el cliente ya editó o borró. No guarda DNI/direcciones en localStorage ni en profiles. DNI sigue requerido hasta verificar los requisitos operativos de facturación/entrega.

## Activación
1. Desplegar migración `20261015040642_welcome_discount_activation.sql`, `welcome-discount`, `payment-create` y consumidores del recibo.
2. Verificar permisos, sesión registrada/anónima, monto, dos pestañas, reintento y pago pendiente en entorno aislado.
3. Habilitar la nueva variable de Edge Functions `WELCOME_DISCOUNT_ENABLED=true`.
4. Habilitar la variable de GitHub Actions `NEXT_PUBLIC_WELCOME_DISCOUNT_ENABLED=true` y desplegar cuando Mercado Pago esté habilitado. No cambia las variables MP existentes.
5. Si se deshabilita el anuncio, los pagos ya emitidos deben conservar su importe original.

El popup aparece a los 20 segundos desde la navegación inicial, contando el tiempo de carga. Si la página tarda más de 20 segundos en estar lista, aparece entonces, sin sumar otra espera. Se cierra con Escape o botón y no vuelve a mostrarse durante 7 días en ese navegador. Se omite en checkout, carrito, acceso, cuenta y administración, y para usuarios registrados. La ruta `/propuesta-descuento` solo existe en desarrollo para aprobar el diseño.

## Verificación realizada
- TypeScript y lint.
- 434 pruebas unitarias, incluyendo guardado por cuenta y cálculo monetario.
- Deno: cálculo usado por el proveedor y recibo con descuento.
- PostgreSQL temporal aislado: SQL de la migración, permisos, protección de importe, reintento, aprobación/reembolso y dos transacciones solapadas (una reserva, segunda rechazada).
- Pruebas existentes del checkout local y restauración de sesión: 10 casos aprobados.
- Falta verificar activación, registro real verificado y pago de prueba en un entorno separado de producción; no se crearon usuarios ni pedidos de prueba reales.
