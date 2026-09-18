# Rollback de producción — Litoral Maq

Este documento es el procedimiento para deshacer un deploy problemático.
Cubre las tres cosas que el pipeline `.github/workflows/deploy-hostinger.yml`
toca: frontend (Hostinger), migraciones (Supabase Postgres) y Edge Functions
(Supabase). No hay un botón único de "deshacer todo": cada capa se revierte
distinto, como en cualquier sistema con migraciones forward-only.

## 1. Frontend (Hostinger) — automático + manual

**Automático:** si el propio `rsync` de publicación falla a mitad de camino,
el script remoto ya hace rollback solo (`trap rollback ERR` en el job
`deploy`). No hace falta intervenir.

**Manual, después del hecho** (el deploy "funcionó" pero rompió algo que los
tests no agarraron):

```bash
ssh -p <HOSTINGER_PORT> <HOSTINGER_USER>@<HOSTINGER_HOST>
deploy_root=/home/u471562620/deployments/litoral-maq
store_live=/home/u471562620/domains/litoralmaq.com/public_html
admin_live="$store_live/admin"

# Ver qué release está publicada y cuál es el backup más reciente
cat "$deploy_root/current-release"
backup_root=$(cat "$deploy_root/last-backup")

# Restaurar ese backup
rsync -a --delete --exclude '/admin/' "$backup_root/store/" "$store_live/"
rsync -a --delete "$backup_root/admin/" "$admin_live/"
```

`$deploy_root/backups/` tiene un backup por cada deploy (timestamp + primeros
12 caracteres del commit), no solo el último — se puede volver más atrás si
hace falta.

## 2. Migraciones de Supabase — no hay "down", se revierte para adelante

Como en casi todo proyecto de Supabase, `supabase/migrations/` es
forward-only: no existen archivos de reversa. El pipeline nuevo (`db push`)
respeta eso a propósito — no inventa un mecanismo de rollback automático que
no existe en la herramienta oficial.

**Si la migración fue destructiva** (borró una columna/tabla con datos) y ya
se aplicó: no hay recuperación desde el pipeline. Hay que restaurar desde un
backup de la base (Supabase → Database → Backups) o desde `pg_dump` si existe
uno propio. Por eso esas migraciones pasan por el Environment
`production-destructive-migration` con aprobación manual antes de aplicarse.

**Si la migración fue "segura" pero el cambio de esquema causa un problema
operativo** (ej.: un `NOT NULL` que rompe un insert): se escribe una migración
nueva que corrige el problema (agrega la columna de nuevo, relaja el
constraint, etc.) y se commitea normalmente. Es el mismo flujo de siempre,
no un modo especial de "rollback".

**Si lo que se rompió es el historial** (una migración quedó marcada como
aplicada en producción pero no corresponde, o viceversa — el caso que
`supabase-plan-migrations.mjs` detecta y bloquea el pipeline):

```bash
# Marca una versión remota como resuelta sin volver a ejecutarla
supabase migration repair --status applied <version> --project-ref <ref>

# O, si el cambio real en producción no tiene archivo local equivalente,
# genera el archivo que falta a partir del estado real de la base:
supabase db pull --project-ref <ref>
```

Cualquiera de las dos deja un archivo para commitear — nunca se corre contra
producción sin revisar antes qué generó.

## 3. Edge Functions — redesplegar el commit anterior

Supabase guarda versiones de cada función (se ve en el dashboard, o con
`supabase functions list`), pero la CLI no tiene un comando de "volver a la
versión anterior". El rollback real es con git, igual que el frontend:

```bash
git revert <commit-problemático>   # o: git checkout <commit-bueno> -- supabase/functions/
git push origin main
```

Al llegar a `main`, el pipeline corre de nuevo, `supabase_check` detecta que
esos archivos volvieron a su estado anterior y `supabase_functions_deploy`
redespliega exactamente esas funciones con el código revertido. No hace
falta ni un comando especial ni acceso manual a Supabase.

## 4. Kill switch de Mercado Pago — el más rápido para un pago roto

Si el problema es específicamente el cobro (no el deploy en sí), la forma
más rápida de cortar sin esperar ningún pipeline es apagar
`MP_CHECKOUT_ENABLED` en las variables de entorno de la función
`payment-create` desde el dashboard de Supabase. Es instantáneo y no
requiere un deploy.
