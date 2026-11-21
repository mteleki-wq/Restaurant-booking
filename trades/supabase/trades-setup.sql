-- ============================================================
--  Trade Deluxe — database setup (Supabase, same project as Service Deluxe)
-- ============================================================
--  Shares venues / venue_staff / platform_admins with the other products.
--  Each trade business = one venues row + one trd_settings row.
--  All access goes through SECURITY DEFINER functions below; the tables
--  themselves have RLS on and no policies, so nothing is readable directly.
--
--  config (jsonb) holds the same shape the app uses:
--    { biz:{...settings, baseLat, baseLng}, team:[...], jobTypes:[...] }
--  Bookings ("jobs") and quotes live in their own tables.
--  Travel between suburbs is re-checked on the server with the same
--  formula as the browser (5-minute tolerance), so two customers can't
--  squeeze a tradie into an impossible run at the same moment.
-- ============================================================

create table if not exists public.trd_settings (
  venue_id   uuid primary key references public.venues(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  join_key   uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trd_jobs (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  ref            text not null unique,
  job_date       date not null,
  start_min      int  not null check (start_min between 0 and 1439),
  mins           int  not null check (mins between 5 and 1440),
  tech_id        text not null,
  type_id        text,
  cat            text,
  title          text not null,
  customer_name  text not null,
  customer_phone text,
  customer_email text,
  street         text,
  suburb         text not null,
  lat            double precision,
  lng            double precision,
  notes          text,
  status         text not null default 'booked' check (status in ('booked','done','cancelled')),
  win_from       int,
  win_to         int,
  emergency      boolean not null default false,
  after_hours    boolean not null default false,
  paid_cents     int,
  pay_ref        text,
  series_id      uuid,
  series_idx     int,
  series_n       int,
  repeat_every   int,
  quote_id       uuid,
  source         text not null default 'online',
  cancel_token   uuid not null default gen_random_uuid(),
  created_at     timestamptz not null default now()
);
create index if not exists trd_jobs_day_idx on public.trd_jobs (venue_id, job_date);

create table if not exists public.trd_quotes (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  ref            text not null unique,
  type_id        text,
  cat            text,
  title          text not null,
  customer_name  text not null,
  customer_phone text,
  customer_email text,
  street         text,
  suburb         text,
  lat            double precision,
  lng            double precision,
  description    text,
  photos         jsonb not null default '[]'::jsonb,
  prefer         text,
  status         text not null default 'new' check (status in ('new','sent','accepted','booked','declined')),
  lines          jsonb not null default '[]'::jsonb,
  est_mins       int,
  valid_days     int,
  note           text,
  sent_at        timestamptz,
  token          uuid not null default gen_random_uuid(),
  booking_id     uuid,
  deposit_cents  int,
  created_at     timestamptz not null default now()
);
create index if not exists trd_quotes_venue_idx on public.trd_quotes (venue_id, created_at desc);

create table if not exists public.trd_travel (
  venue_id   uuid not null references public.venues(id) on delete cascade,
  a          text not null,
  b          text not null,
  mins       int  not null check (mins between 0 and 600),
  updated_at timestamptz not null default now(),
  primary key (venue_id, a, b)
);

alter table public.trd_settings enable row level security;
alter table public.trd_jobs     enable row level security;
alter table public.trd_quotes   enable row level security;
alter table public.trd_travel   enable row level security;
revoke all on public.trd_settings, public.trd_jobs, public.trd_quotes, public.trd_travel from anon, authenticated;

-- CRM: Trade Deluxe leads get their own product list
alter table public.crm_prospects drop constraint if exists crm_prospects_product_chk;
alter table public.crm_prospects add constraint crm_prospects_product_chk
  check (product = any (array['restaurant','service','function','trade']));

-- ------------------------------------------------------------
--  helpers
-- ------------------------------------------------------------
create or replace function public.trd_is_staff(p_venue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from venue_staff where venue_id = p_venue and user_id = auth.uid())
      or exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create or replace function public.trd_hm(p text)
returns int language sql immutable as $$
  select coalesce(split_part(p, ':', 1)::int * 60 + coalesce(nullif(split_part(p, ':', 2), '')::int, 0), 0);
$$;

-- drive minutes between two points: saved Google time by suburb name if we have it, otherwise the estimate
create or replace function public.trd_travel_min(p_venue uuid, p_cfg jsonb, a_sub text, a_lat float8, a_lng float8,
                                                 b_sub text, b_lat float8, b_lng float8)
returns int language plpgsql stable security definer set search_path = public as $$
declare biz jsonb := p_cfg->'biz'; buf int := coalesce((biz->>'bufferMin')::int, 10);
        c int; km float8; m float8;
begin
  if a_sub is not null and a_sub = b_sub then return buf + 5; end if;
  select mins into c from trd_travel where venue_id = p_venue and ((a = a_sub and b = b_sub) or (a = b_sub and b = a_sub)) limit 1;
  if c is not null then return greatest(buf + 5, ceil((c + buf) / 5.0)::int * 5); end if;
  if a_lat is null or b_lat is null then return coalesce((biz->>'unknownTravel')::int, 40); end if;
  km := 2 * 6371 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
        + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)));
  m := km * coalesce((biz->>'roadFactor')::float8, 1.35) / greatest(coalesce((biz->>'speedKmh')::float8, 28), 5) * 60 + buf;
  return greatest(buf + 5, ceil(m / 5)::int * 5);
end $$;

