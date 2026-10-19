-- RLS POLICY INVENTORY SNAPSHOT — SOURCE SUPABASE LIVE 2026-10-19
-- Not a full database backup; only RLS policy definitions for public tables.
-- Do NOT execute without expert review, controlled transaction and verified data backup.
-- The statements below would drop/recreate named policies if executed.

drop policy if exists "isolated accounts" on public.accounts;\ncreate policy "isolated accounts" on public.accounts as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_accounts on public.accounts;\ncreate policy tbs_staff_only_accounts on public.accounts as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "staff can delete clients" on public.clients;\ncreate policy "staff can delete clients" on public.clients as PERMISSIVE for DELETE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'staff'::text)))));

drop policy if exists "staff can update clients" on public.clients;\ncreate policy "staff can update clients" on public.clients as PERMISSIVE for UPDATE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'staff'::text)))))
with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'staff'::text)))));

drop policy if exists "staff manages clients" on public.clients;\ncreate policy "staff manages clients" on public.clients as PERMISSIVE for INSERT to public
with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'staff'::text)))));

drop policy if exists "staff sees all clients" on public.clients;\ncreate policy "staff sees all clients" on public.clients as PERMISSIVE for SELECT to public
using (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'staff'::text)))) OR (id IN ( SELECT profiles.client_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

drop policy if exists tbs_clients_scope_select on public.clients;\ncreate policy tbs_clients_scope_select on public.clients as RESTRICTIVE for SELECT to authenticated
using ((tbs_is_staff() OR (id = tbs_current_client_id())));

drop policy if exists tbs_clients_select on public.clients;\ncreate policy tbs_clients_select on public.clients as PERMISSIVE for SELECT to authenticated
using ((tbs_is_staff() OR (id = tbs_current_client_id())));

drop policy if exists tbs_clients_staff_delete on public.clients;\ncreate policy tbs_clients_staff_delete on public.clients as RESTRICTIVE for DELETE to authenticated
using (tbs_is_staff());

drop policy if exists tbs_clients_staff_insert on public.clients;\ncreate policy tbs_clients_staff_insert on public.clients as RESTRICTIVE for INSERT to authenticated
with check (tbs_is_staff());

drop policy if exists tbs_clients_staff_update on public.clients;\ncreate policy tbs_clients_staff_update on public.clients as RESTRICTIVE for UPDATE to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "isolated customers" on public.customers;\ncreate policy "isolated customers" on public.customers as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_customers on public.customers;\ncreate policy tbs_staff_only_customers on public.customers as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "isolated dismissed_suggestions" on public.dismissed_suggestions;\ncreate policy "isolated dismissed_suggestions" on public.dismissed_suggestions as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_dismissed_suggestions on public.dismissed_suggestions;\ncreate policy tbs_staff_only_dismissed_suggestions on public.dismissed_suggestions as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "isolated employees" on public.employees;\ncreate policy "isolated employees" on public.employees as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_portal_allow_employees on public.employees;\ncreate policy tbs_portal_allow_employees on public.employees as PERMISSIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists tbs_portal_scope_employees on public.employees;\ncreate policy tbs_portal_scope_employees on public.employees as RESTRICTIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists "isolated invoices" on public.invoices;\ncreate policy "isolated invoices" on public.invoices as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_invoices on public.invoices;\ncreate policy tbs_staff_only_invoices on public.invoices as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "isolated journal_entries" on public.journal_entries;\ncreate policy "isolated journal_entries" on public.journal_entries as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_journal_entries on public.journal_entries;\ncreate policy tbs_staff_only_journal_entries on public.journal_entries as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists leave_accrual_rules_delete on public.leave_accrual_rules;\ncreate policy leave_accrual_rules_delete on public.leave_accrual_rules as PERMISSIVE for DELETE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_accrual_rules.client_id))))));

drop policy if exists leave_accrual_rules_insert on public.leave_accrual_rules;\ncreate policy leave_accrual_rules_insert on public.leave_accrual_rules as PERMISSIVE for INSERT to authenticated
with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_accrual_rules.client_id))))));

drop policy if exists leave_accrual_rules_select on public.leave_accrual_rules;\ncreate policy leave_accrual_rules_select on public.leave_accrual_rules as PERMISSIVE for SELECT to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_accrual_rules.client_id))))));

drop policy if exists leave_accrual_rules_update on public.leave_accrual_rules;\ncreate policy leave_accrual_rules_update on public.leave_accrual_rules as PERMISSIVE for UPDATE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_accrual_rules.client_id))))))
with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_accrual_rules.client_id))))));

