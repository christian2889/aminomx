-- ============================================================================
-- Aminos MX — Stripe: referencias de pago en el pedido
-- ============================================================================

alter table public.orders
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text,
  add column if not exists paid_at timestamptz;

create index if not exists orders_stripe_session_idx
  on public.orders(stripe_session_id) where stripe_session_id is not null;

comment on column public.orders.stripe_session_id is 'Stripe Checkout Session (cs_...)';
comment on column public.orders.stripe_payment_intent is 'Stripe PaymentIntent (pi_...)';
