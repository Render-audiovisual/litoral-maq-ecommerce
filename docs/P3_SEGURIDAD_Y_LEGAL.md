# P3 — Seguridad y legal

## Controles técnicos preparados

- Los artefactos de Hostinger agregan CSP, HSTS, `nosniff`, protección
  anti-iframe, política de referer, permisos del navegador y aislamiento de
  apertura de ventanas.
- Los builds `build:hostinger` y `build:admin` excluyen el adaptador local de
  autenticación y persistencia. Desarrollo y E2E conservan el modo local.
- `validate:separation` falla si falta un header o si el JavaScript publicado
  contiene `admin123`, `demo-admin-` o el almacén de cuentas demo.
- Cada build de Hostinger limpia primero el `dist/` generado para que una
  ejecución previa de `next dev` no contamine el artefacto productivo.
- Una configuración productiva accidental en modo local falla de forma
  visible: nunca recupera silenciosamente el adaptador demo.

## Datos legales pendientes de confirmación

No completar estos campos por inferencia. Litoral Maq debe confirmar:

- razón social o nombre legal del proveedor;
- CUIT;
- domicilio legal y domicilio comercial que corresponda publicar;
- email y teléfono/WhatsApp formal para atención al consumidor;
- responsable y procedimiento para cambios, devoluciones y garantías;
- canal que recibirá solicitudes del botón de arrepentimiento;
- procedimiento para entregar constancia o código de identificación de cada
  solicitud y controlar el plazo de respuesta.

## Criterio para el botón de arrepentimiento

No alcanza con mostrar un enlace que no registre la solicitud. Antes de
publicarlo se debe confirmar el canal receptor, quién lo atiende y cómo se
entrega una constancia al consumidor. Hasta entonces, las páginas legales
actuales y el WhatsApp comercial siguen siendo información general, pero este
punto de P3 permanece pendiente.

## Publicación

Estos cambios deben pasar por PR y por todos los checks. No se despliegan antes
de cruzarlos con la auditoría final de entrega.