drop policy if exists tbs_portal_allow_leave_accrual_rules on public.leave_accrual_rules;\ncreate policy tbs_portal_allow_leave_accrual_rules on public.leave_accrual_rules as PERMISSIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists tbs_portal_scope_leave_accrual_rules on public.leave_accrual_rules;\ncreate policy tbs_portal_scope_leave_accrual_rules on public.leave_accrual_rules as RESTRICTIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists leave_entries_delete on public.leave_entries;\ncreate policy leave_entries_delete on public.leave_entries as PERMISSIVE for DELETE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_entries.client_id))))));

drop policy if exists leave_entries_insert on public.leave_entries;\ncreate policy leave_entries_insert on public.leave_entries as PERMISSIVE for INSERT to authenticated
with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_entries.client_id))))));

drop policy if exists leave_entries_select on public.leave_entries;\ncreate policy leave_entries_select on public.leave_entries as PERMISSIVE for SELECT to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_entries.client_id))))));

drop policy if exists leave_entries_update on public.leave_entries;\ncreate policy leave_entries_update on public.leave_entries as PERMISSIVE for UPDATE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_entries.client_id))))))
with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_entries.client_id))))));

drop policy if exists tbs_portal_allow_leave_entries on public.leave_entries;\ncreate policy tbs_portal_allow_leave_entries on public.leave_entries as PERMISSIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists tbs_portal_scope_leave_entries on public.leave_entries;\ncreate policy tbs_portal_scope_leave_entries on public.leave_entries as RESTRICTIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists leave_settings_delete on public.leave_settings;\ncreate policy leave_settings_delete on public.leave_settings as PERMISSIVE for DELETE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_settings.client_id))))));

drop policy if exists leave_settings_insert on public.leave_settings;\ncreate policy leave_settings_insert on public.leave_settings as PERMISSIVE for INSERT to authenticated
with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_settings.client_id))))));

drop policy if exists leave_settings_select on public.leave_settings;\ncreate policy leave_settings_select on public.leave_settings as PERMISSIVE for SELECT to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_settings.client_id))))));

drop policy if exists leave_settings_update on public.leave_settings;\ncreate policy leave_settings_update on public.leave_settings as PERMISSIVE for UPDATE to authenticated
using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_settings.client_id))))))
with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'staff'::text) OR (p.client_id = leave_settings.client_id))))));

drop policy if exists "isolated payroll_lines" on public.payroll_lines;\ncreate policy "isolated payroll_lines" on public.payroll_lines as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_portal_allow_payroll_lines on public.payroll_lines;\ncreate policy tbs_portal_allow_payroll_lines on public.payroll_lines as PERMISSIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists tbs_portal_scope_payroll_lines on public.payroll_lines;\ncreate policy tbs_portal_scope_payroll_lines on public.payroll_lines as RESTRICTIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists "isolated payroll_runs" on public.payroll_runs;\ncreate policy "isolated payroll_runs" on public.payroll_runs as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_portal_allow_payroll_runs on public.payroll_runs;\ncreate policy tbs_portal_allow_payroll_runs on public.payroll_runs as PERMISSIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists tbs_portal_scope_payroll_runs on public.payroll_runs;\ncreate policy tbs_portal_scope_payroll_runs on public.payroll_runs as RESTRICTIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists "isolated products" on public.products;\ncreate policy "isolated products" on public.products as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_products on public.products;\ncreate policy tbs_staff_only_products on public.products as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists tbs_profiles_scope_select on public.profiles;\ncreate policy tbs_profiles_scope_select on public.profiles as RESTRICTIVE for SELECT to authenticated
using ((tbs_is_staff() OR (id = auth.uid())));

drop policy if exists tbs_profiles_select on public.profiles;\ncreate policy tbs_profiles_select on public.profiles as PERMISSIVE for SELECT to authenticated
using ((tbs_is_staff() OR (id = auth.uid())));

drop policy if exists tbs_profiles_staff_delete on public.profiles;\ncreate policy tbs_profiles_staff_delete on public.profiles as RESTRICTIVE for DELETE to authenticated
using (tbs_is_staff());

drop policy if exists tbs_profiles_staff_insert on public.profiles;\ncreate policy tbs_profiles_staff_insert on public.profiles as RESTRICTIVE for INSERT to authenticated
with check (tbs_is_staff());

drop policy if exists tbs_profiles_staff_update on public.profiles;\ncreate policy tbs_profiles_staff_update on public.profiles as RESTRICTIVE for UPDATE to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "users see own profile" on public.profiles;\ncreate policy "users see own profile" on public.profiles as PERMISSIVE for SELECT to public
using ((id = auth.uid()));