-- can this tradie take a job at this time and place? returns null when yes, otherwise the reason
create or replace function public.trd_fit_error(p_venue uuid, p_cfg jsonb, p_tech text, p_date date, p_start int, p_mins int,
                                                p_sub text, p_lat float8, p_lng float8, p_emerg boolean, p_ignore uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t jsonb; biz jsonb := p_cfg->'biz'; e jsonb := coalesce(p_cfg->'biz'->'emergency', '{}'::jsonb);
        normal boolean; hs int; he int; prv trd_jobs; nxt trd_jobs; tin int; tout int; tol int := 5;
        b_sub text; b_lat float8; b_lng float8;
begin
  select x into t from jsonb_array_elements(p_cfg->'team') x where x->>'id' = p_tech and coalesce((x->>'active')::boolean, true) limit 1;
  if t is null then return 'That tradie is not available.'; end if;
  normal := (t->'days') @> to_jsonb(extract(dow from p_date)::int)
            and not coalesce((t->'off') @> to_jsonb(p_date::text), false);
  if p_emerg and coalesce((e->>'on')::boolean, false) and coalesce((t->>'onCall')::boolean, false) then
    hs := least(trd_hm(e->>'start'), case when normal then trd_hm(t->>'start') else 1440 end);
    he := greatest(trd_hm(e->>'end'), case when normal then trd_hm(t->>'end') else 0 end);
  elsif normal then
    hs := trd_hm(t->>'start'); he := trd_hm(t->>'end');
  else
    return 'Not working that day.';
  end if;
  if p_start < hs or p_start + p_mins > he then return 'Outside working hours.'; end if;

  if exists (select 1 from trd_jobs j where j.venue_id = p_venue and j.tech_id = p_tech and j.job_date = p_date
               and j.status <> 'cancelled' and j.id is distinct from p_ignore
               and j.start_min < p_start + p_mins and j.start_min + j.mins > p_start) then
    return 'Already booked then.';
  end if;
  select * into prv from trd_jobs j where j.venue_id = p_venue and j.tech_id = p_tech and j.job_date = p_date
     and j.status <> 'cancelled' and j.id is distinct from p_ignore and j.start_min + j.mins <= p_start
   order by j.start_min desc limit 1;
  select * into nxt from trd_jobs j where j.venue_id = p_venue and j.tech_id = p_tech and j.job_date = p_date
     and j.status <> 'cancelled' and j.id is distinct from p_ignore and j.start_min >= p_start + p_mins
   order by j.start_min asc limit 1;

  if prv.id is not null then
    tin := trd_travel_min(p_venue, p_cfg, prv.suburb, prv.lat, prv.lng, p_sub, p_lat, p_lng);
    if prv.start_min + prv.mins + tin > p_start + tol then return 'Not enough time to drive from the job before.'; end if;
  elsif coalesce((biz->>'countFirstLeg')::boolean, true) then
    b_sub := coalesce(t->>'base', biz->>'base'); b_lat := (biz->>'baseLat')::float8; b_lng := (biz->>'baseLng')::float8;
    tin := trd_travel_min(p_venue, p_cfg, b_sub, b_lat, b_lng, p_sub, p_lat, p_lng);
    if p_start + tol < hs + tin then return 'Not enough time to drive from base.'; end if;
  end if;
  if nxt.id is not null then
    tout := trd_travel_min(p_venue, p_cfg, p_sub, p_lat, p_lng, nxt.suburb, nxt.lat, nxt.lng);
    if p_start + p_mins + tout > nxt.start_min + tol then return 'Not enough time to drive to the next job.'; end if;
  end if;
  return null;
end $$;

create or replace function public.trd_ref(p text, p_date date)
returns text language sql volatile as $$
  select p || '-' || to_char(coalesce(p_date, current_date), 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
$$;

-- fire-and-forget email (never blocks a booking)
create or replace function public.trd_notify(p_event text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare sec text;
begin
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'svc_hook_secret';
  perform net.http_post(
    url     := 'https://tehxobdokbvqtwtgqzrh.supabase.co/functions/v1/trd-email',
    body    := jsonb_build_object('event', p_event, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-svc-hook', coalesce(sec, '')));
exception when others then null;
end $$;

-- public (customer-safe) part of the settings
create or replace function public.trd_public_cfg(p_cfg jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'biz', (p_cfg->'biz') - 'labourRate',
    'team', coalesce((select jsonb_agg(jsonb_build_object('id', x->'id', 'name', x->'name', 'role', x->'role', 'skills', x->'skills',
              'color', x->'color', 'days', x->'days', 'start', x->'start', 'end', x->'end', 'active', x->'active',
              'onCall', x->'onCall', 'off', x->'off', 'base', x->'base'))
            from jsonb_array_elements(p_cfg->'team') x), '[]'::jsonb),
    'jobTypes', coalesce(p_cfg->'jobTypes', '[]'::jsonb));
$$;

-- ------------------------------------------------------------
--  public: what the booking page needs (no customer details)
-- ------------------------------------------------------------
create or replace function public.trd_public(p_venue text, p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare v venues; s trd_settings; tz text; d0 date; d1 date;
begin
  select * into v from venues where slug = lower(trim(p_venue)) and coalesce(active, true);
  if not found then return json_build_object('ok', false, 'error', 'We couldn''t find that business.'); end if;
  select * into s from trd_settings where venue_id = v.id;
  if not found then return json_build_object('ok', false, 'error', 'This business isn''t set up for Trade Deluxe.'); end if;
  tz := coalesce(v.timezone, 'Australia/Sydney');
  d0 := coalesce(p_from, (now() at time zone tz)::date);
  d1 := least(coalesce(p_to, d0 + 200), d0 + 400);
  return json_build_object('ok', true,
    'venue', json_build_object('slug', v.slug, 'name', v.name, 'phone', v.phone, 'email', v.email, 'tz', tz),
    'today', to_char(now() at time zone tz, 'YYYY-MM-DD'), 'now_min', extract(hour from now() at time zone tz)::int * 60 + extract(minute from now() at time zone tz)::int,
    'config', trd_public_cfg(s.config),
    'busy', coalesce((select json_agg(json_build_object('id', j.id, 'date', j.job_date, 'start', j.start_min, 'mins', j.mins,
               'techId', j.tech_id, 'suburb', j.suburb, 'lat', j.lat, 'lng', j.lng, 'typeId', j.type_id))
             from trd_jobs j where j.venue_id = v.id and j.status <> 'cancelled' and j.job_date between d0 and d1), '[]'::json),
    'travel', coalesce((select json_object_agg(t.a || '|' || t.b, t.mins) from trd_travel t where t.venue_id = v.id), '{}'::json));
end $$;

-- save Google drive times found by a browser (anyone may add; values are bounded)
create or replace function public.trd_travel_save(p_venue text, p_pairs jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare vid uuid; x record; n int := 0;
begin
  select id into vid from venues where slug = lower(trim(p_venue));
  if vid is null or jsonb_typeof(p_pairs) <> 'object' then return json_build_object('ok', false); end if;
  for x in select key, value from jsonb_each(p_pairs) limit 30 loop
    if position('|' in x.key) > 1 and length(x.key) < 130 and jsonb_typeof(x.value) = 'number'
       and (x.value)::text::numeric between 0 and 600 then
      insert into trd_travel (venue_id, a, b, mins) values (vid, split_part(x.key, '|', 1), split_part(x.key, '|', 2), round((x.value)::text::numeric))
      on conflict (venue_id, a, b) do update set mins = excluded.mins, updated_at = now();
      n := n + 1;
    end if;
  end loop;
  return json_build_object('ok', true, 'saved', n);
end $$;

-- ------------------------------------------------------------
--  booking (customer online, or staff phone booking)
--  p: {type_id, date, start, tech_id, street, suburb, lat, lng, name, phone, email, notes,
--      win_from, win_to, emergency, every, visits:[{date,start,tech_id}], staff}
-- ------------------------------------------------------------
create or replace function public.trd_book(p_venue text, p jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v venues; s trd_settings; cfg jsonb; jt jsonb; tz text; staff boolean := false;
        d date; st int; tech text; mins int; emerg boolean; err text; sid uuid; every int;
        first trd_jobs; rec trd_jobs; made jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
        vis jsonb; n int; e jsonb; now_d date; now_m int; notice int; after boolean; t jsonb;
begin
  select * into v from venues where slug = lower(trim(p_venue)) and coalesce(active, true);
  if not found then return json_build_object('ok', false, 'error', 'Unknown business.'); end if;
  select * into s from trd_settings where venue_id = v.id;
  if not found then return json_build_object('ok', false, 'error', 'Unknown business.'); end if;
  cfg := s.config; tz := coalesce(v.timezone, 'Australia/Sydney');
  staff := coalesce((p->>'staff')::boolean, false) and trd_is_staff(v.id);
  if coalesce(trim(p->>'name'), '') = '' then return json_build_object('ok', false, 'error', 'Please enter your name.'); end if;
  if coalesce(trim(p->>'phone'), '') = '' and not staff then return json_build_object('ok', false, 'error', 'Please enter your mobile number.'); end if;
  if coalesce(trim(p->>'suburb'), '') = '' then return json_build_object('ok', false, 'error', 'Please enter the suburb.'); end if;
  select x into jt from jsonb_array_elements(cfg->'jobTypes') x where x->>'id' = p->>'type_id' limit 1;
  if jt is null or (not staff and coalesce((jt->>'active')::boolean, true) = false) then
    return json_build_object('ok', false, 'error', 'That job is no longer offered online.'); end if;
  if jt->>'price' = 'quote' and not staff then return json_build_object('ok', false, 'error', 'That job needs a quote first.'); end if;

  d := (p->>'date')::date; st := (p->>'start')::int; tech := p->>'tech_id';
  mins := greatest(coalesce((jt->>'minsMax')::int, (jt->>'mins')::int, 60), 5);
  emerg := coalesce((p->>'emergency')::boolean, false) and coalesce((jt->>'emergency')::boolean, false)
           and coalesce((cfg->'biz'->'emergency'->>'on')::boolean, false);
  select x into t from jsonb_array_elements(cfg->'team') x where x->>'id' = tech limit 1;
  if t is null or not (t->'skills') @> to_jsonb(jt->>'cat') then return json_build_object('ok', false, 'error', 'That tradie doesn''t do this job.'); end if;

  now_d := (now() at time zone tz)::date;
  now_m := extract(hour from now() at time zone tz)::int * 60 + extract(minute from now() at time zone tz)::int;
  notice := case when emerg then coalesce((cfg->'biz'->'emergency'->>'notice')::int, 60) else coalesce((cfg->'biz'->>'noticeHours')::int, 2) * 60 end;
  if not staff and (d < now_d or (d = now_d and st < now_m + notice - 10) or d > now_d + 120) then
    return json_build_object('ok', false, 'code', 'taken', 'error', 'That time can no longer be booked online.'); end if;

  perform pg_advisory_xact_lock(hashtext('trd:' || v.id::text));

  err := trd_fit_error(v.id, cfg, tech, d, st, mins, p->>'suburb', (p->>'lat')::float8, (p->>'lng')::float8, emerg, null);
  if err is not null then return json_build_object('ok', false, 'code', 'taken', 'error', 'Sorry — that time has just gone. ' || err); end if;
  after := emerg and not ((t->'days') @> to_jsonb(extract(dow from d)::int) and st >= trd_hm(t->>'start') and st + mins <= trd_hm(t->>'end'));

  every := case when coalesce((jt->>'repeat')::boolean, false) and not emerg then coalesce((p->>'every')::int, 0) else 0 end;
  if every not in (0, 7, 14, 28) then every := 0; end if;
  vis := case when every > 0 then coalesce(p->'visits', '[]'::jsonb) else '[]'::jsonb end;
  n := least(jsonb_array_length(vis), 26);
  if every > 0 and n > 1 then sid := gen_random_uuid(); end if;

  insert into trd_jobs (venue_id, ref, job_date, start_min, mins, tech_id, type_id, cat, title, customer_name, customer_phone, customer_email,
                        street, suburb, lat, lng, notes, win_from, win_to, emergency, after_hours, series_id, series_idx, series_n, repeat_every, source)
  values (v.id, trd_ref('TD', d), d, st, mins, tech, jt->>'id', jt->>'cat', jt->>'name', left(trim(p->>'name'), 120),
          nullif(left(trim(p->>'phone'), 40), ''), nullif(lower(left(trim(p->>'email'), 160)), ''),
          left(trim(p->>'street'), 200), left(trim(p->>'suburb'), 80), (p->>'lat')::float8, (p->>'lng')::float8,
          nullif(left(trim(p->>'notes'), 1500), ''), (p->>'win_from')::int, (p->>'win_to')::int, emerg, after,
          sid, case when sid is not null then 1 end, case when sid is not null then n end, nullif(every, 0),
          case when staff then 'staff' else 'online' end)
  returning * into first;
  made := made || jsonb_build_object('ref', first.ref, 'date', first.job_date, 'start', first.start_min, 'techId', first.tech_id);

  if sid is not null then
    for i in 1..n - 1 loop
      e := vis->i;
      d := (e->>'date')::date;
      if d is null or d <= first.job_date or d > first.job_date + 400 or (e->>'start') is null
         or not exists (select 1 from jsonb_array_elements(cfg->'team') x where x->>'id' = e->>'tech_id' and (x->'skills') @> to_jsonb(jt->>'cat'))
         or trd_fit_error(v.id, cfg, e->>'tech_id', d, (e->>'start')::int, mins, first.suburb, first.lat, first.lng, false, null) is not null then
        skipped := skipped || to_jsonb(coalesce(d::text, '?'));
        continue;
      end if;
      insert into trd_jobs (venue_id, ref, job_date, start_min, mins, tech_id, type_id, cat, title, customer_name, customer_phone, customer_email,
                            street, suburb, lat, lng, notes, series_id, series_idx, series_n, repeat_every, source)
      values (v.id, trd_ref('TD', d), d, (e->>'start')::int, mins, e->>'tech_id', first.type_id, first.cat, first.title, first.customer_name,
              first.customer_phone, first.customer_email, first.street, first.suburb, first.lat, first.lng, first.notes,
              sid, i + 1, n, every, first.source)
      returning * into rec;
      made := made || jsonb_build_object('ref', rec.ref, 'date', rec.job_date, 'start', rec.start_min, 'techId', rec.tech_id);
    end loop;
  end if;

  if not staff or first.customer_email is not null then perform trd_notify('booked', first.id); end if;
  return json_build_object('ok', true, 'id', first.id, 'ref', first.ref, 'made', made, 'skipped', skipped,
                           'emergency', emerg, 'after_hours', after, 'cancel_token', first.cancel_token);
end $$;

-- customer cancels from the link in their email
create or replace function public.trd_lookup(p_ref text, p_token uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((select json_build_object('ok', true, 'ref', j.ref, 'title', j.title, 'date', j.job_date, 'start', j.start_min,
            'win_from', j.win_from, 'win_to', j.win_to, 'status', j.status, 'street', j.street, 'suburb', j.suburb,
            'venue', v.name, 'phone', v.phone, 'slug', v.slug,
            'can_cancel', j.status = 'booked' and (j.job_date + make_interval(mins => j.start_min)) > (now() at time zone coalesce(v.timezone, 'Australia/Sydney')) + interval '24 hours')
          from trd_jobs j join venues v on v.id = j.venue_id where j.ref = p_ref and j.cancel_token = p_token),
         json_build_object('ok', false, 'error', 'We couldn''t find that booking.'));
$$;

create or replace function public.trd_cancel(p_ref text, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare j trd_jobs; tz text;
begin
  select * into j from trd_jobs where ref = p_ref and cancel_token = p_token;
  if not found then return json_build_object('ok', false, 'error', 'We couldn''t find that booking.'); end if;
  if j.status <> 'booked' then return json_build_object('ok', false, 'error', 'This booking is already ' || j.status || '.'); end if;
  select coalesce(timezone, 'Australia/Sydney') into tz from venues where id = j.venue_id;
  if (j.job_date + make_interval(mins => j.start_min)) <= (now() at time zone tz) + interval '24 hours' then
    return json_build_object('ok', false, 'error', 'It''s less than 24 hours away — please call us to cancel.'); end if;
  update trd_jobs set status = 'cancelled' where id = j.id;
  perform trd_notify('cancelled', j.id);
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
--  quotes
-- ------------------------------------------------------------
create or replace function public.trd_quote_request(p_venue text, p jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v venues; s trd_settings; jt jsonb; q trd_quotes; ph jsonb := '[]'::jsonb; x jsonb;
begin
  select * into v from venues where slug = lower(trim(p_venue)) and coalesce(active, true);
  select * into s from trd_settings where venue_id = v.id;
  if v.id is null or s.venue_id is null then return json_build_object('ok', false, 'error', 'Unknown business.'); end if;
  if coalesce(trim(p->>'name'), '') = '' or coalesce(trim(p->>'phone'), '') = '' then
    return json_build_object('ok', false, 'error', 'Please add your name and mobile.'); end if;
  if (select count(*) from trd_quotes where venue_id = v.id and created_at > now() - interval '1 hour') > 40 then
    return json_build_object('ok', false, 'error', 'Please try again a little later, or call us.'); end if;
  select y into jt from jsonb_array_elements(s.config->'jobTypes') y where y->>'id' = p->>'type_id' limit 1;
  for x in select * from jsonb_array_elements(coalesce(p->'photos', '[]'::jsonb)) limit 4 loop
    if jsonb_typeof(x) = 'string' and left(x #>> '{}', 11) = 'data:image/' and length(x #>> '{}') < 450000 then ph := ph || x; end if;
  end loop;
  insert into trd_quotes (venue_id, ref, type_id, cat, title, customer_name, customer_phone, customer_email, street, suburb, lat, lng,
                          description, photos, prefer, est_mins, valid_days)
  values (v.id, trd_ref('Q', current_date), jt->>'id', coalesce(jt->>'cat', p->>'cat'), coalesce(jt->>'name', left(p->>'title', 120), 'Quote request'),
          left(trim(p->>'name'), 120), left(trim(p->>'phone'), 40), nullif(lower(left(trim(p->>'email'), 160)), ''),
          left(trim(p->>'street'), 200), left(trim(p->>'suburb'), 80), (p->>'lat')::float8, (p->>'lng')::float8,
          left(trim(p->>'description'), 3000), ph, left(trim(p->>'prefer'), 200),
          coalesce((jt->>'minsMax')::int, 120), coalesce((s.config->'biz'->>'quoteValidDays')::int, 30))
  returning * into q;
  perform trd_notify('quote_request', q.id);
  return json_build_object('ok', true, 'ref', q.ref);
end $$;

create or replace function public.trd_quote_view(p_id uuid, p_token uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((select json_build_object('ok', true,
      'quote', json_build_object('id', q.id, 'ref', q.ref, 'title', q.title, 'cat', q.cat, 'typeId', q.type_id, 'status', q.status,
               'customer', json_build_object('name', q.customer_name, 'phone', q.customer_phone, 'email', q.customer_email),
               'street', q.street, 'suburb', q.suburb, 'lat', q.lat, 'lng', q.lng, 'description', q.description, 'lines', q.lines,
               'estMins', q.est_mins, 'validDays', q.valid_days, 'note', q.note, 'sentAt', extract(epoch from q.sent_at) * 1000,
               'created', extract(epoch from q.created_at) * 1000, 'bookingId', q.booking_id),
      'booking', (select json_build_object('date', j.job_date, 'start', j.start_min, 'win_from', j.win_from, 'win_to', j.win_to, 'ref', j.ref)
                  from trd_jobs j where j.id = q.booking_id),
      'slug', v.slug)
    from trd_quotes q join venues v on v.id = q.venue_id where q.id = p_id and q.token = p_token and q.status <> 'new'),
    json_build_object('ok', false, 'error', 'This quote link isn''t valid any more.'));
$$;

create or replace function public.trd_quote_decline(p_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  update trd_quotes set status = 'declined' where id = p_id and token = p_token and status in ('sent', 'accepted');
  if not found then return json_build_object('ok', false, 'error', 'This quote can''t be changed now.'); end if;
  perform trd_notify('quote_declined', p_id);
  return json_build_object('ok', true);
end $$;

-- customer accepts and picks a time. p: {date, start, tech_id, win_from, win_to}
create or replace function public.trd_quote_book(p_id uuid, p_token uuid, p jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare q trd_quotes; v venues; s trd_settings; err text; j trd_jobs; d date := (p->>'date')::date; st int := (p->>'start')::int; tz text;
begin
  select * into q from trd_quotes where id = p_id and token = p_token;
  if not found or q.status not in ('sent', 'accepted') then return json_build_object('ok', false, 'error', 'This quote can''t be booked now.'); end if;
  if q.sent_at is not null and q.sent_at + make_interval(days => coalesce(q.valid_days, 30)) < now() then
    return json_build_object('ok', false, 'error', 'This quote has expired — please contact us for an updated price.'); end if;
  select * into v from venues where id = q.venue_id; select * into s from trd_settings where venue_id = q.venue_id;
  tz := coalesce(v.timezone, 'Australia/Sydney');
  if d is null or st is null or d < (now() at time zone tz)::date then return json_build_object('ok', false, 'error', 'Please pick a time.'); end if;
  if not exists (select 1 from jsonb_array_elements(s.config->'team') x where x->>'id' = p->>'tech_id' and (x->'skills') @> to_jsonb(q.cat)) then
    return json_build_object('ok', false, 'error', 'Please pick another time.'); end if;
  perform pg_advisory_xact_lock(hashtext('trd:' || v.id::text));
  err := trd_fit_error(v.id, s.config, p->>'tech_id', d, st, coalesce(q.est_mins, 120), q.suburb, q.lat, q.lng, false, null);
  if err is not null then return json_build_object('ok', false, 'code', 'taken', 'error', 'Sorry — that time has just gone. ' || err); end if;
  insert into trd_jobs (venue_id, ref, job_date, start_min, mins, tech_id, type_id, cat, title, customer_name, customer_phone, customer_email,
                        street, suburb, lat, lng, notes, win_from, win_to, quote_id, source)
  values (v.id, trd_ref('TD', d), d, st, coalesce(q.est_mins, 120), p->>'tech_id', q.type_id, q.cat, q.title, q.customer_name, q.customer_phone,
          q.customer_email, q.street, coalesce(q.suburb, ''), q.lat, q.lng, 'Quote ' || q.ref, (p->>'win_from')::int, (p->>'win_to')::int, q.id, 'online')
  returning * into j;
  update trd_quotes set status = 'booked', booking_id = j.id where id = q.id;
  perform trd_notify('booked', j.id);
  return json_build_object('ok', true, 'ref', j.ref, 'date', j.job_date, 'start', j.start_min);
end $$;

-- ------------------------------------------------------------
--  staff
-- ------------------------------------------------------------
create or replace function public.trd_my_venues()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('venues', coalesce((
    select json_agg(json_build_object('slug', v.slug, 'name', v.name, 'role', coalesce(vs.role, 'admin')) order by v.name)
    from venues v join trd_settings s on s.venue_id = v.id
    left join venue_staff vs on vs.venue_id = v.id and vs.user_id = auth.uid()
    where vs.user_id is not null or exists (select 1 from platform_admins where user_id = auth.uid())), '[]'::json));
$$;

create or replace function public.trd_staff_load(p_venue text, p_from date default null, p_to date default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare v venues; s trd_settings; tz text; d0 date; d1 date;
begin
  select * into v from venues where slug = lower(trim(p_venue));
  if not found or not trd_is_staff(v.id) then return json_build_object('ok', false, 'error', 'No access to this business.'); end if;
  select * into s from trd_settings where venue_id = v.id;
  tz := coalesce(v.timezone, 'Australia/Sydney');
  d0 := coalesce(p_from, (now() at time zone tz)::date - 45); d1 := least(coalesce(p_to, d0 + 240), d0 + 400);
  return json_build_object('ok', true,
    'venue', json_build_object('slug', v.slug, 'name', v.name, 'phone', v.phone, 'email', v.email, 'tz', tz),
    'role', (select role from venue_staff where venue_id = v.id and user_id = auth.uid()),
    'join_key', s.join_key, 'today', to_char(now() at time zone tz, 'YYYY-MM-DD'),
    'config', s.config,
    'jobs', coalesce((select json_agg(json_build_object('id', j.id, 'ref', j.ref, 'date', j.job_date, 'start', j.start_min, 'mins', j.mins,
              'techId', j.tech_id, 'typeId', j.type_id, 'title', j.title,
              'customer', json_build_object('name', j.customer_name, 'phone', coalesce(j.customer_phone, ''), 'email', coalesce(j.customer_email, '')),
              'street', j.street, 'suburb', j.suburb, 'lat', j.lat, 'lng', j.lng, 'notes', j.notes, 'status', j.status,
              'window', case when j.win_from is not null then json_build_object('from', j.win_from, 'to', j.win_to) end,
              'emergency', j.emergency, 'afterHours', j.after_hours, 'paid', j.paid_cents / 100.0, 'seriesId', j.series_id,
              'seriesIdx', j.series_idx, 'seriesN', j.series_n, 'repeatEvery', j.repeat_every, 'quoteId', j.quote_id, 'source', j.source))
            from trd_jobs j where j.venue_id = v.id and j.job_date between d0 and d1), '[]'::json),
    'quotes', coalesce((select json_agg(json_build_object('id', q.id, 'ref', q.ref, 'typeId', q.type_id, 'cat', q.cat, 'title', q.title,
              'customer', json_build_object('name', q.customer_name, 'phone', coalesce(q.customer_phone, ''), 'email', coalesce(q.customer_email, '')),
              'street', coalesce(q.street, ''), 'suburb', coalesce(q.suburb, ''), 'lat', q.lat, 'lng', q.lng, 'description', coalesce(q.description, ''),
              'photos', q.photos, 'prefer', coalesce(q.prefer, ''), 'status', q.status, 'lines', q.lines, 'estMins', q.est_mins,
              'validDays', q.valid_days, 'note', coalesce(q.note, ''), 'sentAt', extract(epoch from q.sent_at) * 1000,
              'created', extract(epoch from q.created_at) * 1000, 'bookingId', q.booking_id, 'token', q.token) order by q.created_at desc)
            from trd_quotes q where q.venue_id = v.id and (q.status in ('new', 'sent', 'accepted') or q.created_at > now() - interval '120 days')), '[]'::json),
    'travel', coalesce((select json_object_agg(t.a || '|' || t.b, t.mins) from trd_travel t where t.venue_id = v.id), '{}'::json));
end $$;

create or replace function public.trd_save_config(p_venue text, p_config jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v venues;
begin
  select * into v from venues where slug = lower(trim(p_venue));
  if not found or not trd_is_staff(v.id) then return json_build_object('ok', false, 'error', 'No access to this business.'); end if;
  if jsonb_typeof(p_config->'team') <> 'array' or jsonb_typeof(p_config->'jobTypes') <> 'array' or jsonb_typeof(p_config->'biz') <> 'object'
     or length(p_config::text) > 400000 then
    return json_build_object('ok', false, 'error', 'Those settings don''t look right.'); end if;
  update trd_settings set config = p_config, updated_at = now() where venue_id = v.id;
  update venues set name = coalesce(nullif(left(trim(p_config->'biz'->>'name'), 120), ''), name),
                    phone = nullif(left(trim(p_config->'biz'->>'phone'), 40), ''),
                    email = nullif(lower(left(trim(p_config->'biz'->>'email'), 160)), '')
   where id = v.id;
  return json_build_object('ok', true);
end $$;

-- p_action: done | undo | cancel | move (p_tech)
create or replace function public.trd_job_update(p_venue text, p_id uuid, p_action text, p_tech text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v venues; s trd_settings; j trd_jobs; err text;
begin
  select * into v from venues where slug = lower(trim(p_venue));
  if not found or not trd_is_staff(v.id) then return json_build_object('ok', false, 'error', 'No access to this business.'); end if;
  select * into j from trd_jobs where id = p_id and venue_id = v.id;
  if not found then return json_build_object('ok', false, 'error', 'Job not found.'); end if;
  if p_action = 'done' then update trd_jobs set status = 'done' where id = j.id;
  elsif p_action = 'undo' then update trd_jobs set status = 'booked' where id = j.id;
  elsif p_action = 'cancel' then
    update trd_jobs set status = 'cancelled' where id = j.id;
    if j.status = 'booked' then perform trd_notify('cancelled', j.id); end if;
  elsif p_action = 'move' then
    select * into s from trd_settings where venue_id = v.id;
    if not exists (select 1 from jsonb_array_elements(s.config->'team') x where x->>'id' = p_tech and (x->'skills') @> to_jsonb(j.cat)) then
      return json_build_object('ok', false, 'error', 'That tradie doesn''t do this job.'); end if;
    perform pg_advisory_xact_lock(hashtext('trd:' || v.id::text));
    err := trd_fit_error(v.id, s.config, p_tech, j.job_date, j.start_min, j.mins, j.suburb, j.lat, j.lng, j.emergency, j.id);
    if err is not null then return json_build_object('ok', false, 'error', err); end if;
    update trd_jobs set tech_id = p_tech where id = j.id;
  else return json_build_object('ok', false, 'error', 'Unknown action.');
  end if;
  return json_build_object('ok', true);
end $$;

-- staff saves / sends a quote. p: {id?, type_id, title, cat, customer{name,phone,email}, street, suburb, lat, lng,
--                                  description, lines, est_mins, valid_days, note, status('new'|'sent'|'declined')}
create or replace function public.trd_quote_save(p_venue text, p jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v venues; q trd_quotes; want text := coalesce(p->>'status', 'new');
begin
  select * into v from venues where slug = lower(trim(p_venue));
  if not found or not trd_is_staff(v.id) then return json_build_object('ok', false, 'error', 'No access to this business.'); end if;
  if want not in ('new', 'sent', 'declined') then want := 'new'; end if;
  if (p->>'id') is not null then
    select * into q from trd_quotes where id = (p->>'id')::uuid and venue_id = v.id;
    if not found then return json_build_object('ok', false, 'error', 'Quote not found.'); end if;
    if q.status in ('booked') then return json_build_object('ok', false, 'error', 'This quote is already booked.'); end if;
    update trd_quotes set type_id = p->>'type_id', cat = p->>'cat', title = coalesce(nullif(p->>'title', ''), title),
      customer_name = coalesce(nullif(trim(p->'customer'->>'name'), ''), customer_name),
      customer_phone = nullif(trim(p->'customer'->>'phone'), ''), customer_email = nullif(lower(trim(p->'customer'->>'email')), ''),
      street = p->>'street', suburb = p->>'suburb', lat = (p->>'lat')::float8, lng = (p->>'lng')::float8,
      description = p->>'description', lines = coalesce(p->'lines', '[]'::jsonb), est_mins = coalesce((p->>'est_mins')::int, est_mins),
      valid_days = coalesce((p->>'valid_days')::int, valid_days), note = p->>'note',
      status = case when want = 'new' and status <> 'new' then status else want end,
      sent_at = case when want = 'sent' then now() else sent_at end
    where id = q.id returning * into q;
  else
    insert into trd_quotes (venue_id, ref, type_id, cat, title, customer_name, customer_phone, customer_email, street, suburb, lat, lng,
                            description, lines, est_mins, valid_days, note, status, sent_at)
    values (v.id, trd_ref('Q', current_date), p->>'type_id', p->>'cat', coalesce(nullif(p->>'title', ''), 'Quote'),
            coalesce(nullif(trim(p->'customer'->>'name'), ''), 'Customer'), nullif(trim(p->'customer'->>'phone'), ''),
            nullif(lower(trim(p->'customer'->>'email')), ''), p->>'street', p->>'suburb', (p->>'lat')::float8, (p->>'lng')::float8,
            p->>'description', coalesce(p->'lines', '[]'::jsonb), (p->>'est_mins')::int, (p->>'valid_days')::int, p->>'note', want,
            case when want = 'sent' then now() end)
    returning * into q;
  end if;
  if want = 'sent' then perform trd_notify('quote_sent', q.id); end if;
  return json_build_object('ok', true, 'id', q.id, 'ref', q.ref, 'token', q.token, 'status', q.status);
end $$;

-- ------------------------------------------------------------
--  sign-up and team invites (same setup code as Service Deluxe)
-- ------------------------------------------------------------
create or replace function public.trd_create_business(p_name text, p_phone text, p_email text, p_config jsonb, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); admin boolean := exists (select 1 from platform_admins where user_id = auth.uid());
        code text; base text; v_slug text; n int := 1; vid uuid;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'Please sign in first.'); end if;
  if coalesce(trim(p_name), '') = '' then return json_build_object('ok', false, 'error', 'Please enter the business name.'); end if;
  if jsonb_typeof(p_config->'team') <> 'array' or jsonb_typeof(p_config->'jobTypes') <> 'array' or length(p_config::text) > 400000 then
    return json_build_object('ok', false, 'error', 'Setup details are missing.'); end if;
  if not admin then
    select decrypted_secret into code from vault.decrypted_secrets where name = 'svc_signup_code';
    if code is null or upper(trim(coalesce(p_code, ''))) <> upper(code) then
      return json_build_object('ok', false, 'error', 'That setup code isn''t right. Ask Webescapade for your code.'); end if;
    if (select count(*) from venue_staff where user_id = uid and role = 'owner') >= 3 then
      return json_build_object('ok', false, 'error', 'This login already owns 3 businesses. Contact Webescapade to add more.'); end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('trd:create'));
  base := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'business'; end if;
  base := left(base, 40); v_slug := base;
  while exists (select 1 from venues where slug = v_slug) loop n := n + 1; v_slug := base || '-' || n; end loop;
  insert into venues (slug, name, timezone, active, phone, email)
  values (v_slug, trim(p_name), 'Australia/Sydney', true, nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''))
  returning id into vid;
  insert into trd_settings (venue_id, config) values (vid, p_config);
  insert into venue_staff (venue_id, user_id, role) values (vid, uid, 'owner') on conflict do nothing;
  return json_build_object('ok', true, 'slug', v_slug, 'name', trim(p_name));
end $$;

create or replace function public.trd_join(p_slug text, p_key uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v venues;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'Please sign in first.'); end if;
  select v2.* into v from venues v2 join trd_settings s on s.venue_id = v2.id where v2.slug = lower(trim(p_slug)) and s.join_key = p_key;
  if not found then return json_build_object('ok', false, 'error', 'This invite link is not valid any more. Ask for a new one.'); end if;
  insert into venue_staff (venue_id, user_id, role) values (v.id, auth.uid(), 'staff') on conflict do nothing;
  return json_build_object('ok', true, 'slug', v.slug, 'name', v.name);
end $$;

-- ------------------------------------------------------------
--  sales-page enquiry -> CRM (product 'trade') + email to Marc
-- ------------------------------------------------------------
create table if not exists public.trd_lead_log (
  id uuid primary key default gen_random_uuid(), email text, name text, business text, phone text, type text,
  suburb text, message text, prospect_id uuid, existing boolean default false, created_at timestamptz default now());
alter table public.trd_lead_log enable row level security;
revoke all on public.trd_lead_log from anon, authenticated;

create or replace function public.trd_lead_submit(p_name text, p_business text, p_email text, p_phone text, p_type text,
                                                  p_suburb text, p_message text, p_trap text default '')
returns json language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); note text; pid uuid; lid uuid; was boolean := false;
begin
  if coalesce(p_trap, '') <> '' then return json_build_object('ok', true); end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_business), '') = '' then
    return json_build_object('ok', false, 'error', 'Please add your name and your business name.'); end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return json_build_object('ok', false, 'error', 'Please check your email address.'); end if;
  if (select count(*) from trd_lead_log where created_at > now() - interval '1 hour') > 30
     or exists (select 1 from trd_lead_log where email = e and created_at > now() - interval '2 minutes') then
    return json_build_object('ok', false, 'error', 'Thanks — we already have your message. We''ll be in touch soon.'); end if;
  note := '🌐 ' || to_char(now() at time zone 'Australia/Sydney', 'DD Mon') || ' Trade Deluxe website enquiry'
          || coalesce(': ' || nullif(left(trim(p_message), 1000), ''), '');
  select id into pid from crm_prospects where email_normalized = e limit 1;   -- one row per email across all products
  if pid is null then
    insert into crm_prospects (name, restaurant, email, phone, suburb, venue_type, source, crm_status, crm_notes, follow_up_at, product, priority)
    values (left(trim(p_name), 200), left(trim(p_business), 200), e, coalesce(left(trim(p_phone), 60), ''),
            nullif(left(trim(p_suburb), 120), ''), nullif(left(trim(p_type), 120), ''), 'Website enquiry', 'New', note, now(), 'trade', 'A')
    returning id into pid;
  else
    was := true;
    update crm_prospects set crm_notes = coalesce(crm_notes || E'\n', '') || note, follow_up_at = now(), crm_updated_at = now() where id = pid;
  end if;
  insert into trd_lead_log (email, name, business, phone, type, suburb, message, prospect_id, existing)
  values (e, left(trim(p_name), 200), left(trim(p_business), 200), nullif(left(trim(p_phone), 60), ''), nullif(left(trim(p_type), 120), ''),
          nullif(left(trim(p_suburb), 120), ''), nullif(left(trim(p_message), 2000), ''), pid, was)
  returning id into lid;
  perform trd_notify('lead', lid);
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
--  for the trd-email Edge Function only (service role)
-- ------------------------------------------------------------
create or replace function public.trd_email_payload(p_event text, p_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if p_event in ('booked', 'cancelled') then
    select json_build_object('kind', 'job', 'ref', j.ref, 'title', j.title, 'date', j.job_date, 'start', j.start_min, 'mins', j.mins,
      'win_from', j.win_from, 'win_to', j.win_to, 'status', j.status, 'emergency', j.emergency, 'after_hours', j.after_hours,
      'name', j.customer_name, 'phone', j.customer_phone, 'email', j.customer_email, 'street', j.street, 'suburb', j.suburb, 'notes', j.notes,
      'series_n', j.series_n, 'repeat_every', j.repeat_every, 'cancel_token', j.cancel_token, 'source', j.source,
      'tech', (select x->>'name' from jsonb_array_elements(s.config->'team') x where x->>'id' = j.tech_id limit 1),
      'tech_email', (select x->>'email' from jsonb_array_elements(s.config->'team') x where x->>'id' = j.tech_id limit 1),
      'venue', v.name, 'venue_phone', v.phone, 'venue_email', v.email, 'slug', v.slug,
      'pages', s.config->'biz'->'pages')
      into r from trd_jobs j join venues v on v.id = j.venue_id join trd_settings s on s.venue_id = v.id where j.id = p_id;
  elsif p_event in ('quote_request', 'quote_sent', 'quote_declined') then
    select json_build_object('kind', 'quote', 'id', q.id, 'ref', q.ref, 'title', q.title, 'status', q.status, 'token', q.token,
      'name', q.customer_name, 'phone', q.customer_phone, 'email', q.customer_email, 'street', q.street, 'suburb', q.suburb,
      'description', q.description, 'photos', jsonb_array_length(q.photos), 'lines', q.lines, 'note', q.note, 'valid_days', q.valid_days,
      'gst', coalesce((s.config->'biz'->>'gst')::boolean, true),
      'venue', v.name, 'venue_phone', v.phone, 'venue_email', v.email, 'slug', v.slug, 'pages', s.config->'biz'->'pages')
      into r from trd_quotes q join venues v on v.id = q.venue_id join trd_settings s on s.venue_id = v.id where q.id = p_id;
  elsif p_event = 'lead' then
    select json_build_object('kind', 'lead', 'name', l.name, 'business', l.business, 'email', l.email, 'phone', l.phone,
      'type', l.type, 'suburb', l.suburb, 'message', l.message, 'existing', l.existing) into r from trd_lead_log l where l.id = p_id;
  end if;
  return r;
end $$;

-- who may call what
revoke all on function public.trd_email_payload(text, uuid) from public, anon, authenticated;
revoke all on function public.trd_notify(text, uuid) from public, anon, authenticated;
revoke all on function public.trd_fit_error(uuid, jsonb, text, date, int, int, text, float8, float8, boolean, uuid) from public, anon, authenticated;
revoke all on function public.trd_travel_min(uuid, jsonb, text, float8, float8, text, float8, float8) from public, anon, authenticated;
revoke all on function public.trd_my_venues(), public.trd_staff_load(text, date, date), public.trd_save_config(text, jsonb),
  public.trd_job_update(text, uuid, text, text), public.trd_quote_save(text, jsonb), public.trd_create_business(text, text, text, jsonb, text),
  public.trd_join(text, uuid) from public, anon;
grant execute on function public.trd_public(text, date, date), public.trd_travel_save(text, jsonb), public.trd_book(text, jsonb),
  public.trd_lookup(text, uuid), public.trd_cancel(text, uuid), public.trd_quote_request(text, jsonb), public.trd_quote_view(uuid, uuid),
  public.trd_quote_decline(uuid, uuid), public.trd_quote_book(uuid, uuid, jsonb),
  public.trd_lead_submit(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.trd_my_venues(), public.trd_staff_load(text, date, date), public.trd_save_config(text, jsonb),
  public.trd_job_update(text, uuid, text, text), public.trd_quote_save(text, jsonb), public.trd_create_business(text, text, text, jsonb, text),
  public.trd_join(text, uuid) to authenticated;

-- hardening (advisor)
alter function public.trd_ref(text, date) set search_path = public;
alter function public.trd_public_cfg(jsonb) set search_path = public;
alter function public.trd_hm(text) set search_path = public;
revoke all on function public.trd_is_staff(uuid) from public, anon;
