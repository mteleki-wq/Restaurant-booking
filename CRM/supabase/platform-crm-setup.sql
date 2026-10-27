-- =====================================================================
-- Restaurant Deluxe — Venue CRM setup
-- Run once in the Supabase SQL editor. Safe to run again (idempotent).
--
-- Adds:
--   1. rd_venue_accounts  — the commercial side of each live venue
--                            (stage, plan, fee, trial end, contact, notes)
--   2. rd_platform_health() — one row of health figures per venue
--
-- Nothing here changes existing tables or data. Both objects are
-- reachable only through the service role (the rd-control Edge
-- Function), never from a restaurant's staff login.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Commercial record per venue
-- ---------------------------------------------------------------------
create table if not exists public.rd_venue_accounts (
  venue_id       uuid primary key references public.rd_venues(id) on delete cascade,
  stage          text not null default 'trial'
                 check (stage in ('onboarding','trial','paying','at_risk','paused','churned')),
  plan           text,
  monthly_fee    numeric(10,2),
  setup_fee      numeric(10,2),
  trial_ends_on  date,
  started_on     date,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  notes          text,
  updated_at     timestamptz not null default now()
);

alter table public.rd_venue_accounts enable row level security;
-- No policies on purpose: only the service role (the Edge Function)
-- reads or writes it. Platform admins may read it directly if wanted:
drop policy if exists rd_venue_accounts_admin_read on public.rd_venue_accounts;
create policy rd_venue_accounts_admin_read on public.rd_venue_accounts
  for select to authenticated using (public.rd_is_platform_admin());

-- Every existing venue gets a starting row (trial), so the CRM is never empty.
insert into public.rd_venue_accounts (venue_id, stage, started_on)
select v.id, 'trial', v.created_at::date
from public.rd_venues v
on conflict (venue_id) do nothing;

-- New venues get one automatically.
create or replace function public.rd_venue_accounts_autocreate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.rd_venue_accounts (venue_id, stage, started_on)
  values (new.id, 'onboarding', current_date)
  on conflict (venue_id) do nothing;
  return new;
end $$;

drop trigger if exists rd_venue_accounts_autocreate on public.rd_venues;
create trigger rd_venue_accounts_autocreate
  after insert on public.rd_venues
  for each row execute function public.rd_venue_accounts_autocreate();

-- ---------------------------------------------------------------------
-- 2. Health figures, one row per venue
--    Never returns Stripe keys — only whether a key is present.
-- ---------------------------------------------------------------------
create or replace function public.rd_platform_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(h) order by h.name), '[]'::jsonb)
  from (
    select
      v.id, v.slug, v.name, v.created_at,
      v.ordering_enabled, v.accepting_orders, v.payment_mode, v.printing_mode,
      v.kitchen_mode, v.terms_accepted_at, v.order_page_url,
      (v.logo_url is not null and v.logo_url <> '')                    as has_logo,

      -- trade
      (select max(o.created_at) from rd_orders o where o.venue_id = v.id) as last_order_at,
      (select count(*) from rd_orders o where o.venue_id = v.id
         and o.created_at >= now() - interval '7 days'
         and o.status <> 'cancelled')                                   as orders_7d,
      (select count(*) from rd_orders o where o.venue_id = v.id
         and o.created_at >= now() - interval '14 days'
         and o.created_at <  now() - interval '7 days'
         and o.status <> 'cancelled')                                   as orders_prev_7d,
      (select coalesce(sum(o.total_cents),0) from rd_orders o where o.venue_id = v.id
         and o.created_at >= now() - interval '7 days'
         and o.status <> 'cancelled')                                   as revenue_7d_cents,
      (select coalesce(sum(o.total_cents),0) from rd_orders o where o.venue_id = v.id
         and o.created_at >= now() - interval '30 days'
         and o.status <> 'cancelled')                                   as revenue_30d_cents,
      (select count(*) from rd_orders o where o.venue_id = v.id
         and o.created_at >= now() - interval '7 days'
         and o.status = 'cancelled')                                    as cancelled_7d,
      (select count(distinct o.service_date) from rd_orders o where o.venue_id = v.id
         and o.created_at >= now() - interval '30 days')                as trading_days_30d,

      -- operations
      (select count(*) from rd_print_jobs j where j.venue_id = v.id
         and j.status = 'failed'
         and j.created_at >= now() - interval '7 days')                 as failed_prints_7d,
      (select count(*) from rd_print_jobs j where j.venue_id = v.id
         and j.status in ('queued','pending','dispatched')
         and j.created_at < now() - interval '10 minutes'
         and j.created_at >= now() - interval '2 days')                 as stuck_prints,
      (select count(*) from rd_printers p where p.venue_id = v.id and p.enabled) as printers,
      (select count(*) from rd_printers p where p.venue_id = v.id and p.enabled
         and (p.last_seen_at is null or p.last_seen_at < now() - interval '30 minutes')) as printers_quiet,
      (select count(*) from rd_service_requests r where r.venue_id = v.id
         and r.done_at is null
         and r.created_at < now() - interval '15 minutes'
         and r.created_at >= now() - interval '1 day')                  as stale_requests,

      -- setup
      (select count(*) from rd_items i where i.venue_id = v.id and i.visible) as menu_items,
      (select count(*) from rd_tables t where t.venue_id = v.id and t.active)  as tables,
      (select count(*) from rd_staff s where s.venue_id = v.id)                as staff,
      exists (select 1 from rd_venue_stripe s where s.venue_id = v.id
                and s.secret_key is not null and s.secret_key <> '')    as has_stripe,

      -- commercial
      a.stage, a.plan, a.monthly_fee, a.setup_fee, a.trial_ends_on, a.started_on,
      a.contact_name, a.contact_email, a.contact_phone, a.notes,
      a.updated_at as account_updated_at
    from rd_venues v
    left join rd_venue_accounts a on a.venue_id = v.id
  ) h;
$$;

revoke all on function public.rd_platform_health() from public, anon, authenticated;
grant execute on function public.rd_platform_health() to service_role;