drop policy if exists "isolated reconciliations" on public.reconciliations;\ncreate policy "isolated reconciliations" on public.reconciliations as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_reconciliations on public.reconciliations;\ncreate policy tbs_staff_only_reconciliations on public.reconciliations as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "isolated rules" on public.rules;\ncreate policy "isolated rules" on public.rules as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_rules on public.rules;\ncreate policy tbs_staff_only_rules on public.rules as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "isolated services" on public.services;\ncreate policy "isolated services" on public.services as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_portal_allow_services on public.services;\ncreate policy tbs_portal_allow_services on public.services as PERMISSIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists tbs_portal_scope_services on public.services;\ncreate policy tbs_portal_scope_services on public.services as RESTRICTIVE for ALL to authenticated
using ((tbs_is_staff() OR (client_id = tbs_current_client_id())))
with check ((tbs_is_staff() OR (client_id = tbs_current_client_id())));

drop policy if exists tbs_health_staff on public.tbs_client_health_snapshots;\ncreate policy tbs_health_staff on public.tbs_client_health_snapshots as PERMISSIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists tbs_requests_client_read on public.tbs_client_requests;\ncreate policy tbs_requests_client_read on public.tbs_client_requests as PERMISSIVE for SELECT to authenticated
using (tbs_is_client_for(client_id));

drop policy if exists tbs_requests_staff on public.tbs_client_requests;\ncreate policy tbs_requests_staff on public.tbs_client_requests as PERMISSIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists tbs_tasks_staff on public.tbs_close_tasks;\ncreate policy tbs_tasks_staff on public.tbs_close_tasks as PERMISSIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists tbs_audit_staff_insert on public.tbs_control_audit;\ncreate policy tbs_audit_staff_insert on public.tbs_control_audit as PERMISSIVE for INSERT to authenticated
with check ((tbs_is_staff() AND (actor_id = auth.uid())));

drop policy if exists tbs_audit_staff_read on public.tbs_control_audit;\ncreate policy tbs_audit_staff_read on public.tbs_control_audit as PERMISSIVE for SELECT to authenticated
using (tbs_is_staff());

drop policy if exists tbs_closes_staff on public.tbs_monthly_closes;\ncreate policy tbs_closes_staff on public.tbs_monthly_closes as PERMISSIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists tbs_files_client_insert on public.tbs_request_files;\ncreate policy tbs_files_client_insert on public.tbs_request_files as PERMISSIVE for INSERT to authenticated
with check (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM tbs_client_requests r
  WHERE ((r.id = tbs_request_files.request_id) AND (r.status <> ALL (ARRAY['COMPLETED'::text, 'CANCELLED'::text])) AND tbs_is_client_for(r.client_id)))) AND (storage_path ~~ ((request_id)::text || '/%'::text))));

drop policy if exists tbs_files_client_read on public.tbs_request_files;\ncreate policy tbs_files_client_read on public.tbs_request_files as PERMISSIVE for SELECT to authenticated
using ((EXISTS ( SELECT 1
   FROM tbs_client_requests r
  WHERE ((r.id = tbs_request_files.request_id) AND tbs_is_client_for(r.client_id)))));

drop policy if exists tbs_files_staff on public.tbs_request_files;\ncreate policy tbs_files_staff on public.tbs_request_files as PERMISSIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists tbs_messages_client_insert on public.tbs_request_messages;\ncreate policy tbs_messages_client_insert on public.tbs_request_messages as PERMISSIVE for INSERT to authenticated
with check (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM tbs_client_requests r
  WHERE ((r.id = tbs_request_messages.request_id) AND tbs_is_client_for(r.client_id) AND (r.status <> ALL (ARRAY['COMPLETED'::text, 'CANCELLED'::text])))))));

drop policy if exists tbs_messages_client_read on public.tbs_request_messages;\ncreate policy tbs_messages_client_read on public.tbs_request_messages as PERMISSIVE for SELECT to authenticated
using ((EXISTS ( SELECT 1
   FROM tbs_client_requests r
  WHERE ((r.id = tbs_request_messages.request_id) AND tbs_is_client_for(r.client_id)))));

drop policy if exists tbs_messages_staff on public.tbs_request_messages;\ncreate policy tbs_messages_staff on public.tbs_request_messages as PERMISSIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists tbs_reviews_staff on public.tbs_review_queue;\ncreate policy tbs_reviews_staff on public.tbs_review_queue as PERMISSIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());

drop policy if exists "isolated transactions" on public.transactions;\ncreate policy "isolated transactions" on public.transactions as PERMISSIVE for ALL to public
using (has_client_access(client_id))
with check (has_client_access(client_id));

drop policy if exists tbs_staff_only_transactions on public.transactions;\ncreate policy tbs_staff_only_transactions on public.transactions as RESTRICTIVE for ALL to authenticated
using (tbs_is_staff())
with check (tbs_is_staff());
