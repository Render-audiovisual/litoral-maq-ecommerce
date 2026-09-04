# Plantillas de email de Supabase Auth — Litoral Maq

Se pegan en **Authentication → Emails → Templates** del proyecto Supabase,
una por pestaña. Cada archivo `.html` de esta carpeta corresponde a una:

| Archivo                  | Pestaña del dashboard   | Cuándo se envía |
|--------------------------|-------------------------|-----------------|
| `confirm-signup.html`    | Confirm signup          | Alta con email y contraseña, y cada reenvío desde `/confirmar-cuenta`. |
| `recovery.html`          | Reset password          | Pedido de recuperación desde `/recuperar-clave`. |
| `email-change.html`      | Change email address    | **Conversión de invitado a cuenta**: es el correo que recibe quien compró sin registrarse y después vincula su email. |

Reglas que siguen las tres, tomadas de la guía de reputación de Supabase
(`auth-smtp`, sección "Dealing with abuse"):

- Sin contenido promocional, sin taglines, sin catálogo: son mensajes de
  seguridad, no marketing. Mezclarlos empeora la entregabilidad de ambos.
- Un solo llamado a la acción por mensaje.
- Asunto corto y literal, sin emojis.
- El único dato variable es el enlace: no se interpola nombre ni email del
  usuario. En recuperación, el enlace real de Supabase viaja codificado
  dentro del fragmento privado de `/confirmar-recuperacion` para que un
  analizador automático del correo no consuma el token antes que la persona
  y para conservar completa la URL de verificación.

El asunto se configura en el campo "Subject heading" de cada pestaña:

- Confirm signup → `Confirmá tu email en Litoral Maq`
- Reset password → `Restablecé tu contraseña de Litoral Maq`
- Change email address → `Confirmá tu email para crear tu cuenta`
