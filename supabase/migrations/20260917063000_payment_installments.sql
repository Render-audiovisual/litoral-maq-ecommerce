-- Conserva el detalle confirmado por Mercado Pago para mostrar exactamente
-- cómo se abonó el pedido, sin inferir cuotas desde el total.

alter table public.payments
  add column if not exists installments smallint check (installments between 1 and 24),
  add column if not exists installment_amount numeric check (installment_amount >= 0),
  add column if not exists payment_method_id text,
  add column if not exists payment_type_id text;

-- Snapshot de lectura para correos, cuenta del cliente y mensajes de WhatsApp.
-- La única escritura productiva de estos campos ocurre en el webhook firmado.
alter table public.orders
  add column if not exists payment_installments smallint check (payment_installments between 1 and 24),
  add column if not exists payment_installment_amount numeric check (payment_installment_amount >= 0),
  add column if not exists payment_method_id text,
  add column if not exists payment_type_id text;

