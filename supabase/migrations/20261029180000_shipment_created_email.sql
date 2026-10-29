-- Correo "ya tenés tu número de seguimiento" al crear la guía.
alter table public.order_notification_outbox
  drop constraint if exists order_notification_outbox_event_type_check;
alter table public.order_notification_outbox
  add constraint order_notification_outbox_event_type_check check (event_type in (
    'customer_order_received',
    'team_new_order',
    'customer_payment_approved',
    'customer_payment_rejected',
    'customer_order_ready',
    'customer_shipment_created',
    'customer_order_shipped',
    'customer_order_delivered',
    'customer_payment_reminder',
    'customer_order_expired'
  ));
