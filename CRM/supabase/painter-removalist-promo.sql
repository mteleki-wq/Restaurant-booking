-- Painter and Removalist Deluxe in Webescapade's promotional CRM/Mail Studio.
-- Keeps one prospect per email; product_interests adds additional product lists.
begin;
alter table public.crm_products drop constraint if exists crm_products_key_check;
alter table public.crm_products add constraint crm_products_key_check check(key=any(array['restaurant','service','function','trade','painter','removalist']));
alter table public.crm_prospects drop constraint if exists crm_prospects_product_chk;
alter table public.crm_prospects add constraint crm_prospects_product_chk check(product=any(array['restaurant','service','function','trade','painter','removalist']));
alter table public.crm_prospects add column if not exists product_interests text[] not null default '{}';

create or replace function public.crm_add_product_interest(p_email text,p_product text)
returns void language plpgsql security definer set search_path=public as $fn$
begin
 if p_product not in ('restaurant','service','function','trade','painter','removalist') then raise exception 'Unknown product'; end if;
 update public.crm_prospects set product_interests=array(select distinct x from unnest(product_interests||array[p_product]) x order by x)
 where email_normalized=lower(trim(p_email)) and product<>p_product and not(p_product=any(product_interests));
end $fn$;
revoke all on function public.crm_add_product_interest(text,text) from public,anon,authenticated;
grant execute on function public.crm_add_product_interest(text,text) to service_role;

create or replace function public.deluxe_lead_submit(
 p_product text,p_name text,p_business text,p_email text,p_phone text default '',p_type text default '',p_suburb text default '',p_message text default '',p_trap text default '')
returns json language plpgsql security definer set search_path=public as $fn$
declare e text:=lower(trim(coalesce(p_email,''))); label text; note text; pid uuid; lid uuid; was boolean:=false;
begin
 if coalesce(p_trap,'')<>'' then return json_build_object('ok',true);end if;
 if p_product not in ('painter','removalist') or p_product is null then return json_build_object('ok',false,'error','Please choose Painter or Removalist Deluxe.');end if;
 label:=case p_product when 'painter' then 'Painter Deluxe' else 'Removalist Deluxe' end;
 if coalesce(trim(p_name),'')='' or coalesce(trim(p_business),'')='' then return json_build_object('ok',false,'error','Please add your name and your business name.');end if;
 if e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' or length(e)>320 then return json_build_object('ok',false,'error','Please check your email address.');end if;
 perform pg_advisory_xact_lock(hashtext('deluxe-lead:'||e));
 if (select count(*) from trd_lead_log where created_at>now()-interval '1 hour')>30
 or exists(select 1 from trd_lead_log where email=e and created_at>now()-interval '2 minutes') then
 return json_build_object('ok',false,'error','Thanks — we already have your message. We''ll be in touch soon.');end if;
 note:='🌐 '||to_char(now() at time zone 'Australia/Sydney','DD Mon')||' '||label||' website enquiry'||coalesce(': '||nullif(left(trim(p_message),1000),''),'');
 select id into pid from crm_prospects where email_normalized=e limit 1;
 was:=pid is not null;
 if pid is null then
 insert into crm_prospects(name,restaurant,email,phone,suburb,venue_type,source,crm_status,crm_notes,follow_up_at,product,priority)
 values(left(trim(p_name),200),left(trim(p_business),200),e,coalesce(left(trim(p_phone),60),''),nullif(left(trim(p_suburb),120),''),coalesce(nullif(left(trim(p_type),120),''),label),'Website enquiry','New',note,now(),p_product,'A')
 on conflict(email_normalized) do nothing returning id into pid;
 end if;
 if pid is null then
 was:=true;
 select id into pid from crm_prospects where email_normalized=e limit 1;
 end if;
 if was then
 update crm_prospects set crm_notes=coalesce(crm_notes||E'\n','')||note,follow_up_at=now(),crm_updated_at=now(),
 phone=case when coalesce(phone,'')='' then coalesce(left(trim(p_phone),60),'') else phone end where id=pid;
 perform crm_add_product_interest(e,p_product);
 end if;
 insert into trd_lead_log(email,name,business,phone,type,suburb,message,prospect_id,existing)
 values(e,left(trim(p_name),200),left(trim(p_business),200),nullif(left(trim(p_phone),60),''),label||coalesce(' · '||nullif(left(trim(p_type),100),''),''),nullif(left(trim(p_suburb),120),''),label||' — '||coalesce(left(trim(p_message),1900),''),pid,was) returning id into lid;
 perform trd_notify('lead',lid);
 return json_build_object('ok',true);
