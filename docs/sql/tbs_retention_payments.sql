-- Independent audit trail for withholding remittances.
-- Financial postings must be made/reconciled separately. This table does NOT
-- record automatic journal entries, avoiding double-expensing/payments.
create table if not exists public.retention_payments (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 category text not null check (category in (
   'services_contractor','services_employee','payroll_pr','payroll_federal',
   'payroll_ss','payroll_medicare','payroll_sinot'
 )),
 tax_period text not null check (tax_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 paid_date date not null,
 amount numeric(14,2) not null check (amount > 0),
 reference text not null default '',
 notes text not null default '',
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id)
);
create index if not exists retention_payments_client_period
 on public.retention_payments(client_id, tax_period, category);
alter table public.retention_payments enable row level security;
drop policy if exists retention_payments_staff_select on public.retention_payments;
drop policy if exists retention_payments_staff_insert on public.retention_payments;
drop policy if exists retention_payments_staff_update on public.retention_payments;
drop policy if exists retention_payments_staff_delete on public.retention_payments;
create policy retention_payments_staff_select on public.retention_payments
 for select to authenticated using ((select public.tbs_is_staff()));
create policy retention_payments_staff_insert on public.retention_payments
 for insert to authenticated with check ((select public.tbs_is_staff()) and created_by = (select auth.uid()));
create policy retention_payments_staff_update on public.retention_payments
 for update to authenticated using ((select public.tbs_is_staff()))
 with check ((select public.tbs_is_staff()));
create policy retention_payments_staff_delete on public.retention_payments
 for delete to authenticated using ((select public.tbs_is_staff()));
revoke all on public.retention_payments from anon;
grant select,insert,update,delete on public.retention_payments to authenticated;
comment on table public.retention_payments is 'Staff-only record of documented retention remittances; no automatic posting to GL.';
