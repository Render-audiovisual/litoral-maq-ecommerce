-- Additive only. Null preserves the existing editorial labels during rollout.
alter table public.products add column if not exists best_seller boolean;
comment on column public.products.best_seller is 'Editable Más vendido label; null retains the historical selection.';
