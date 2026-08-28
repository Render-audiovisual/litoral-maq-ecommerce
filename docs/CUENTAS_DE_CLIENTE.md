# Cuentas de cliente — qué hace el código y qué tiene que configurar el dueño

La compra como invitado sigue siendo el camino principal y no requiere
cuenta. Lo que se agrega es una cuenta permanente **opcional**, con email y
contraseña o con Google, sobre Supabase Auth.

Nada de lo que está acá se aplicó al proyecto Supabase, a Google, a Resend
ni a Cloudflare: son los pasos manuales que faltan, y requieren credenciales
y autorización del dueño.

---

## 1. Los cuatro caminos, en orden

### 1.1 Compra como invitado (sin cuenta)

1. El checkout pide **nombre, email y teléfono**. Nunca contraseña.
2. Sin sesión previa, `ensureGuestSession()` llama `signInAnonymously()`:
   se crea un usuario real en `auth.users` con `is_anonymous = true`, y el
   pedido queda con `customer_id = auth.uid()`. RLS hace el resto.
3. Esa sesión es válida (el invitado ve su pedido en `/cuenta/pedidos`)
   pero **no es una cuenta**: el header muestra "Ingresar", no un nombre.
4. En `/checkout/exito` aparece *"Creá tu cuenta para guardar y seguir este
   pedido"* con **Continuar con Google** y **Crear cuenta con email**.

La sesión de invitado vive en el navegador. Si se borran los datos del
sitio o se cambia de dispositivo, se pierde el acceso a ese pedido —la
pantalla lo dice— pero el pedido sigue existiendo en la base para el panel.

### 1.2 Invitado → cuenta con email (dos pasos)

Es la secuencia que Supabase documenta hoy
(`/docs/guides/auth/auth-anonymous`, "Convert an anonymous user"):

1. `/registro` detecta la sesión anónima, **no pide contraseña** y llama
   `updateUser({ email, data: { name } }, { emailRedirectTo })`. Se vincula
   el email al **mismo uid**. Sigue siendo anónimo hasta que confirme.
2. La persona abre el enlace del correo y cae en **`/crear-clave`**, que
   recién ahí llama `updateUser({ password })`.

Un `signUp()` normal con la sesión anónima viva está **bloqueado** en el
adaptador: crearía otro uid y los pedidos del invitado quedarían
inalcanzables.

Si el email ya pertenece a otra cuenta, no se fusiona ni se transfiere
nada: la respuesta es la misma que la de un alta normal (no revela que el
email existe) y la sesión de invitado queda intacta.

### 1.3 Alta nueva sin sesión de invitado

`signUp()` normal, con confirmación por email, reenvío desde
`/confirmar-cuenta` y recuperación desde `/recuperar-clave`.

### 1.4 Google

`startGoogleSignIn()` elige solo:

| Estado actual | Llamada | Efecto |
|---|---|---|
| Sin sesión, o cuenta permanente | `signInWithOAuth({ provider: 'google' })` | Ingresa o crea la cuenta. |
| Sesión anónima (invitado) | `linkIdentity({ provider: 'google' })` | **Mismo uid**: conserva sus pedidos. |

El retorno va a `/auth/callback`. Si esa identidad de Google ya pertenece a
otro usuario, Supabase devuelve `identity_already_exists`: la pantalla pide
ingresar con esa cuenta, **no** transfiere pedidos y **no** cierra la sesión
de invitado.

Google es solo para clientes. El panel sigue entrando por `/admin/login`
con email y contraseña; si una sesión de Google resultara administrativa,
`/auth/callback` la cierra y lo explica.

---

## 2. Variables de entorno

| Variable | ¿Pública? | Dónde se carga |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Entorno de build del sitio |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública | Entorno de build del sitio |
| `NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase` | Pública | Entorno de build del sitio |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Pública por diseño** | Entorno de build del sitio |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Pública (`true`/`false`) | Opcional; `false` sirve como rollback para ocultar Google |
| Turnstile **Secret Key** | 🔒 Secreta | Solo Cloudflare + Supabase (Attack Protection) |
| Google **Client Secret** | 🔒 Secreta | Solo Google Cloud + Supabase (provider Google) |
| Contraseña SMTP / API key de Resend | 🔒 Secreta | Solo el proveedor + Supabase (SMTP settings) |

Ninguna clave secreta puede llevar el prefijo `NEXT_PUBLIC_`: `readSupabaseConfig()`
rechaza el arranque si detecta una (`supabase/client.ts`). La `service_role`
no la importa ningún archivo de `src/`.

---

## 3. URLs de callback exactas

Las genera `src/lib/auth-callbacks.ts` y las verifica un test, para que la
lista del dashboard y el código no puedan divergir.

