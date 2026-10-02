-- =====================================================================
-- RESTAURANT DELUXE - BACKEND AUDIT EXPORT (READ-ONLY)
--
-- Paste into Supabase -> SQL Editor and run. Every statement is a SELECT.
-- It changes nothing, exports no customer/order data and no secrets.
-- Run each numbered block separately, then download each result as CSV
-- (or copy the output) and upload the files to the chat.
--
-- What I use each block for is noted above it.
-- =====================================================================


-- 1. FUNCTION SOURCE  (rd_place_order, rd_settle_session, stock, stripe,
--    printing, takings, etc. - the server-side money and ordering rules)
--    NOTE: if a function body contains a literal key, it will appear here.
--    None should - secrets belong in Vault / Edge Function secrets - but
--    glance at the output before uploading and redact anything that
--    starts sk_live_, sk_test_, whsec_ or similar.
select p.proname                          as function_name,
       pg_get_function_identity_arguments(p.oid) as args,
       case p.prosecdef when true then 'SECURITY DEFINER' else 'invoker' end as security,
       p.proconfig                        as settings,      -- search_path pinning
       pg_get_functiondef(p.oid)          as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'rd\_%' escape '\' or p.proname like '%booking%')
order by p.proname;


-- 2. WHO MAY CALL EACH FUNCTION  (anon must only reach the guest RPCs)
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and (routine_name like 'rd\_%' escape '\' or routine_name like '%booking%')
order by routine_name, grantee;


-- 3. ROW LEVEL SECURITY ON / OFF PER TABLE
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;


-- 4. EVERY RLS POLICY  (venue isolation, staff vs manager, anon access)
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- 5. TABLE AND COLUMN GRANTS  (can staff PATCH price / total / paid_at?)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon','authenticated')
order by table_name, column_name;


-- 6. TABLE STRUCTURE, CONSTRAINTS AND UNIQUE KEYS
--    (idempotency uniqueness, status check constraints, cents as integers)
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name like 'rd\_%' escape '\'
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;


-- 7. TRIGGERS  (order status roll-up, stock restore, audit events)
select event_object_table as table_name, trigger_name, action_timing,
       event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;


-- 8. SCHEDULED JOBS  (daily portion reset, if any). Errors harmlessly if
--    pg_cron is not installed - that itself answers the question.
select jobid, jobname, schedule, command, active from cron.job;


-- 9. WHERE STRIPE / PRINTNODE / XERO / MYOB SECRETS LIVE
--    Lists column NAMES only (never values) that look like secret storage.
select table_name, column_name
from information_schema.columns
where table_schema in ('public','private','vault')
  and column_name ~* '(secret|webhook|api_key|token|refresh|sk_|password)'
order by table_schema, table_name, column_name;


-- 10. COUNTS ONLY - helps me pick realistic tests. No row contents.
select (select count(*) from rd_venues)   as venues,
       (select count(*) from rd_orders)   as orders,
       (select count(*) from rd_orders where idempotency_key is not null) as orders_with_idem_key;
-- (If block 10 errors on a column name, skip it - block 6 tells me the real names.)
