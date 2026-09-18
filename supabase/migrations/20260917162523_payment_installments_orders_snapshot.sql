-- Snapshot de lectura para correos, cuenta del cliente y mensajes de WhatsApp.
-- La única escritura productiva de estos campos ocurre en el webhook firmado.
--
-- Reconstruida para que coincida con lo que ya está aplicado en producción
-- bajo esta misma versión (20260917162523) — ver el comentario en
-- 20260917062747_payment_installments.sql para el porqué de la separación.
alter table public.orders
  add column if not exists payment_installments smallint check (payment_installments between 1 and 24),
  add column if not exists payment_installment_amount numeric check (payment_installment_amount >= 0),
  add column if not exists payment_method_id text,
  add column if not exists payment_type_id text;