**Redirect URLs del proyecto de PRODUCCIÓN** (Authentication → URL
Configuration → Redirect URLs), las cuatro, sin comodines:

```
https://litoralmaqrender.rendercorrientes.com/login?confirmed=1
https://litoralmaqrender.rendercorrientes.com/restablecer-clave
https://litoralmaqrender.rendercorrientes.com/crear-clave
https://litoralmaqrender.rendercorrientes.com/auth/callback
```

**Site URL:** `https://litoralmaqrender.rendercorrientes.com`

`http://localhost:3000` **no** va en producción: autorizarlo permite que un
enlace con su token termine en una app corriendo en la máquina de quien
reciba el mail. Para desarrollo se usa un proyecto Supabase distinto, con
las cuatro rutas equivalentes sobre `http://localhost:3000`.

**Redirect URI que espera Google** (no es una ruta del sitio, es de
Supabase):

```
https://bhtaecnzpuotlsenbdlz.supabase.co/auth/v1/callback
```

---

## 4. Pasos manuales

### 4.1 Base de datos (primero que todo)

SQL Editor del proyecto → ejecutar `supabase/migrations/0009_auth_identity_sync.sql`.

Qué hace y por qué no se puede saltear:

- Sincroniza `profiles.email` / `is_anonymous` desde `auth.users` con un
  trigger. Sin esto, quien convierte su cuenta de invitado sigue figurando
  como anónimo para siempre y el header nunca le muestra su nombre.
- Reemplaza `prevent_role_self_escalation` por un guardia que además impide
  que el navegador escriba esos dos campos por su cuenta. Antes lo hacía el
  cliente: cualquiera podía marcarse como cuenta permanente sin confirmar
  nada, o escribir el email de otra persona y —por el índice único—
  bloquearle la conversión.

El rol admin sigue sin poder pedirse desde ningún registro: `handle_new_user`
escribe `'customer'` literal y nunca lee la metadata del usuario.

### 4.2 Supabase — Authentication

| Sección | Qué poner |
|---|---|
| Sign In / Providers → **Email** | "Confirm email" **activado**. |
| Sign In / Providers → **Anonymous sign-ins** | **Activado** (es la compra como invitado). |
| Sign In / Providers → **Allow manual linking** | **Activado**. Sin esto, `linkIdentity()` y la conversión de invitados fallan. |
| Sign In / Providers → **Google** | Activado, con el Client ID y el Client Secret del paso 4.3. |
| URL Configuration | Site URL y las 4 Redirect URLs de la sección 3. |
| Emails → Templates | Las tres plantillas de `supabase/templates/` (ver su `_base.md`). |
| Emails → SMTP Settings | Paso 4.4. |
| Attack Protection → Enable CAPTCHA protection | Paso 4.5. |
| Rate Limits | Después del SMTP propio queda en 30 emails/hora: subirlo a un valor realista. |

### 4.3 Google Cloud Console

1. **APIs y servicios → Pantalla de consentimiento de OAuth**
   - Tipo: **External**. Publicar la app (en "Testing" solo entran las
     cuentas que se carguen a mano).
   - Nombre de la app: `Litoral Maq`. Email de asistencia y de contacto.
   - Logo y dominio de la app: `litoralmaqrender.rendercorrientes.com`.
   - Dominios autorizados: `rendercorrientes.com` y `supabase.co`.
   - Scopes: solo `openid`, `email`, `profile`. Nada más: pedir permisos de
     más dispara revisión de Google y no hace falta ninguno.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**
   - Orígenes autorizados de JavaScript:
     `https://litoralmaqrender.rendercorrientes.com`
   - URI de redireccionamiento autorizado (exacto, uno solo):
     `https://bhtaecnzpuotlsenbdlz.supabase.co/auth/v1/callback`
3. Copiar **Client ID** y **Client Secret** → Supabase → Providers → Google.
   El Client Secret no se guarda en este repositorio ni en ninguna variable
   del sitio.
4. Probar el proveedor antes de publicar el código. En esta instalación el
   botón queda habilitado por defecto; `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false`
   funciona como rollback explícito si alguna vez hay que ocultarlo.

### 4.4 Emails transaccionales — Resend (recomendado)

Recomendado sobre Brevo por la integración documentada con Supabase y por
un panel de entregabilidad más simple. Brevo queda como alternativa (4.4.b).

1. Cuenta en resend.com → **Domains → Add Domain**. Conviene un subdominio
   dedicado a autenticación, por ejemplo `auth.litoralmaq.com`: si algún día
   se manda marketing, una mala reputación no arrastra a la otra.
