CREATE OR REPLACE FUNCTION public.trd_quote_book(p_id uuid, p_token uuid, p jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q trd_quotes; v venues; s trd_settings; err text; j trd_jobs; d date := (p->>'date')::date; st int := (p->>'start')::int; tz text;
begin
  select * into q from trd_quotes where id = p_id and token = p_token;
  if not found or q.status not in ('sent', 'accepted') then return json_build_object('ok', false, 'error', 'This quote can''t be booked now.'); end if;
  if q.sent_at is not null and q.sent_at + make_interval(days => coalesce(q.valid_days, 30)) < now() then
    return json_build_object('ok', false, 'error', 'This quote has expired — please contact us for an updated price.'); end if;
  select * into v from venues where id = q.venue_id; select * into s from trd_settings where venue_id = q.venue_id;
  if s.config->'biz'->>'preset' = 'removalist' then
    return json_build_object('ok', false, 'error', 'Please contact the removalist to confirm moving day. Online appointments reserve quotation visits only.');
  end if;
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
end $function$
