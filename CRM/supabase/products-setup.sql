-- Email Studio v35: one studio, two products (already applied to the live project, Nov 2026).
-- crm_products holds what the AI may say about each product (facts, rules, offer/prices),
-- edited from the Studio's AI tab > "Product facts & prices". Only rd-control (service role) reads it.
create table if not exists public.crm_products (
  key        text primary key check (key in ('restaurant','service')),
  name       text not null,
  facts      text not null default '',
  rules      text,
  offer      jsonb,
  updated_at timestamptz not null default now()
);
alter table public.crm_products enable row level security;
revoke all on public.crm_products from anon, authenticated;

-- every prospect belongs to one product; existing ones are restaurants
alter table public.crm_prospects add column if not exists product text not null default 'restaurant';
-- (constraint crm_prospects_product_chk: product in ('restaurant','service'))
create index if not exists crm_prospects_product_idx on public.crm_prospects (product);
