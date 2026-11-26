-- =====================================================================
-- Webescapade Site Builder — Customers, Email Studio and Insights
-- Customers + Email Studio: Platinum websites whose booking connection
-- points at a Restaurant / Service / Trade Deluxe business that the
-- signed-in owner actually runs (venue_staff), or a platform admin.
-- Insights (visits + clicks, no cookies, no personal details): Platinum.
-- =====================================================================

-- ---------- customers ----------
create table if not exists public.builder_contacts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.builder_sites(id) on delete cascade,
  email text not null,
  name text, phone text,
  sources text[] not null default '{}',
  messages int not null default 0,
  orders int not null default 0,
  spent_cents int not null default 0,
  bookings int not null default 0,
  first_seen timestamptz, last_seen timestamptz,
  subscribed boolean not null default false,
  consent_source text, consent_at timestamptz, unsub_at timestamptz,
  token uuid not null default gen_random_uuid(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, email)
);
create index if not exists builder_contacts_token on public.builder_contacts(token);
alter table public.builder_contacts enable row level security;
drop policy if exists "owner read" on public.builder_contacts;
create policy "owner read" on public.builder_contacts for select to authenticated using (public.builder_owns_site(site_id));
drop policy if exists "owner delete" on public.builder_contacts;
create policy "owner delete" on public.builder_contacts for delete to authenticated using (public.builder_owns_site(site_id));

