-- Separate client-scoped manual payroll/retention base for preparing partial
-- remittances. Only 'additional' entries increase the withholding control.
-- A planned remittance is NOT an actual payment until recorded separately.
create table if not exists public.tbs_retention_manual_bases (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 tax_period text not null check(tax_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 mode text not null default 'reference' check(mode in ('reference','additional')),
 gross_pay numeric(14,2) not null default 0 check(gross_pay>=0),
 fica_employee numeric(14,2) not null default 0 check(fica_employee>=0),
 fica_employer numeric(14,2) not null default 0 check(fica_employer>=0),
 sinot_employee numeric(14,2) not null default 0 check(sinot_employee>=0),
 sinot_employer numeric(14,2) not null default 0 check(sinot_employer>=0),
 pr_tax numeric(14,2) not null default 0 check(pr_tax>=0),
 services_retention numeric(14,2) not null default 0 check(services_retention>=0),
 planned_fica numeric(14,2) not null default 0 check(planned_fica>=0),
 planned_sinot numeric(14,2) not null default 0 check(planned_sinot>=0),
 planned_pr numeric(14,2) not null default 0 check(planned_pr>=0),
 planned_services numeric(14,2) not null default 0 check(planned_services>=0),
 reference text not null default '',
 notes text not null default '',
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id)
);
create index if not exists idx_tbs_retention_manual_bases_client_period
 on public.tbs_retention_manual_bases(client_id,tax_period);
alter table public.tbs_retention_manual_bases enable row level security;
drop policy if exists tbs_retention_manual_bases_staff_select on public.tbs_retention_manual_bases;
drop policy if exists tbs_retention_manual_bases_staff_insert on public.tbs_retention_manual_bases;
drop policy if exists tbs_retention_manual_bases_staff_update on public.tbs_retention_manual_bases;
drop policy if exists tbs_retention_manual_bases_staff_delete on public.tbs_retention_manual_bases;
create policy tbs_retention_manual_bases_staff_select on public.tbs_retention_manual_bases
 for select to authenticated using ((select public.tbs_is_staff()));
create policy tbs_retention_manual_bases_staff_insert on public.tbs_retention_manual_bases
 for insert to authenticated with check (
 (select public.tbs_is_staff()) and created_by=(select auth.uid()));
create policy tbs_retention_manual_bases_staff_update on public.tbs_retention_manual_bases
 for update to authenticated using ((select public.tbs_is_staff()))
 with check ((select public.tbs_is_staff()));
create policy tbs_retention_manual_bases_staff_delete on public.tbs_retention_manual_bases
 for delete to authenticated using ((select public.tbs_is_staff()));
revoke all on public.tbs_retention_manual_bases from anon;
grant select,insert,update,delete on public.tbs_retention_manual_bases to authenticated;
comment on table public.tbs_retention_manual_bases is
 'Gross/payroll withholding basis and planned partial remittances by tax period. Reference mode does not increase liabilities. Additional mode adds missing obligations. No automatic GL entries or recorded remittances.';
