-- Service Deluxe in the Venue CRM: an account record per service business
-- (stage, plan, fees, trial, contact, notes) and one health read-out.
create table if not exists public.svc_accounts (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  stage text, plan text, monthly_fee numeric, setup_fee numeric,
  trial_ends_on date, started_on date,
  contact_name text, contact_email text, contact_phone text, notes text,
  updated_at timestamptz not null default now()
);
alter table public.svc_accounts enable row level security;   -- no policies: service role only
revoke all on public.svc_accounts from anon, authenticated;

create or replace function public.svc_platform_health()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(h) order by h.name), '[]'::jsonb)
  from (
    select v.id, v.slug, v.name, v.created_at, v.phone, v.email, v.active,
      s.business_type, s.practitioner_word, s.service_word,
      (select count(*) from svc_providers p where p.venue_id = v.id and p.active) as providers,
      (select count(*) from svc_services x where x.venue_id = v.id and x.active) as services,
      (select count(*) from svc_rooms r where r.venue_id = v.id and r.active) as rooms,
      (select count(*) from svc_hours hh where hh.venue_id = v.id) as hours_rows,
      (select count(*) from venue_staff st where st.venue_id = v.id) as staff,
      (select u.email from venue_staff st join auth.users u on u.id = st.user_id
         where st.venue_id = v.id order by (st.role = 'owner') desc limit 1) as login_email,
      (select max(a.created_at) from svc_appointments a where a.venue_id = v.id) as last_booking_at,
      (select count(*) from svc_appointments a where a.venue_id = v.id and a.status <> 'cancelled'
         and a.created_at >= now() - interval '7 days') as bookings_7d,
      (select count(*) from svc_appointments a where a.venue_id = v.id and a.status <> 'cancelled'
         and a.created_at >= now() - interval '14 days' and a.created_at < now() - interval '7 days') as bookings_prev_7d,
      (select count(*) from svc_appointments a where a.venue_id = v.id and a.status <> 'cancelled'
         and a.starts_at >= now()) as upcoming,
      (select count(*) from svc_appointments a where a.venue_id = v.id and a.status <> 'cancelled'
         and a.starts_at >= now() and a.starts_at < now() + interval '7 days') as next_7d,
      (select coalesce(sum(a.price_cents),0) from svc_appointments a where a.venue_id = v.id and a.status <> 'cancelled'
         and a.starts_at >= now() - interval '30 days' and a.starts_at < now()) as value_30d_cents,
      (select count(*) from svc_appointments a where a.venue_id = v.id and a.status = 'cancelled'
         and a.updated_at >= now() - interval '7 days') as cancelled_7d,
      (select count(*) from svc_appointments a where a.venue_id = v.id and a.status <> 'cancelled'
         and a.source = 'staff' and a.created_at >= now() - interval '30 days') as staff_made_30d,
      ac.stage, ac.plan, ac.monthly_fee, ac.setup_fee, ac.trial_ends_on, ac.started_on,
      ac.contact_name, ac.contact_email, ac.contact_phone, ac.notes, ac.updated_at as account_updated_at
    from svc_settings s
    join venues v on v.id = s.venue_id
    left join svc_accounts ac on ac.venue_id = v.id
  ) h;
$$;
revoke all on function public.svc_platform_health() from public, anon, authenticated;
grant execute on function public.svc_platform_health() to service_role;