-- ---------- campaigns + sends ----------
create table if not exists public.builder_campaigns (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.builder_sites(id) on delete cascade,
  subject text not null default '', content jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','sending','sent')),
  recipients int not null default 0, delivered int not null default 0,
  sent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.builder_campaigns enable row level security;
drop policy if exists "owner all" on public.builder_campaigns;
create policy "owner all" on public.builder_campaigns for all to authenticated
  using (public.builder_owns_site(site_id)) with check (public.builder_owns_site(site_id) and status = 'draft');

create table if not exists public.builder_email_sends (
  id bigserial primary key,
  site_id uuid not null references public.builder_sites(id) on delete cascade,
  campaign_id uuid references public.builder_campaigns(id) on delete set null,
  email text not null, ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists builder_email_sends_site on public.builder_email_sends(site_id, created_at);
alter table public.builder_email_sends enable row level security;
drop policy if exists "owner read" on public.builder_email_sends;
create policy "owner read" on public.builder_email_sends for select to authenticated using (public.builder_owns_site(site_id));

-- ---------- consent on the website (contact form, shop) ----------
alter table public.builder_messages add column if not exists marketing_ok boolean not null default false;
alter table public.builder_orders add column if not exists marketing_ok boolean not null default false;

create or replace function public.submit_site_message(p_slug text, p_name text, p_email text, p_phone text, p_message text, p_marketing boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_recent int;
begin
  select id into v_site from public.builder_sites where slug = lower(p_slug) and published is not null;
  if v_site is null then raise exception 'website not found'; end if;
  if coalesce(length(trim(p_message)), 0) = 0 then raise exception 'Please write a message.'; end if;
  select count(*) into v_recent from public.builder_messages where site_id = v_site and created_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'Too many messages right now — please try again later.'; end if;
  insert into public.builder_messages (site_id, name, email, phone, message, marketing_ok)
  values (v_site, left(trim(p_name), 200), left(trim(p_email), 200), left(trim(p_phone), 60), left(trim(p_message), 3000),
          coalesce(p_marketing, false) and coalesce(trim(p_email), '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$');
  return jsonb_build_object('ok', true);
end $$;
drop function if exists public.submit_site_message(text, text, text, text, text);
grant execute on function public.submit_site_message(text, text, text, text, text, boolean) to anon, authenticated;

-- ---------- analytics ----------
create table if not exists public.builder_events (
  id bigserial primary key,
  site_id uuid not null references public.builder_sites(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,          -- view | click
  path text, label text, cat text, ref text, device text, sid text
);
create index if not exists builder_events_site_at on public.builder_events(site_id, at);
alter table public.builder_events enable row level security;   -- no policies: only the functions below touch it

create or replace function public.builder_track(p_slug text, p_events jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_site uuid; n int; e jsonb; k text;
begin
  if jsonb_typeof(p_events) <> 'array' then return; end if;
  select id into v_site from builder_sites where slug = lower(p_slug) and published is not null;
  if v_site is null then return; end if;
  select count(*) into n from builder_events where site_id = v_site and at > now() - interval '1 minute';
  if n > 1500 then return; end if;
  for e in select * from jsonb_array_elements(p_events) limit 20 loop
    k := e->>'k';
    if k is null or k not in ('view', 'click') then continue; end if;
    insert into builder_events (site_id, kind, path, label, cat, ref, device, sid) values (
      v_site, k,
      left(coalesce(e->>'p', ''), 120),
      left(nullif(regexp_replace(coalesce(e->>'l', ''), '[^[:print:]]', '', 'g'), ''), 80),
      case when e->>'c' in ('book','call','email','chat','shop','menu','link','button','map','social') then e->>'c' end,
      left(nullif(lower(regexp_replace(coalesce(e->>'r', ''), '^www\.', '')), ''), 80),
      case when e->>'d' in ('phone','tablet','computer') then e->>'d' end,
      left(nullif(e->>'s', ''), 24));
  end loop;
end $$;
grant execute on function public.builder_track(text, jsonb) to anon, authenticated;

-- ---------- who may use what ----------
create or replace function public.builder_hub_access(p_site uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s builder_sites; plat boolean; bk jsonb; sys text; code text; v venues; staff boolean := false; adm boolean; why text := '';
begin
  select * into s from builder_sites where id = p_site and owner = auth.uid();
  if not found then raise exception 'Not your website.'; end if;
  plat := coalesce((select plan from builder_accounts where user_id = auth.uid()), 'standard') = 'platinum';
  adm := exists(select 1 from platform_admins where user_id = auth.uid());
  bk := coalesce(s.published->'booking', s.draft->'booking', '{}'::jsonb);
  sys := bk->>'system';
  code := lower(trim(coalesce(nullif(bk->>'venue', ''), substring(coalesce(bk->>'url', '') from '[?&](?:venue|b)=([A-Za-z0-9-]+)'), '')));
  if sys in ('restaurant', 'service', 'trades') and code <> '' then
    select * into v from venues where slug = code;
    if found then staff := adm or exists(select 1 from venue_staff where venue_id = v.id and user_id = auth.uid()); end if;
  end if;
  if not plat then why := 'platinum';
  elsif sys is null or sys not in ('restaurant', 'service', 'trades') or code = '' then why := 'booking';
  elsif v.id is null then why := 'unknown';
  elsif not staff then why := 'staff';
  end if;
  return jsonb_build_object('platinum', plat, 'insights', plat, 'crm', why = '', 'reason', why,
    'system', sys, 'code', nullif(code, ''), 'venue', v.name);
end $$;
grant execute on function public.builder_hub_access(uuid) to authenticated;

-- ---------- gather customers from every source ----------
create or replace function public.builder_crm_sync(p_site uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare acc jsonb; vid uuid; n int;
begin
  acc := builder_hub_access(p_site);
  if not (acc->>'crm')::boolean then raise exception 'Customers are not available for this website yet.'; end if;
  select id into vid from venues where slug = acc->>'code';
  with raw as (
    select lower(trim(email)) em, nullif(trim(name), '') nm, nullif(trim(phone), '') ph, 'website' src, 1 msg, 0 ord, 0 spent, 0 bk, created_at at, marketing_ok ok, 'website form' how
      from builder_messages where site_id = p_site
    union all
    select lower(trim(customer->>'email')), nullif(trim(customer->>'name'), ''), nullif(trim(customer->>'phone'), ''), 'shop', 0, 1, total_cents, 0, coalesce(paid_at, created_at), marketing_ok, 'shop checkout'
      from builder_orders where site_id = p_site and status in ('paid', 'fulfilled')
    union all
    select lower(trim(email)), nullif(trim(name), ''), nullif(trim(phone), ''), 'booking', 0, 0, 0, 1, booking_date::timestamptz, false, null
      from bookings where acc->>'system' = 'restaurant' and venue_id = vid
    union all
    select lower(trim(client_email)), nullif(trim(client_name), ''), nullif(trim(client_phone), ''), 'booking', 0, 0, 0, 1, starts_at, coalesce(marketing_ok, false), 'booking form'
      from svc_appointments where acc->>'system' = 'service' and venue_id = vid
    union all
    select lower(trim(customer_email)), nullif(trim(customer_name), ''), nullif(trim(customer_phone), ''), 'booking', 0, 0, 0, 1, job_date::timestamptz, false, null
      from trd_jobs where acc->>'system' = 'trades' and venue_id = vid
  ), agg as (
    select em,
      (array_agg(nm order by at desc) filter (where nm is not null))[1] nm,
      (array_agg(ph order by at desc) filter (where ph is not null))[1] ph,
      array_agg(distinct src) srcs, sum(msg)::int msgs, sum(ord)::int ords, sum(spent)::int spent, sum(bk)::int bks,
      min(at) first_at, max(at) last_at, bool_or(ok) ok,
      (array_agg(how order by at) filter (where ok))[1] how
    from raw where em ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' group by em
  )
  insert into builder_contacts as c (site_id, email, name, phone, sources, messages, orders, spent_cents, bookings, first_seen, last_seen, subscribed, consent_source, consent_at)
  select p_site, em, nm, ph, srcs, msgs, ords, spent, bks, first_at, last_at, ok, case when ok then how end, case when ok then now() end from agg
  on conflict (site_id, email) do update set
    name = coalesce(excluded.name, c.name), phone = coalesce(excluded.phone, c.phone),
    sources = (select array_agg(distinct x) from unnest(c.sources || excluded.sources) x),
    messages = excluded.messages, orders = excluded.orders, spent_cents = excluded.spent_cents, bookings = excluded.bookings,
    first_seen = least(c.first_seen, excluded.first_seen), last_seen = greatest(c.last_seen, excluded.last_seen),
    subscribed = case when c.unsub_at is not null then false else c.subscribed or excluded.subscribed end,
    consent_source = case when c.unsub_at is null and not c.subscribed and excluded.subscribed then excluded.consent_source else c.consent_source end,
    consent_at = case when c.unsub_at is null and not c.subscribed and excluded.subscribed then now() else c.consent_at end,
    updated_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'touched', n, 'total', (select count(*) from builder_contacts where site_id = p_site));
end $$;
grant execute on function public.builder_crm_sync(uuid) to authenticated;

-- owner changes a contact: notes, or subscribe someone who told them they want emails.
-- Someone who unsubscribed can only sign up again themselves.
create or replace function public.builder_contact_set(p_id uuid, p_subscribed boolean, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c builder_contacts;
begin
  select * into c from builder_contacts where id = p_id;
  if not found or not builder_owns_site(c.site_id) then raise exception 'Customer not found.'; end if;
  if p_subscribed and not c.subscribed and c.unsub_at is not null then
    raise exception 'This person unsubscribed, so only they can sign up again.';
  end if;
  update builder_contacts set
    subscribed = coalesce(p_subscribed, subscribed),
    consent_source = case when p_subscribed and not c.subscribed then 'added by owner' else consent_source end,
    consent_at = case when p_subscribed and not c.subscribed then now() else consent_at end,
    notes = case when p_notes is null then notes else left(p_notes, 2000) end,
    updated_at = now()
  where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.builder_contact_set(uuid, boolean, text) to authenticated;

-- public unsubscribe link (token in every email)
create or replace function public.builder_unsubscribe(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c builder_contacts; nm text;
begin
  select * into c from builder_contacts where token = p_token;
  if not found then return jsonb_build_object('ok', true); end if;
  update builder_contacts set subscribed = false, unsub_at = coalesce(unsub_at, now()), updated_at = now() where id = c.id;
  select name into nm from builder_sites where id = c.site_id;
  return jsonb_build_object('ok', true, 'business', nm);
end $$;
grant execute on function public.builder_unsubscribe(uuid) to anon, authenticated;

-- ---------- insights for the owner ----------
create or replace function public.builder_insights(p_site uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare acc jsonb; d int := greatest(1, least(coalesce(p_days, 30), 365)); since timestamptz; r jsonb;
begin
  acc := builder_hub_access(p_site);
  if not (acc->>'insights')::boolean then raise exception 'Insights are a Platinum feature.'; end if;
  since := (date_trunc('day', now() at time zone 'Australia/Sydney') - make_interval(days => d - 1)) at time zone 'Australia/Sydney';
  with ev as (select * from builder_events where site_id = p_site and at >= since)
  select jsonb_build_object(
    'days', d,
    'visits', (select count(distinct sid) from ev where kind = 'view'),
    'views', (select count(*) from ev where kind = 'view'),
    'clicks', (select count(*) from ev where kind = 'click'),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(g, 'YYYY-MM-DD'), 'visits', coalesce(x.v, 0), 'views', coalesce(x.p, 0), 'clicks', coalesce(x.c, 0)) order by g), '[]')
               from generate_series((since at time zone 'Australia/Sydney')::date, (now() at time zone 'Australia/Sydney')::date, interval '1 day') g
               left join (select (at at time zone 'Australia/Sydney')::date dd, count(distinct sid) filter (where kind = 'view') v, count(*) filter (where kind = 'view') p, count(*) filter (where kind = 'click') c from ev group by 1) x on x.dd = g::date),
    'pages', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (select coalesce(nullif(path, ''), '/') path, count(*) n from ev where kind = 'view' group by 1 order by 2 desc limit 10) t),
    'sources', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (select coalesce(ref, 'direct') src, count(distinct sid) n from ev where kind = 'view' group by 1 order by 2 desc limit 10) t),
    'devices', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (select coalesce(device, 'computer') device, count(distinct sid) n from ev where kind = 'view' group by 1) t),
    'actions', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (select coalesce(cat, 'button') cat, count(*) n from ev where kind = 'click' group by 1) t),
    'buttons', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (select coalesce(label, '(no text)') label, coalesce(cat, 'button') cat, count(*) n from ev where kind = 'click' group by 1, 2 order by 3 desc limit 12) t)
  ) into r;
  return r;
end $$;
grant execute on function public.builder_insights(uuid, int) to authenticated;

-- keep analytics for 13 months (call from a schedule if wanted)
create or replace function public.builder_events_prune() returns void language sql security definer set search_path = public as $$
  delete from builder_events where at < now() - interval '13 months';
$$;
revoke execute on function public.builder_events_prune() from public, anon, authenticated;
