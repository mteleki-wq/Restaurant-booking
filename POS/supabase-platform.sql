-- =====================================================================
--  RESTAURANT DELUXE — PLATFORM (MULTI-RESTAURANT)
--  File: supabase-platform.sql
--  Run AFTER supabase-gst.sql
-- =====================================================================
--
--  Turns the system from one restaurant into a product you can sell to
--  many, on a single Supabase project.
--
--  WHY ONE PROJECT WORKS
--  Every table has been venue-scoped since the first migration, and
--  access is decided by Row Level Security against rd_staff. Two
--  restaurants on the same database cannot see each other: verified by
--  running a second venue end to end - its own orders, payments and Z
--  reading - while the first venue's manager saw zero rows of it and was
--  refused by the reporting functions.
--
--  WHAT THIS ADDS
--    * a platform admin role, so you can set up and support any client
--    * one call that creates a whole restaurant: venue, stations, tables
--      with QR tokens, and you as its owner
--    * a way to add a client's own staff without touching SQL
--
--  Safe to run more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Who runs the platform
-- ---------------------------------------------------------------------
create table if not exists rd_platform_admins (
  user_id    uuid primary key,
  note       text,
  created_at timestamptz not null default now()
);
alter table rd_platform_admins enable row level security;

-- Deliberately no policy for anyone but the functions below. A staff
-- member should not be able to read, let alone write, the admin list.
revoke all on rd_platform_admins from anon, authenticated;

create or replace function rd_is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from rd_platform_admins where user_id = auth.uid());
$$;
grant execute on function rd_is_platform_admin() to authenticated;


-- ---------------------------------------------------------------------
-- 2. A platform admin counts as staff everywhere
--    So you can open a client's kitchen screen to help them without
--    asking for their password, and without a row per venue.
-- ---------------------------------------------------------------------
create or replace function rd_is_staff(p_venue_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from rd_platform_admins a where a.user_id = auth.uid())
      or exists (select 1 from rd_staff s
                  where s.venue_id = p_venue_id and s.user_id = auth.uid());
$$;

create or replace function rd_is_manager(p_venue_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from rd_platform_admins a where a.user_id = auth.uid())
      or exists (select 1 from rd_staff s
                  where s.venue_id = p_venue_id and s.user_id = auth.uid()
                    and s.role in ('manager','owner'));
$$;


