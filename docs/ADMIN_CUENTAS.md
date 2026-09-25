# Cuentas del panel: cómo se crean, se cambian de rol y se desactivan

El panel es un sistema **cerrado**: nadie se registra solo. Cualquier alta
pública (tienda, Google, invitado) entra siempre como `customer`, y el rol
solo lo cambia un administrador. Requiere la migración
`supabase/migrations/20260925120000_admin_hardening.sql` aplicada.

**Nunca** se mandan contraseñas por WhatsApp o mail, ni se guardan en el repo,
en `.env` o en un chat. Cada cuenta es de una sola persona.

## Roles

| Rol | Qué puede hacer |
|---|---|
| `admin` | Todo: pedidos (estado, pago, DNI, guías y etiquetas), productos, sincronización del catálogo, clientes, configuración, registro de actividad y cuentas del equipo. |
| `employee` | Ver todos los pedidos y cambiar **solo el estado**. Si intenta tocar cualquier otro dato (pago, DNI, montos, vencimientos, envío), la base rechaza el cambio. No crea ni borra pedidos, no ve clientes ni el registro de actividad y no toca productos. Hoy el panel todavía no deja entrar a un `employee`. |
| `customer` | Cliente de la tienda: solo sus pedidos, su carrito y su perfil. |

Cuentas actuales: Franco (`byfranromero@hotmail.com`), Gonzalo
(`maqlitoral@gmail.com`) y Gaby, las tres como `admin`.

## 1. Crear una cuenta

1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Email de la persona y una contraseña que elige Franco (se la da en
   persona; la persona puede cambiarla después con "Olvidé mi contraseña").
3. Tildar **Auto Confirm User** y crear.
4. La cuenta nace como `customer`. Asignarle el rol (punto 2).

## 2. Cambiar el rol

La función soportada es `public.admin_set_role(email, rol)`, con rol
`admin`, `employee` o `customer`. Reglas: la llama un admin logueado, nadie
cambia su propio rol y nunca puede quedar el sistema sin administradores.
Cada cambio queda en el registro de actividad (`equipo.rol`) con el autor.

**Por qué no alcanza con pegarla en el SQL Editor:** ahí no hay usuario
logueado (`auth.uid()` es NULL), así que la función responde "Solo un
administrador puede cambiar roles". Hay tres caminos:

**a) Desde el panel** (cuando exista la sección Equipo): Equipo → cambiar rol.

**b) Desde el SQL Editor, "actuando como" un admin** (queda registrado a su
nombre). Buscar primero el id del admin que hace el cambio:

```sql
select id, email from public.profiles where role = 'admin';
```

Después correr **todo junto, en una sola ejecución** (el `true` de
`set_config` hace que la identidad dure solo esta transacción):

```sql
begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<uuid del admin>', 'role', 'authenticated')::text,
  true
);
select public.admin_set_role('persona@ejemplo.com', 'admin');
commit;
```

**c) Primer administrador de un proyecto nuevo** (todavía no hay ningún admin
para "actuar como"): en el SQL Editor, sin `set_config`,

```sql
update public.profiles set role = 'admin' where email = 'persona@ejemplo.com';
select email, role from public.profiles where email = 'persona@ejemplo.com';
```

Esto solo funciona desde el SQL Editor (conexión directa de `postgres`).
Desde la API, con cualquier clave, incluida la service role, el cambio se
descarta. Queda registrado con autor `sistema`.

## 3. Desactivar o reactivar una cuenta

`public.admin_set_user_active(email, false)` bloquea el login y cierra todas
sus sesiones; con `true` la reactiva. Nadie se desactiva a sí mismo. Se corre
igual que en 2.b:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<uuid del admin>', 'role', 'authenticated')::text, true);
select public.admin_set_user_active('persona@ejemplo.com', false);
select public.admin_set_role('persona@ejemplo.com', 'customer');
commit;
```

El segundo `select` (bajar el rol) corta el acceso al panel **al instante**: la
base lee el rol en cada consulta. Sin él, la sesión que ya estaba abierta
sigue viva hasta que vence su token (1 hora como máximo).

También sirve Authentication → Users → **Ban user** del dashboard, pero no
queda en el registro de actividad.

## 4. Consultas útiles

```sql
-- Quién es admin o empleado
select p.email, p.role, u.last_sign_in_at, u.banned_until
from public.profiles p join auth.users u on u.id = p.id
where p.role in ('admin', 'employee')
order by p.role, p.email;

-- Últimos cambios de cuentas y roles
select at, admin_email, action, detail
from public.audit_log
where action like 'equipo.%'
order by at desc
limit 20;
```