2. Cargar en el DNS del dominio los registros que muestra Resend:
   - **SPF** — TXT en el subdominio: `v=spf1 include:amazonses.com ~all`
     (copiar el valor exacto que muestre el panel).
   - **DKIM** — TXT `resend._domainkey` con la clave pública que da Resend.
   - **MX** — el que indique Resend para el subdominio (recibe los rebotes).
   - **DMARC** (recomendado) — TXT en `_dmarc`: `v=DMARC1; p=none; rua=mailto:...`
   Esperar a que el panel marque el dominio como **Verified**.
3. **API Keys → Create API Key**, permiso *Sending access*. Ese valor es la
   contraseña SMTP.
4. Supabase → Authentication → **SMTP Settings**:

   | Campo | Valor |
   |---|---|
   | Sender email | `no-reply@auth.litoralmaq.com` (del dominio verificado) |
   | Sender name | `Litoral Maq` |
   | Host | `smtp.resend.com` |
   | Port | `465` (SSL) o `587` (STARTTLS) |
   | Username | `resend` |
   | Password | la API key del paso 3 |

5. Subir el rate limit de emails (queda en 30/hora al activar SMTP propio).
6. Probar: pedir una recuperación desde `/recuperar-clave` con una casilla
   real y confirmar que el correo llega **a la bandeja de entrada**, no a
   spam.

#### 4.4.b Brevo (alternativa)

Mismo dominio y mismos registros SPF/DKIM que pida su panel. En Supabase:
Host `smtp-relay.brevo.com`, Port `587`, Username = el login SMTP que
muestra Brevo (tiene forma de dirección `…@smtp-brevo.com`, **no** es el
email de la cuenta), Password = la SMTP key generada en su panel.

> Sin SMTP propio, Supabase solo entrega correos a las direcciones del
> equipo del proyecto y con un tope bajo por hora. Con el sitio publicado,
> eso significa que nadie fuera del equipo puede confirmar su cuenta.

### 4.5 Cloudflare Turnstile

**El orden importa.** Si se activa la protección en Supabase antes de
publicar un build que mande el token, dejan de funcionar el login, el
registro y la compra como invitado.

1. dash.cloudflare.com → **Turnstile → Add widget**.
   - Hostnames: `litoralmaqrender.rendercorrientes.com`. Para desarrollo,
     agregar `localhost` (o usar un widget aparte).
   - Modo: **Managed** (invisible salvo sospecha).
   - Copiar **Site Key** y **Secret Key**.
2. Guardar la site key pública en el entorno de build con el nombre
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y volver a desplegar. Hasta acá el widget se muestra y el token se manda,
   pero Supabase todavía no lo exige: nada se rompe.
3. Recién entonces: Supabase → Authentication → **Attack Protection →
   Enable CAPTCHA protection** → proveedor **Turnstile** → pegar la
   **Secret Key** → Save.

Queda protegido: registro, login (cliente y admin), recuperación, reenvío
de confirmación y creación de sesión de invitado — que también da de alta un
usuario real y es, según la propia doc de Supabase, el endpoint más abusable
de todos.

Un token vencido no deja al usuario trabado: el widget se resetea después de
cada intento y el mensaje explica qué hacer.

### 4.6 Mantenimiento

Los usuarios anónimos no se limpian solos. Cada tanto, en el SQL Editor:

```sql
-- borra invitados de más de 30 días que nunca convirtieron su cuenta
delete from auth.users u
where u.is_anonymous is true
  and u.created_at < now() - interval '30 days'
  and not exists (
    select 1
    from public.orders o
    where o.customer_id = u.id
  );
```

La política de producción es deliberadamente conservadora: solo se borran
invitados viejos **sin pedidos**. Si existe al menos un pedido, se conserva
el usuario anónimo y su perfil para no romper la FK ni perder trazabilidad.
No se afloja la relación entre `orders` y `profiles`, ni se borran pedidos.

---

## 5. Qué queda pendiente y por qué

- **Verificación contra un proyecto real.** Los flujos de Supabase están
  probados con mocks a nivel adaptador (`supabase-auth-adapter.test.ts`).
  Los E2E corren contra el adaptador local a propósito
  (`playwright.config.ts`: una corrida contra el proyecto real escribiría
  pedidos de prueba en producción; ya pasó una vez). Para probar de punta a
  punta invitado → email verificado → contraseña, e invitado → Google, hace
  falta un **proyecto Supabase de staging** con Google y SMTP configurados:
  `E2E_SUPABASE_URL` + `E2E_SUPABASE_PUBLISHABLE_KEY`.
- **Fusión de historial hacia una cuenta ajena preexistente**: no está
  implementada, a propósito. Requiere probar la propiedad del email o de la
  identidad *antes* de mover nada; hoy, en los dos casos de conflicto, se
  pide iniciar sesión y no se toca ningún pedido.
- **Sesión de cliente y de admin no coexisten** en el mismo navegador con
  Supabase (el SDK sostiene una sola sesión por cliente). Limitación
  conocida y ya documentada en `supabase/README.md` §4.2.
