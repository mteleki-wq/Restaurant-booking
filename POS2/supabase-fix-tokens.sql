-- =====================================================================
--  RESTAURANT DELUXE — TOKEN GENERATION FIX
--  File: supabase-fix-tokens.sql
--  Run AFTER supabase-terms.sql
-- =====================================================================
--
--  THE PROBLEM
--  Creating a restaurant failed with:
--      function gen_random_bytes(integer) does not exist
--
--  gen_random_bytes comes from the pgcrypto extension. On Supabase that
--  lives in the "extensions" schema, but these functions declare
--  "set search_path = public" for safety, so it cannot be seen from
--  inside them. Running the same statement in the SQL editor works,
--  because the editor's search path is wider - which is exactly why the
--  problem only appeared when the console called it.
--
--  THE FIX
--  Stop depending on pgcrypto. gen_random_uuid() is built into
--  PostgreSQL itself and is a random (version 4) UUID, so its hex digits
--  are a perfectly good source for a table code. 18 hex characters is 72
--  bits; the onboarding link gets 24.
--
--  Safe to run more than once. Existing tokens are left alone, so codes
--  already printed keep working.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. One place that makes tokens, so this cannot drift again
-- ---------------------------------------------------------------------
create or replace function rd_make_token(p_len int default 18)
returns text
language sql
volatile
set search_path = public
as $$
  select substr(
           replace(gen_random_uuid()::text, '-', '') ||
           replace(gen_random_uuid()::text, '-', ''),
         1, greatest(12, least(p_len, 64)));
$$;
revoke all on function rd_make_token(int) from public;
grant execute on function rd_make_token(int) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Creating a restaurant
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
declare v_id uuid; v_slug text; i int; v_token text;
begin
  if not rd_is_platform_admin() then
    raise exception 'not_platform_admin' using errcode = 'P0001';
  end if;

  v_slug := lower(trim(coalesce(p_slug,'')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then raise exception 'bad_slug' using errcode='P0001'; end if;
  if exists (select 1 from rd_venues where slug = v_slug) then
    raise exception 'slug_taken: %', v_slug using errcode='P0001';
  end if;
  if p_table_count < 1 or p_table_count > 200 then
    raise exception 'bad_table_count' using errcode='P0001';
  end if;

  v_token := rd_make_token(24);

  insert into rd_venues (slug, name, timezone, gst_registered, order_page_url,
                         onboarding_token, ordering_enabled)
  values (v_slug, coalesce(nullif(trim(p_name),''),'Restaurant'),
          coalesce(p_timezone,'Australia/Sydney'),
          coalesce(p_gst_registered,true),
          nullif(trim(coalesce(p_order_page_url,'')),''),
          v_token,
          false)          -- stays off until the terms are accepted
  returning id into v_id;

  insert into rd_stations (venue_id, key, name, is_expo, sort) values
    (v_id,'kitchen','Kitchen',false,1),
    (v_id,'bar','Bar',false,2),
    (v_id,'dessert','Dessert',false,3),
    (v_id,'coffee','Coffee',false,4),
    (v_id,'expo','Expo',true,5);

  for i in 1..p_table_count loop
    insert into rd_tables (venue_id, label, token, sort)
    values (v_id, i::text, rd_make_token(18), i);
  end loop;

  insert into rd_staff (venue_id, user_id, role)
  values (v_id, auth.uid(), 'owner') on conflict (venue_id, user_id) do nothing;

  return jsonb_build_object(
    'ok', true, 'venue_id', v_id, 'slug', v_slug,
    'name', (select name from rd_venues where id = v_id),
    'tables', p_table_count,
    'onboarding_token', v_token,
    'ordering_enabled', false);
end;
$$;
revoke all on function rd_provision_venue(text,text,int,text,text,boolean) from public;
grant execute on function rd_provision_venue(text,text,int,text,text,boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 3. Adding a table later, and re-issuing a code
--    The manager generates these in the browser, but a helper here means
--    it can be done from SQL without reaching for pgcrypto.
-- ---------------------------------------------------------------------
create or replace function rd_add_table(p_venue_id uuid, p_label text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare v_id uuid; v_sort int;
begin
  if not rd_is_manager(p_venue_id) then
    raise exception 'not_permitted' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_label),'') = '' then
    raise exception 'label_required' using errcode = 'P0001';
  end if;
  select coalesce(max(sort),0)+1 into v_sort from rd_tables where venue_id = p_venue_id;
  insert into rd_tables (venue_id, label, token, sort)
  values (p_venue_id, trim(p_label), rd_make_token(18), v_sort)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'table_id', v_id, 'label', trim(p_label));
end;
$$;
revoke all on function rd_add_table(uuid, text) from public;
grant execute on function rd_add_table(uuid, text) to authenticated;

create or replace function rd_new_table_code(p_table_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare v_venue uuid;
begin
  select venue_id into v_venue from rd_tables where id = p_table_id;
  if v_venue is null then raise exception 'unknown_table' using errcode='P0001'; end if;
  if not rd_is_manager(v_venue) then
    raise exception 'not_permitted' using errcode = 'P0001';
  end if;
  update rd_tables set token = rd_make_token(18) where id = p_table_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function rd_new_table_code(uuid) from public;
grant execute on function rd_new_table_code(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Any venue still missing an onboarding link gets one
-- ---------------------------------------------------------------------
update rd_venues
   set onboarding_token = rd_make_token(24)
 where onboarding_token is null;


-- =====================================================================
--  Check:
--    select rd_make_token(18);            -- 18 hex characters
--    select slug, length(onboarding_token) from rd_venues;
-- =====================================================================
