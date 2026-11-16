-- Immutable PDF copies of executive reports accepted by the email provider.
-- Historical saved analysis notes remain in tbs_executive_report_notes (one row per period).
create table if not exists public.tbs_executive_report_archives (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete restrict,
 period_from date not null,
 period_to date not null,
 recipient_email text not null,
 subject text not null default '',
 provider_message_id text,
 storage_path text not null unique,
 filename text not null,
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 bytes integer not null check (bytes >= 1500 and bytes <= 3145728),
 sent_by uuid not null references auth.users(id),
 sent_at timestamptz not null default now(),
 constraint tbs_executive_archive_period_valid check (period_from <= period_to),
 constraint tbs_executive_archive_path_valid check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$')
);
create index if not exists tbs_executive_archives_client_sent_idx
 on public.tbs_executive_report_archives (client_id,sent_at desc);
alter table public.tbs_executive_report_archives enable row level security;
revoke all on public.tbs_executive_report_archives from anon;
grant select,insert on public.tbs_executive_report_archives to authenticated;

create policy "tbs_executive_archive_supervisor_read"
 on public.tbs_executive_report_archives for select to authenticated
 using ((select public.tbs_is_supervisor()));
create policy "tbs_executive_archive_supervisor_insert"
 on public.tbs_executive_report_archives for insert to authenticated
 with check ((select public.tbs_is_supervisor()) and sent_by=auth.uid());

-- Only authenticated TBS supervisors may read or append; no update/delete policy.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tbs-executive-reports','tbs-executive-reports',false,3145728,array['application/pdf'])
on conflict (id) do nothing;

create policy "tbs_executive_pdf_supervisor_read"
 on storage.objects for select to authenticated
 using (bucket_id='tbs-executive-reports' and (select public.tbs_is_supervisor()));
create policy "tbs_executive_pdf_supervisor_insert"
 on storage.objects for insert to authenticated
 with check (
  bucket_id='tbs-executive-reports'
  and (select public.tbs_is_supervisor())
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
 );