-- ---------------------------------------------------------------------
-- 3. Create a whole restaurant in one call
-- ---------------------------------------------------------------------
create or replace function rd_provision_venue(
  p_name          text,
  p_slug          text,
  p_table_count   int  default 10,
  p_order_page_url text default null,
  p_timezone      text default 'Australia/Sydney',
  p_gst_registered boolean default true
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_id uuid; v_slug text; i int; v_kitchen uuid;
begin
  if not rd_is_platform_admin() then
    raise exception 'not_platform_admin' using errcode = 'P0001';
  end if;

  v_slug := lower(trim(coalesce(p_slug,'')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then
    raise exception 'bad_slug' using errcode = 'P0001';
  end if;
  if exists (select 1 from rd_venues where slug = v_slug) then
    raise exception 'slug_taken: %', v_slug using errcode = 'P0001';
  end if;
  if p_table_count < 1 or p_table_count > 200 then
    raise exception 'bad_table_count' using errcode = 'P0001';
  end if;

  insert into rd_venues (slug, name, timezone, gst_registered, order_page_url)
  values (v_slug, coalesce(nullif(trim(p_name),''),'Restaurant'),
          coalesce(p_timezone,'Australia/Sydney'),
          coalesce(p_gst_registered,true),
          nullif(trim(coalesce(p_order_page_url,'')),''))
  returning id into v_id;

  -- the five standard stations
  insert into rd_stations (venue_id, key, name, is_expo, sort) values
    (v_id,'kitchen','Kitchen',false,1),
    (v_id,'bar','Bar',false,2),
    (v_id,'dessert','Dessert',false,3),
    (v_id,'coffee','Coffee',false,4),
    (v_id,'expo','Expo',true,5);
  select id into v_kitchen from rd_stations where venue_id = v_id and key='kitchen';

  -- tables, each with its own secret
  for i in 1..p_table_count loop
    insert into rd_tables (venue_id, label, token, sort)
    values (v_id, i::text, encode(gen_random_bytes(9),'hex'), i);
  end loop;

  -- the platform admin owns it until the client takes over
  insert into rd_staff (venue_id, user_id, role)
  values (v_id, auth.uid(), 'owner')
  on conflict (venue_id, user_id) do nothing;

  return jsonb_build_object(
    'ok', true, 'venue_id', v_id, 'slug', v_slug,
    'name', (select name from rd_venues where id = v_id),
    'tables', p_table_count);
end;
$$;
revoke all on function rd_provision_venue(text,text,int,text,text,boolean) from public;
grant execute on function rd_provision_venue(text,text,int,text,text,boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Add a client's own staff, by email, without touching SQL
--    The account must already exist in Authentication -> Users.
-- ---------------------------------------------------------------------
create or replace function rd_add_staff(
  p_venue_id uuid,
  p_email    text,
  p_role     text default 'staff'
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare v_user uuid;
begin
  if not (rd_is_platform_admin() or rd_is_manager(p_venue_id)) then
    raise exception 'not_permitted' using errcode = 'P0001';
  end if;
  if p_role not in ('staff','manager','owner') then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;

  select id into v_user from auth.users
   where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'no_such_account' using errcode = 'P0001';
  end if;

  insert into rd_staff (venue_id, user_id, role)
  values (p_venue_id, v_user, p_role)
  on conflict (venue_id, user_id) do update set role = excluded.role;

  return jsonb_build_object('ok', true, 'user_id', v_user, 'role', p_role);
end;
$$;
revoke all on function rd_add_staff(uuid, text, text) from public;
grant execute on function rd_add_staff(uuid, text, text) to authenticated;

create or replace function rd_remove_staff(p_venue_id uuid, p_user_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not (rd_is_platform_admin() or rd_is_manager(p_venue_id)) then
    raise exception 'not_permitted' using errcode = 'P0001';
  end if;
  delete from rd_staff where venue_id = p_venue_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function rd_remove_staff(uuid, uuid) from public;
grant execute on function rd_remove_staff(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5. Which venues can the signed-in person work in?
--    Drives the venue picker on the staff screens.
-- ---------------------------------------------------------------------
create or replace function rd_my_venues()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if rd_is_platform_admin() then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'slug', v.slug, 'name', v.name, 'role', 'platform',
        'ordering_enabled', v.ordering_enabled,
        'order_page_url', v.order_page_url,
        'tables', (select count(*) from rd_tables t where t.venue_id = v.id),
        'items',  (select count(*) from rd_items i where i.venue_id = v.id and i.visible),
        'open_tables', (select count(*) from rd_table_sessions s
                         where s.venue_id = v.id and s.status='open')
      ) order by v.name)
      from rd_venues v), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'slug', v.slug, 'name', v.name, 'role', s.role,
      'ordering_enabled', v.ordering_enabled,
      'order_page_url', v.order_page_url
    ) order by v.name)
    from rd_staff s join rd_venues v on v.id = s.venue_id
    where s.user_id = auth.uid()), '[]'::jsonb);
end;
$$;
revoke all on function rd_my_venues() from public;
grant execute on function rd_my_venues() to authenticated;


-- ---------------------------------------------------------------------
-- 6. Everything a client needs to go live, in one call
-- ---------------------------------------------------------------------
create or replace function rd_venue_setup(p_venue_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v rd_venues%rowtype;
begin
  if not rd_is_manager(p_venue_id) then
    raise exception 'not_permitted' using errcode = 'P0001';
  end if;
  select * into v from rd_venues where id = p_venue_id;
  if not found then raise exception 'unknown_venue' using errcode='P0001'; end if;

  return jsonb_build_object(
    'venue', jsonb_build_object('id',v.id,'slug',v.slug,'name',v.name,
      'order_page_url',v.order_page_url,'ordering_enabled',v.ordering_enabled,
      'gst_registered',v.gst_registered),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('label',t.label,'token',t.token,
        'active',t.active,
        'url', case when v.order_page_url is null then null
               else v.order_page_url || '?v=' || v.slug || '&t=' || t.token end)
        order by t.sort)
      from rd_tables t where t.venue_id = v.id), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('email',u.email,'role',s.role,
        'user_id',s.user_id) order by u.email)
      from rd_staff s join auth.users u on u.id = s.user_id
      where s.venue_id = v.id), '[]'::jsonb),
    'counts', jsonb_build_object(
      'categories',(select count(*) from rd_categories where venue_id=v.id),
      'items',     (select count(*) from rd_items where venue_id=v.id),
      'tables',    (select count(*) from rd_tables where venue_id=v.id))
  );
end;
$$;
revoke all on function rd_venue_setup(uuid) from public;
grant execute on function rd_venue_setup(uuid) to authenticated;


-- =====================================================================
--  MAKE YOURSELF A PLATFORM ADMIN  (once, by hand - there is no other
--  way in, which is the point)
--
--    insert into rd_platform_admins (user_id, note)
--    select id, 'platform owner' from auth.users
--     where email = 'you@example.com'
--    on conflict (user_id) do nothing;
--
--  Check:
--    select u.email from rd_platform_admins a join auth.users u on u.id=a.user_id;
-- =====================================================================
