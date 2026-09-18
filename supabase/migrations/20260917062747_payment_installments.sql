-- Conserva el detalle confirmado por Mercado Pago para mostrar exactamente
-- cómo se abonó el pedido, sin inferir cuotas desde el total.
--
-- Reconstruida para que coincida con lo que ya está aplicado en producción
-- bajo esta misma versión (20260917062747): originalmente esta migración y
-- la de 20260917162523 viajaban juntas en un solo archivo
-- (20260917063000_payment_installments.sql, PR #47), pero se aplicaron por
-- separado con `apply_migration` en vez de con `db push`, así que quedaron
-- registradas en producción con sus propias versiones. Este archivo separa
-- el historial local para que coincida con el real; no cambia nada en la base.
alter table public.payments
  add column if not exists installments integer check (installments between 1 and 24),
  add column if not exists installment_amount numeric check (installment_amount >= 0),
  add column if not exists payment_method_id text,
  add column if not exists payment_type_id text;
