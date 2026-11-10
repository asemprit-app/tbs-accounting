-- Keep automatic review work manageable: one classification alert per month,
-- one per reconciliation, and one per unbalanced legacy JE.
create or replace function public.tbs_scan_close_exceptions(p_client uuid,p_period date)
returns integer language plpgsql security invoker set search_path=public as $$
declare v_end date; rec record; added int:=0; n int;
begin
 if not public.tbs_is_staff() then raise exception 'Staff only'; end if;
 if p_client is null or p_period is null or extract(day from p_period)<>1 then raise exception 'Valid client and first day of month required'; end if;
 v_end=(p_period+interval '1 month'-interval '1 day')::date;
 select count(*) into n from public.transactions t
  where t.client_id=p_client and t.date between p_period and v_end
    and (t.gl is null or btrim(t.gl)='');
 if n>0 then
   insert into public.tbs_review_queue(client_id,period_start,source_type,source_id,title,description,priority,status,created_by)
    values(p_client,p_period,'AUTO','TX_UNCATEGORIZED',
      'Transactions without a category ('||n||')',
      n||' transaction(s) in this accounting month do not have a GL account. Review and categorize them in Transactions.',
      'HIGH','OPEN',auth.uid())
   on conflict (client_id,period_start,source_type,source_id) where source_type='AUTO' and source_id is not null
   do update set title=excluded.title,description=excluded.description,
     status=case when tbs_review_queue.status in ('RESOLVED','APPROVED') then 'OPEN' else tbs_review_queue.status end
   where tbs_review_queue.description is distinct from excluded.description
      or tbs_review_queue.status in ('RESOLVED','APPROVED');
   if found then added:=added+1; end if;
 end if;
 for rec in
  select 'RECONCILIATION:'||r.id as key,'Reconciliation needs review: '||r.gl as title,
      'Statement through '||r.period_end::text||'; status '||r.status||'; difference '||r.difference::text as description
  from public.reconciliations r where r.client_id=p_client and r.period_end between p_period and v_end
    and (r.status<>'PASS' or abs(r.difference)>0.005)
 loop
   insert into public.tbs_review_queue(client_id,period_start,source_type,source_id,title,description,priority,status,created_by)
     values(p_client,p_period,'AUTO',rec.key,rec.title,rec.description,'HIGH','OPEN',auth.uid())
   on conflict (client_id,period_start,source_type,source_id) where source_type='AUTO' and source_id is not null
   do update set description=excluded.description,
     status=case when tbs_review_queue.status in ('RESOLVED','APPROVED') then 'OPEN' else tbs_review_queue.status end
   where tbs_review_queue.description is distinct from excluded.description
      or tbs_review_queue.status in ('RESOLVED','APPROVED');
   if found then added:=added+1; end if;
 end loop;
 for rec in
   select j.id, j.date,
      coalesce((
       select sum(
         (case when coalesce(l->>'debit','') ~ '^[0-9]+([.][0-9]+)?$' then (l->>'debit')::numeric else 0 end)
        -(case when coalesce(l->>'credit','') ~ '^[0-9]+([.][0-9]+)?$' then (l->>'credit')::numeric else 0 end)
       ) from jsonb_array_elements(case when jsonb_typeof(j.lines)='array' then j.lines else '[]'::jsonb end) l
      ),0) as difference
   from public.journal_entries j where j.client_id=p_client and j.date between p_period and v_end
 loop
   if abs(rec.difference)>0.005 then
     insert into public.tbs_review_queue(client_id,period_start,source_type,source_id,title,description,priority,status,created_by)
     values(p_client,p_period,'AUTO','JE_UNBALANCED:'||rec.id,
       'Unbalanced Journal Entry: '||rec.date::text,
       'Existing Journal Entry '||rec.id||' has a Debit/Credit difference of '||rec.difference::text||'.',
       'HIGH','OPEN',auth.uid())
     on conflict (client_id,period_start,source_type,source_id) where source_type='AUTO' and source_id is not null
     do update set description=excluded.description,
       status=case when tbs_review_queue.status in ('RESOLVED','APPROVED') then 'OPEN' else tbs_review_queue.status end
     where tbs_review_queue.description is distinct from excluded.description
        or tbs_review_queue.status in ('RESOLVED','APPROVED');
     if found then added:=added+1; end if;
   end if;
 end loop;
 return added;
end $$;