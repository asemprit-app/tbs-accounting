-- TBS SECURITY CHECK (READ ONLY)
-- Execute in Supabase SQL Editor. This checks policies/configuration,
-- but does NOT simulate authenticated client sessions.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id='tbs-request-documents';

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where (schemaname='storage' and tablename='objects' and policyname like 'tbs_request_docs_%')
   or (schemaname='public' and tablename in ('tbs_request_files','tbs_client_requests','tbs_request_messages'))
order by schemaname,tablename,policyname;

-- The following is metadata-only and avoids exposing any private file names.
select r.client_id, count(distinct r.id) as request_count, count(f.id) as file_count
from public.tbs_client_requests r
left join public.tbs_request_files f on f.request_id=r.id
group by r.client_id
order by request_count desc;

-- REQUIRED AFTER THIS QUERY: test with two separate client sessions.
-- Client A must not list, download, or read metadata for Client B's files.
-- Do NOT test with a staff session, service_role, or SQL Editor as a substitute.
