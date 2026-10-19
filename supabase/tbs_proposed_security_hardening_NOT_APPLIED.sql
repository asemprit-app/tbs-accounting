-- SECURITY HARDENING PROPOSAL — NOT APPLIED TO SUPABASE
-- Owner approval, verified database backup, and client/staff regression tests are REQUIRED.
-- Project: TBS Accounting Engine.
-- This file is a reviewed change proposal, NOT proof of security or a migration already run.
-- Run only during an approved maintenance window with rollback instructions prepared.

begin;

-- All application data require Supabase Auth; unauthenticated users have no need
-- for direct access to financial tables through PostgREST.
revoke all privileges on all tables in schema public from anon;

-- Explicitly limit who may call privileged RPC helpers. RLS helper execution
-- remains granted to authenticated because the RLS policies call them.
revoke execute on function public.delete_client_cascade(uuid) from public, anon;
revoke execute on function public.has_client_access(uuid) from public, anon;
revoke execute on function public.sync_tbs_invoice_to_client_service(
 text, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon;
revoke execute on function public.tbs_current_client_id() from public, anon;
revoke execute on function public.tbs_current_role() from public, anon;
revoke execute on function public.tbs_is_client_for(uuid) from public, anon;
revoke execute on function public.tbs_is_staff() from public, anon;
-- Also remove anonymous access from two account-maintenance RPCs.
-- Both operate as invoker and remain callable by authenticated staff.
revoke execute on function public.seed_chart_of_accounts(uuid) from public, anon;
revoke execute on function public.sync_chart_of_accounts_from_tbs() from public, anon;

grant execute on function public.has_client_access(uuid) to authenticated;
grant execute on function public.tbs_current_client_id() to authenticated;
grant execute on function public.tbs_current_role() to authenticated;
grant execute on function public.tbs_is_client_for(uuid) to authenticated;
grant execute on function public.tbs_is_staff() to authenticated;
grant execute on function public.seed_chart_of_accounts(uuid) to authenticated;
grant execute on function public.sync_chart_of_accounts_from_tbs() to authenticated;
grant execute on function public.delete_client_cascade(uuid) to authenticated;
grant execute on function public.sync_tbs_invoice_to_client_service(
 text, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

-- SERVICE_ROLE retains its existing explicit EXECUTE grants, confirmed in pg_proc.proacl.
-- Fixed search_path; the public schema has no CREATE grant for anon/authenticated.
alter function public.has_client_access(uuid) set search_path = public, pg_temp;
alter function public.seed_chart_of_accounts(uuid) set search_path = public, pg_temp;
alter function public.sync_chart_of_accounts_from_tbs() set search_path = public, pg_temp;


-- IMPORTANT AUDIT CORRECTION, 2026-10-19:
-- The nine finance tables also have RESTRICTIVE tbs_staff_only_* FOR ALL policies.
-- That restrictive policy blocks BOTH reading and writing by clients, despite the
-- permissive "isolated <table>" policy. Read-only role simulations verified this.
-- Do NOT replace the existing policies with client-readonly policies blindly:
-- it would not grant client read access and could cause access regressions.
-- For launch, preserve staff-only finance visibility unless client-facing ledger
-- access is separately designed, approved, and proven safe.
-- Do NOT run this SQL before a recoverable backup is independently verified.

commit;

-- Verification (separate read-only query after review/approval):
-- SELECT has_table_privilege('anon','public.transactions','SELECT') AS anon_tx,
--        has_function_privilege('anon','public.delete_client_cascade(uuid)','EXECUTE') AS anon_delete_rpc,
--        has_function_privilege('authenticated','public.tbs_is_staff()','EXECUTE') AS authenticated_rls_helper;
--
-- Additional required: real client-A vs client-B negative tests; account password leak
-- protection in Auth settings; GET /api/create-client-user must not leak diagnostics.
