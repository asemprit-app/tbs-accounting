-- Live migration applied in Supabase on 2026-10-20.
-- Custom check layouts only; no financial transactions or bank credentials.
create table if not exists public.tbs_check_print_profiles (
  client_id uuid primary key references public.clients(id) on delete cascade,
  library jsonb not null default '{"presets":[],"selectedName":""}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint tbs_check_print_profiles_object check (jsonb_typeof(library) = 'object')
);
alter table public.tbs_check_print_profiles enable row level security;
revoke all on public.tbs_check_print_profiles from anon, public;
grant select, insert, update, delete on public.tbs_check_print_profiles to authenticated;
create policy "tbs_check_templates_client_read" on public.tbs_check_print_profiles
  for select to authenticated using (public.tbs_is_staff() or client_id = public.tbs_current_client_id());
create policy "tbs_check_templates_client_insert" on public.tbs_check_print_profiles
  for insert to authenticated with check (public.tbs_is_staff() or client_id = public.tbs_current_client_id());
create policy "tbs_check_templates_client_update" on public.tbs_check_print_profiles
  for update to authenticated using (public.tbs_is_staff() or client_id = public.tbs_current_client_id())
  with check (public.tbs_is_staff() or client_id = public.tbs_current_client_id());
create policy "tbs_check_templates_client_delete" on public.tbs_check_print_profiles
  for delete to authenticated using (public.tbs_is_staff() or client_id = public.tbs_current_client_id());
