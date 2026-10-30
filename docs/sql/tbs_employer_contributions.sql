-- Add employer obligations to the existing Retentions ledger. Additive migration:
-- retain all previous payments and do not post or modify journal entries.
alter table public.retention_payments
  drop constraint if exists retention_payments_category_check;
alter table public.retention_payments
  add constraint retention_payments_category_check check (category in (
    'services_contractor','services_employee',
    'payroll_pr','payroll_federal','payroll_ss','payroll_medicare','payroll_sinot',
    'employer_ss','employer_medicare','employer_sinot',
    'employer_unemployment_pr','employer_unemployment_futa',
    'employer_unemployment_special','employer_cfse'
  ));

-- DTRH/unemployment and CFSE actual assessed amounts cannot be
-- determined reliably from payroll alone. Record each agency assessment here.
create table if not exists public.retention_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in (
    'employer_unemployment_pr','employer_unemployment_futa',
    'employer_unemployment_special','employer_cfse'
  )),
  tax_period text not null check (tax_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14,2) not null check (amount > 0),
  due_date date,
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists retention_assessments_client_period
  on public.retention_assessments(client_id,tax_period,category);
alter table public.retention_assessments enable row level security;
drop policy if exists retention_assessments_staff_read on public.retention_assessments;
drop policy if exists retention_assessments_staff_insert on public.retention_assessments;
drop policy if exists retention_assessments_staff_update on public.retention_assessments;
drop policy if exists retention_assessments_staff_delete on public.retention_assessments;
create policy retention_assessments_staff_read on public.retention_assessments
 for select to authenticated using ((select public.tbs_is_staff()));
create policy retention_assessments_staff_insert on public.retention_assessments
 for insert to authenticated
 with check ((select public.tbs_is_staff()) and created_by=(select auth.uid()));
create policy retention_assessments_staff_update on public.retention_assessments
 for update to authenticated
 using ((select public.tbs_is_staff())) with check ((select public.tbs_is_staff()));
create policy retention_assessments_staff_delete on public.retention_assessments
 for delete to authenticated using ((select public.tbs_is_staff()));
revoke all on public.retention_assessments from anon;
grant select,insert,update,delete on public.retention_assessments to authenticated;
comment on table public.retention_assessments is
  'Staff-entered PR/FUTA unemployment and CFSE obligations by reference period, no GL postings.';
