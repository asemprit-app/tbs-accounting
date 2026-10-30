-- Expand payment and assessment categories for consolidated FICA/SINOT/Services
-- remittances, plus other non-withholding employer obligations.
-- Non-destructive: existing payments/assessments remain unchanged.
alter table public.retention_payments
  drop constraint if exists retention_payments_category_check;
alter table public.retention_payments
  add constraint retention_payments_category_check check(category in (
    'services_contractor','services_employee','payroll_pr','payroll_federal',
    'payroll_ss','payroll_medicare','payroll_sinot',
    'employer_ss','employer_medicare','employer_sinot',
    'employer_unemployment_pr','employer_unemployment_futa',
    'employer_unemployment_special','employer_cfse','employer_other',
    'fica_remittance','sinot_remittance','services_remittance'
  ));

alter table public.retention_assessments
  drop constraint if exists retention_assessments_category_check;
alter table public.retention_assessments
  add constraint retention_assessments_category_check check(category in (
    'employer_ss','employer_medicare','employer_sinot',
    'employer_unemployment_pr','employer_unemployment_futa',
    'employer_unemployment_special','employer_cfse','employer_other'
  ));
comment on table public.retention_payments is
 'Client-scoped remittance log; consolidated FICA, SINOT, Services and other obligations supported. Does not automatically journalize.';
comment on table public.retention_assessments is
 'Client-scoped official employer obligations; employer_other must specify its nature in reference/notes in UI.';
