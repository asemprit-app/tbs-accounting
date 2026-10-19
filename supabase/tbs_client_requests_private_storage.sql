-- TBS Client Requests - PRIVATE STORAGE - run in Supabase SQL Editor
-- Scope: new bucket only. Does not modify existing buckets.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tbs-request-documents','tbs-request-documents',false,10485760,
 array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- Every file path is <request-uuid>/<random-uuid>.<extension>.
-- Compare folder text to UUID-as-text (never cast untrusted path to UUID).
drop policy if exists "tbs_request_docs_read" on storage.objects;
create policy "tbs_request_docs_read" on storage.objects
for select to authenticated using (
 bucket_id='tbs-request-documents'
 and exists (
  select 1 from public.tbs_client_requests r
  where r.id::text = (storage.foldername(name))[1]
    and (public.tbs_is_staff() or public.tbs_is_client_for(r.client_id))
 )
);
drop policy if exists "tbs_request_docs_insert" on storage.objects;
create policy "tbs_request_docs_insert" on storage.objects
for insert to authenticated with check (
 bucket_id='tbs-request-documents'
 and exists (
  select 1 from public.tbs_client_requests r
  where r.id::text = (storage.foldername(name))[1]
    and r.status not in ('COMPLETED','CANCELLED')
    and (public.tbs_is_staff() or public.tbs_is_client_for(r.client_id))
 )
);
-- Only staff can remove files; client cannot overwrite files.
drop policy if exists "tbs_request_docs_delete_staff" on storage.objects;
create policy "tbs_request_docs_delete_staff" on storage.objects
for delete to authenticated using (
 bucket_id='tbs-request-documents' and public.tbs_is_staff()
);
-- Metadata: clients can register their own uploads for their own open request.
drop policy if exists "tbs_files_client_insert" on public.tbs_request_files;
create policy "tbs_files_client_insert" on public.tbs_request_files
for insert to authenticated with check (
 uploaded_by=auth.uid()
 and exists (
  select 1 from public.tbs_client_requests r
  where r.id=request_id
   and r.status not in ('COMPLETED','CANCELLED')
   and public.tbs_is_client_for(r.client_id)
 )
 and storage_path like request_id::text || '/%'
);
-- Staff metadata policy already exists: tbs_files_staff.
-- Extra metadata read restriction: tbs_files_client_read already exists.
