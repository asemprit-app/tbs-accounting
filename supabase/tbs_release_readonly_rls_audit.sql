-- READ-ONLY security inventory. Run in Supabase SQL Editor.
-- This is NOT a substitute for testing with separate client sessions.
select n.nspname as schema_name,c.relname as table_name,
       c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
  and c.relname in ('profiles','clients','transactions','reconciliations','accounts','invoices',
                    'tbs_monthly_closes','tbs_close_tasks','tbs_review_queue',
                    'tbs_client_requests','tbs_request_messages','tbs_request_files')
order by c.relname;

select schemaname,tablename,policyname,cmd,roles,qual,with_check
from pg_policies where schemaname='public'
  and tablename in ('profiles','clients','transactions','reconciliations','accounts','invoices',
                    'tbs_monthly_closes','tbs_close_tasks','tbs_review_queue',
                    'tbs_client_requests','tbs_request_messages','tbs_request_files')
order by tablename,policyname;

-- Confirm Storage remains private. Never expose service-role credentials in the frontend.
select id,public,file_size_limit from storage.buckets where id='tbs-request-documents';
