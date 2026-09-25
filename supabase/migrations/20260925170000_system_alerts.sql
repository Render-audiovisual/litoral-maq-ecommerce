-- Alertas del sistema (auditoría 25/09/2026, H9).
--
-- 1. system_heartbeat: una sola fila ('cron') que cada tick del cron de
--    order-notifications pisa con la hora y el resultado del ciclo de vida.
--    Si deja de moverse, el cron está caído aunque pg_cron diga "succeeded".
-- 2. system_alerts: una fila por alerta (key estable). La Edge Function la
--    abre, la recuerda y la cierra; last_notified_at / notified_resolved_at
--    evitan correos repetidos.
-- 3. catalog_sync_runs: lectura para administradores (la tarjeta "Estado del
--    sistema" muestra la última sincronización).
--
-- Solo escribe la service role (Edge Functions). Los administradores leen vía
-- RLS con public.is_admin(). Todo aditivo e idempotente.

create table if not exists public.system_heartbeat (
  id text primary key default 'cron',
  last_tick_at timestamptz not null,
  last_lifecycle jsonb,
  last_error text
);

create table if not exists public.system_alerts (
  key text primary key,
  severity text not null check (severity in ('critical', 'high', 'medium')),
  title text not null,
  detail text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  resolved_at timestamptz,
  notified_resolved_at timestamptz,
  occurrences integer not null default 1
);

create index if not exists system_alerts_resolved_idx
  on public.system_alerts (resolved_at);

alter table public.system_heartbeat enable row level security;
alter table public.system_alerts enable row level security;

revoke all on public.system_heartbeat from anon, authenticated;
revoke all on public.system_alerts from anon, authenticated;
grant select on public.system_heartbeat to authenticated;
grant select on public.system_alerts to authenticated;
grant select, insert, update on public.system_heartbeat to service_role;
grant select, insert, update on public.system_alerts to service_role;

drop policy if exists system_heartbeat_select_admin on public.system_heartbeat;
create policy system_heartbeat_select_admin on public.system_heartbeat
  for select to authenticated using (public.is_admin());

drop policy if exists system_alerts_select_admin on public.system_alerts;
create policy system_alerts_select_admin on public.system_alerts
  for select to authenticated using (public.is_admin());

-- catalog_sync_runs tenía RLS sin políticas (nadie leía desde la API).
grant select on public.catalog_sync_runs to authenticated;
drop policy if exists catalog_sync_runs_select_admin on public.catalog_sync_runs;
create policy catalog_sync_runs_select_admin on public.catalog_sync_runs
  for select to authenticated using (public.is_admin());