end $fn$;
revoke all on function public.deluxe_lead_submit(text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.deluxe_lead_submit(text,text,text,text,text,text,text,text,text) to anon,authenticated,service_role;

insert into public.crm_products(key,name,facts,rules,offer) values('painter','Painter Deluxe','PRODUCT: Painter Deluxe by Webescapade, Sydney, for painting businesses. Marc has extensive experience in business and hospitality.
LIVE NOW: editable business website, business-owned rates, indicative cost estimator, quotation requests, quotation-visit scheduling, written quotes, run sheet and basic customer records.
COLOUR STUDIO: illustrative colour previews for lounge, bedroom, kitchen and house exterior, plus an indicative painting estimator using business rates. These are idea previews, not exact manufacturer paint matching or a final site quote.
AVAILABILITY: quotation visits check work hours, existing appointments, time off and estimated travel between appointments, and are rechecked on confirmation. No guaranteed punctuality. These are quote visits, not automatically reserved whole jobs or multi-day projects.
AI CHATBOT: optional per-business website assistant, enabled by the owner, answering from published website content and additional editable public FAQs. Website and public-note changes supply current context. It does not receive private customer, booking or quote records. AI answers are a guide. Demo chat is a local FAQ simulation; live enabled accounts use the AI function. Confirm AI plan inclusion and usage allowances at setup; never claim unlimited AI.
COMING LATER: advanced client CRM follow-ups and the business''s own client Email Studio. Basic customer records are available now. Webescapade''s central promotional CRM/Mail Studio is separate. Do not present planned client tools as included live features.
NO COMMISSION: flat monthly software plans, no per-lead or per-job commission. Optional setup, domains, usage and paid integrations are separate.
NOT INCLUDED: no automatic whole-project or moving-day reservation, online payment collection, SMS, accounting integration, or guaranteed final price. No invented trial, discount, testimonials or customer results.
SETUP: business owner signs in and creates the business using an authorised setup code supplied privately by Webescapade; public links do not contain codes. Configure services, work hours, own rates and website content before sharing the customer link. Owners sign in to edit; customers use the public quote/booking page without admin access.
CONTACT: Marc, marc@webescapade.com, 0413 872 994.
ACCESS LINKS:
Sales page: https://webescapade.com/painters/
Customer website: https://webescapade.com/painters/site.html
Try colours and costs: https://webescapade.com/painters/studio.html
Customer quote request: https://webescapade.com/painters/demo/?intent=quote#book
Customer quote visit: https://webescapade.com/painters/demo/?intent=visit#book
Business demo: https://webescapade.com/painters/demo/#website
Business sign-in: https://webescapade.com/painters/app/#website
New-client setup: https://webescapade.com/painters/app/#start
Website editor: https://webescapade.com/painters/app/#website
Sales-page editor: https://webescapade.com/painters/?edit=1','Write promotional email drafts for Painter Deluxe, addressed to owners of painting businesses in Australia. Use Australian English, clear short sentences and a practical, warm tone. Use only supplied facts and OFFER. Do not invent results, clients, prices, discounts, free trials, deadlines or features. Clearly distinguish indicative estimates from a final quote, quotation visits from actual job reservations, and planned advanced CRM/Email Studio from live basic records. Never claim unlimited AI or access to private records. Prices are AUD per month plus GST as listed; show one or two relevant plans. No spammy claims or all-caps sentences. Subject under 50 characters, preheader under 90. Links and contact details are supplied by the studio; do not invent them. Return only the requested JSON.','{"currency":"AUD","gst":true,"trial_days":null,"plans":[{"name":"Bookings","price":39,"desc":"Quotation-visit bookings, estimated travel scheduling, written quotes and basic customer records. Up to 3 team members."},{"name":"Website","price":59,"main":true,"desc":"Everything in Bookings plus an editable business website and colour previews and a painting estimator. Up to 3 team members."},{"name":"Team","price":89,"desc":"Everything in Website for 4 to 10 team members."}],"setup":{"price":40,"desc":"Optional quick connect of completed content, $40 + GST. Done-for-you website content setup from $250 + GST."},"notes":"Early access. No advertised free trial. Domains, paid integrations and usage charges are separate. Confirm AI inclusion and usage allowances with Marc at setup. Advanced CRM follow-ups and client Email Studio are planned; timing and upgrade pricing to be confirmed."}'::jsonb) on conflict(key) do nothing;

insert into public.crm_products(key,name,facts,rules,offer) values('removalist','Removalist Deluxe','PRODUCT: Removalist Deluxe by Webescapade, Sydney, for removal businesses. Marc has extensive experience in business and hospitality.
LIVE NOW: editable business website, business-owned rates, indicative cost estimator, quotation requests, quotation-visit scheduling, written quotes, run sheet and basic customer records.
MOVING ESTIMATES: bedroom and other room counts, contents level, driving kilometres, stairs/lifts/carrying at pickup and destination, packing and ordinary bulky items. Manual distance entry or optional suburb route estimate. All sample rates are demonstration values, not market rates. Live client sites must have their own saved rates. The estimate and move details carry into a quotation request. A preferred moving date is only a request. The business confirms the move, crew and truck directly; the system does not reserve moving-day capacity.
AVAILABILITY: quotation visits check work hours, existing appointments, time off and estimated travel between appointments, and are rechecked on confirmation. No guaranteed punctuality. These are quote visits, not automatically reserved whole jobs or multi-day projects.
AI CHATBOT: optional per-business website assistant, enabled by the owner, answering from published website content and additional editable public FAQs. Website and public-note changes supply current context. It does not receive private customer, booking or quote records. AI answers are a guide. Demo chat is a local FAQ simulation; live enabled accounts use the AI function. Confirm AI plan inclusion and usage allowances at setup; never claim unlimited AI.
COMING LATER: advanced client CRM follow-ups and the business''s own client Email Studio. Basic customer records are available now. Webescapade''s central promotional CRM/Mail Studio is separate. Do not present planned client tools as included live features.
NO COMMISSION: flat monthly software plans, no per-lead or per-job commission. Optional setup, domains, usage and paid integrations are separate.
NOT INCLUDED: no automatic whole-project or moving-day reservation, online payment collection, SMS, accounting integration, or guaranteed final price. No invented trial, discount, testimonials or customer results.
SETUP: business owner signs in and creates the business using an authorised setup code supplied privately by Webescapade; public links do not contain codes. Configure services, work hours, own rates and website content before sharing the customer link. Owners sign in to edit; customers use the public quote/booking page without admin access.
CONTACT: Marc, marc@webescapade.com, 0413 872 994.
ACCESS LINKS:
Sales page: https://webescapade.com/removalists/
Customer website: https://webescapade.com/removalists/site.html
Try the moving estimator: https://webescapade.com/removalists/estimate.html
Customer quote request: https://webescapade.com/removalists/demo/?intent=quote#book
Customer quote visit: https://webescapade.com/removalists/demo/?intent=visit#book
Business demo: https://webescapade.com/removalists/demo/#website
Business sign-in: https://webescapade.com/removalists/app/#website
New-client setup: https://webescapade.com/removalists/app/#start
Website editor: https://webescapade.com/removalists/app/#website
Sales-page editor: https://webescapade.com/removalists/?edit=1','Write promotional email drafts for Removalist Deluxe, addressed to owners of removal businesses in Australia. Use Australian English, clear short sentences and a practical, warm tone. Use only supplied facts and OFFER. Do not invent results, clients, prices, discounts, free trials, deadlines or features. Clearly distinguish indicative estimates from a final quote, quotation visits from actual job reservations, and planned advanced CRM/Email Studio from live basic records. Never claim unlimited AI or access to private records. Prices are AUD per month plus GST as listed; show one or two relevant plans. No spammy claims or all-caps sentences. Subject under 50 characters, preheader under 90. Links and contact details are supplied by the studio; do not invent them. Return only the requested JSON.','{"currency":"AUD","gst":true,"trial_days":null,"plans":[{"name":"Bookings","price":39,"desc":"Quotation-visit bookings, estimated travel scheduling, written quotes and basic customer records. Up to 3 team members."},{"name":"Website","price":59,"main":true,"desc":"Everything in Bookings plus an editable business website and moving estimator with your own rates. Up to 3 team members."},{"name":"Team","price":89,"desc":"Everything in Website for 4 to 10 team members."}],"setup":{"price":40,"desc":"Optional quick connect of completed content, $40 + GST. Done-for-you website content setup from $250 + GST."},"notes":"Early access. No advertised free trial. Domains, paid integrations and usage charges are separate. Confirm AI inclusion and usage allowances with Marc at setup. Advanced CRM follow-ups and client Email Studio are planned; timing and upgrade pricing to be confirmed."}'::jsonb) on conflict(key) do nothing;
commit;
