-- TBS integrated monthly-close controls (non-destructive).
alter table public.tbs_review_queue
  add column if not exists period_start date,
  add column if not exists due_date date,
  add column if not exists resolution_note text;
create index if not exists tbs_review_client_period_idx on public.tbs_review_queue(client_id,period_start,status);
create unique index if not exists tbs_review_auto_unique_idx on public.tbs_review_queue(client_id,period_start,source_type,source_id)
  where source_type='AUTO' and source_id is not null;
create table if not exists public.tbs_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.tbs_review_queue(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists tbs_review_events_review_idx on public.tbs_review_events(review_id,created_at);
alter table public.tbs_review_events enable row level security;
drop policy if exists tbs_review_events_staff on public.tbs_review_events;
create policy tbs_review_events_staff on public.tbs_review_events for select to authenticated using (public.tbs_is_staff());
-- Log changes atomically, including mutations made outside the React UI.
create or replace function public.tbs_log_review_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' then
    insert into public.tbs_review_events(review_id,client_id,actor_id,event_type,detail)
    values(new.id,new.client_id,auth.uid(),'CREATED',new.title);
    return new;
  end if;
  if (new.status,new.priority,new.assigned_to,new.due_date,new.period_start,new.description,new.resolution_note)
     is distinct from (old.status,old.priority,old.assigned_to,old.due_date,old.period_start,old.description,old.resolution_note) then
    insert into public.tbs_review_events(review_id,client_id,actor_id,event_type,detail)
    values(new.id,new.client_id,auth.uid(),case when new.status is distinct from old.status then new.status else 'UPDATED' end,
      concat_ws(' | ',case when new.status is distinct from old.status then 'Status: '||old.status||' -> '||new.status end,
        case when new.priority is distinct from old.priority then 'Priority: '||old.priority||' -> '||new.priority end,
        case when new.assigned_to is distinct from old.assigned_to then 'Responsible updated' end,
        case when new.due_date is distinct from old.due_date then 'Deadline updated' end,
        nullif(new.resolution_note,'')));
  end if;
  return new;
end $$;
drop trigger if exists tbs_review_change_log on public.tbs_review_queue;
create trigger tbs_review_change_log after insert or update on public.tbs_review_queue
for each row execute function public.tbs_log_review_change();

-- A critical issue must also revoke an unapproved READY_FOR_REVIEW state.
create or replace function public.tbs_review_critical_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.priority in ('HIGH','URGENT') and new.status not in ('RESOLVED','APPROVED') and new.period_start is not null then
    update public.tbs_monthly_closes set status='IN_PROGRESS'
      where client_id=new.client_id and period_start=new.period_start and status='READY_FOR_REVIEW';
  end if;
  return new;
end $$;
drop trigger if exists tbs_review_critical_guard_trigger on public.tbs_review_queue;
create trigger tbs_review_critical_guard_trigger after insert or update of priority,status,period_start on public.tbs_review_queue
for each row execute function public.tbs_review_critical_guard();

-- Protect close transitions from direct API writes as well as clicks.
create or replace function public.tbs_validate_close_transition()
returns trigger language plpgsql set search_path=public as $$
declare missing_count int; critical_count int;
begin
 if tg_op='UPDATE' and old.status='CLOSED' and new.status is distinct from old.status then
   raise exception 'A closed period cannot be reopened through the normal workflow';
 end if;
 if new.status in ('READY_FOR_REVIEW','CLOSED') and
    (tg_op='INSERT' or new.status is distinct from old.status) then
   select count(*) into missing_count from (
     select unnest(array['statements','reconciliation','cards','uncategorized','payroll','journal','balance','income','report']) key
   ) req where not exists (select 1 from public.tbs_close_tasks t
     where t.close_id=new.id and t.task_key=req.key and t.status='DONE');
   if missing_count>0 then raise exception 'All nine monthly close tasks must be DONE'; end if;
   select count(*) into critical_count from public.tbs_review_queue r
    where r.client_id=new.client_id and r.period_start=new.period_start
      and r.priority in ('HIGH','URGENT') and r.status not in ('RESOLVED','APPROVED');
   if critical_count>0 then raise exception 'Resolve HIGH and URGENT review items before completing the monthly close'; end if;
 end if;
 if new.status='CLOSED' and (tg_op='INSERT' or old.status is distinct from new.status) then
   if tg_op='INSERT' or old.status<>'READY_FOR_REVIEW' then
     raise exception 'A month must be READY_FOR_REVIEW before supervisor approval';
   end if;
   if new.assigned_to is null then raise exception 'Assign a preparer before supervisor approval'; end if;
   if auth.uid() is null or auth.uid()=new.assigned_to then
     raise exception 'Supervisor must be different from preparer';
   end if;
   new.reviewed_by:=auth.uid();new.closed_by:=auth.uid();new.closed_at:=now();
 end if;
 return new;
end $$;
drop trigger if exists tbs_validate_close_transition_trigger on public.tbs_monthly_closes;
create trigger tbs_validate_close_transition_trigger before insert or update of status on public.tbs_monthly_closes
for each row execute function public.tbs_validate_close_transition();

-- Prevent altering tasks after approved close; undo READY state when an item is reopened.
create or replace function public.tbs_guard_close_task_change()
returns trigger language plpgsql set search_path=public as $$
declare st text; cid uuid;
begin
 cid:=coalesce(new.close_id,old.close_id);
 select status into st from public.tbs_monthly_closes where id=cid;
 if st='CLOSED' then raise exception 'Approved monthly close tasks are locked'; end if;
 if tg_op='UPDATE' and old.status='DONE' and new.status<>'DONE' and st='READY_FOR_REVIEW' then
   update public.tbs_monthly_closes set status='IN_PROGRESS' where id=cid;
 end if;
 return coalesce(new,old);
end $$;
drop trigger if exists tbs_guard_close_task_change_trigger on public.tbs_close_tasks;
create trigger tbs_guard_close_task_change_trigger before insert or update or delete on public.tbs_close_tasks
for each row execute function public.tbs_guard_close_task_change();

-- Staff-only directory for existing authorized staff. No client users exposed.
create or replace function public.tbs_staff_directory()
returns table(id uuid, email text) language sql stable security definer set search_path=public as $$
  select u.id,u.email::text from auth.users u join public.profiles p on p.id=u.id
  where public.tbs_is_staff() and p.role='staff' order by u.email
$$;
revoke all on function public.tbs_staff_directory() from public;
grant execute on function public.tbs_staff_directory() to authenticated;

-- Read-only detection, with explicit scan to avoid silently writing review items.
create or replace function public.tbs_scan_close_exceptions(p_client uuid,p_period date)
returns integer language plpgsql security invoker set search_path=public as $$
declare v_end date; rec record; added int:=0;
begin
 if not public.tbs_is_staff() then raise exception 'Staff only'; end if;
 if p_client is null or p_period is null or extract(day from p_period)<>1 then raise exception 'Valid client and first day of month required'; end if;
 v_end=(p_period+interval '1 month'-interval '1 day')::date;
 for rec in
   select 'TX_UNCATEGORIZED:'||t.id as key,'Uncategorized transaction: '||left(t.description,100) as title,
     'Transaction on '||t.date::text||' needs an account classification.' as description,'HIGH'::text as priority
   from public.transactions t where t.client_id=p_client and t.date between p_period and v_end and
     (t.gl is null or btrim(t.gl)='' or t.status='REVIEW')
   union all
   select 'RECONCILIATION:'||r.id,'Reconciliation needs review: '||r.gl,
     'Statement through '||r.period_end::text||'; status '||r.status||'; difference '||r.difference::text,'HIGH'
   from public.reconciliations r where r.client_id=p_client and r.period_end between p_period and v_end
     and (r.status<>'PASS' or abs(r.difference)>0.005)
 loop
   insert into public.tbs_review_queue(client_id,period_start,source_type,source_id,title,description,priority,status,created_by)
     values(p_client,p_period,'AUTO',rec.key,rec.title,rec.description,rec.priority,'OPEN',auth.uid())
   on conflict (client_id,period_start,source_type,source_id) where source_type='AUTO' and source_id is not null do nothing;
   if found then added:=added+1; end if;
 end loop;
 return added;
end $$;
revoke all on function public.tbs_scan_close_exceptions(uuid,date) from public;
grant execute on function public.tbs_scan_close_exceptions(uuid,date) to authenticated;
