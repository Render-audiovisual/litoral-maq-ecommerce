-- Mercado Pago ya informaba cómo pagó el cliente, pero el webhook solo guardaba
-- el estado. Sin estas columnas no se puede decir "3 cuotas de $50.000" en el
-- panel, el correo ni el WhatsApp.
--
-- installment_amount viene de transaction_details.installment_amount y YA INCLUYE
-- el interés: dividir el total por la cantidad de cuotas mostraría menos de lo
-- que el cliente realmente paga por mes.

alter table public.payments add column if not exists installments integer
  check (installments is null or installments between 1 and 24);
alter table public.payments add column if not exists installment_amount numeric
  check (installment_amount is null or installment_amount >= 0);
alter table public.payments add column if not exists payment_method_id text;
alter table public.payments add column if not exists payment_type_id text;

comment on column public.payments.installments is
  'Cantidad de cuotas informada por Mercado Pago.';
comment on column public.payments.installment_amount is
  'Importe de cada cuota segun Mercado Pago, con interes incluido.';
comment on column public.payments.payment_method_id is
  'Medio concreto: visa, master, pagofacil, etc.';
comment on column public.payments.payment_type_id is
  'Tipo de medio: credit_card, debit_card, ticket, bank_transfer, account_money.';
