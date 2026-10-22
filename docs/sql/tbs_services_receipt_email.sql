-- Additive, non-destructive migration for Services receipts.
-- Existing records continue to use the linked employee email when blank.
alter table public.services add column if not exists email text;
comment on column public.services.email is 'Optional payment-receipt email specific to this Services entry';
