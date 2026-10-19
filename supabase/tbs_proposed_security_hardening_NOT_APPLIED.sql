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

grant execute on function public.has_client_access(uuid) to authenticated;
grant execute on function public.tbs_current_client_id() to authenticated;
grant execute on function public.tbs_current_role() to authenticated;
grant execute on function public.tbs_is_client_for(uuid) to authenticated;
grant execute on function public.tbs_is_staff() to authenticated;
grant execute on function public.delete_client_cascade(uuid) to authenticated;
grant execute on function public.sync_tbs_invoice_to_client_service(
 text, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

-- Fixed search_path; the public schema has no CREATE grant for anon/authenticated.
alter function public.has_client_access(uuid) set search_path = public, pg_temp;
alter function public.seed_chart_of_accounts(uuid) set search_path = public, pg_temp;
alter function public.sync_chart_of_accounts_from_tbs() set search_path = public, pg_temp;


-- CRITICAL LEAST-PRIVILEGE CORRECTION:
-- Existing "isolated <table>" FOR ALL policies grant a matching client write access
-- to their own general ledger even when the portal interface hides those functions.
-- Replace them with client SELECT-only policies. Existing tbs_staff_only_* ALL
-- policies continue to allow staff to read and write as before.
-- Approval condition: business owner confirms clients must not edit the core ledger.
drop policy if exists "isolated accounts" on public.accounts;
create policy "tbs_client_readonly_accounts" on public.accounts
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated customers" on public.customers;
create policy "tbs_client_readonly_customers" on public.customers
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated dismissed_suggestions" on public.dismissed_suggestions;
create policy "tbs_client_readonly_dismissed_suggestions" on public.dismissed_suggestions
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated invoices" on public.invoices;
create policy "tbs_client_readonly_invoices" on public.invoices
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated journal_entries" on public.journal_entries;
create policy "tbs_client_readonly_journal_entries" on public.journal_entries
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated products" on public.products;
create policy "tbs_client_readonly_products" on public.products
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated reconciliations" on public.reconciliations;
create policy "tbs_client_readonly_reconciliations" on public.reconciliations
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated rules" on public.rules;
create policy "tbs_client_readonly_rules" on public.rules
  for select to authenticated using (public.tbs_is_client_for(client_id));

drop policy if exists "isolated transactions" on public.transactions;
create policy "tbs_client_readonly_transactions" on public.transactions
  for select to authenticated using (public.tbs_is_client_for(client_id));

commit;

-- Verification (separate read-only query after review/approval):
-- SELECT has_table_privilege('anon','public.transactions','SELECT') AS anon_tx,
--        has_function_privilege('anon','public.delete_client_cascade(uuid)','EXECUTE') AS anon_delete_rpc,
--        has_function_privilege('authenticated','public.tbs_is_staff()','EXECUTE') AS authenticated_rls_helper;
--
-- Additional required: real client-A vs client-B negative tests; account password leak
-- protection in Auth settings; GET /api/create-client-user must not leak diagnostics.
