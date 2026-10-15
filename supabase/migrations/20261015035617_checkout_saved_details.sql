-- Optional delivery/contact details, separate from Auth and profiles.
CREATE TABLE public.customer_checkout_details (
  customer_id uuid PRIMARY KEY,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 8192),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_checkout_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_checkout_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_checkout_details TO service_role;
COMMENT ON TABLE public.customer_checkout_details IS 'Opt-in checkout details; access only via identity-verified checkout-details Edge Function.';
