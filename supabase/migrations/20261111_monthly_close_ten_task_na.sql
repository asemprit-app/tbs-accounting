-- November 2026 checklist extension: do not overwrite existing completed work.
-- Existing statuses already allow NOT_APPLICABLE. New sales/expenses task starts
-- PENDING; historical READY_FOR_REVIEW periods must return to IN_PROGRESS until
-- the additional requirement is completed or explicitly marked not applicable.
UPDATE public.tbs_monthly_closes
   SET status='IN_PROGRESS',updated_at=now()
 WHERE status='READY_FOR_REVIEW'
   AND NOT EXISTS (
      SELECT 1 FROM public.tbs_close_tasks t
       WHERE t.close_id=tbs_monthly_closes.id
         AND t.task_key='sales_expenses'
         AND t.status IN ('DONE','NOT_APPLICABLE')
   );

INSERT INTO public.tbs_close_tasks(close_id,task_key,title,status)
 SELECT id,'sales_expenses','Sales and Expenses report verified','PENDING'
 FROM public.tbs_monthly_closes
 WHERE status<>'CLOSED'
 ON CONFLICT (close_id,task_key) DO NOTHING;

UPDATE public.tbs_close_tasks t
   SET title=v.title,updated_at=now()
 FROM (VALUES
    ('statements','Bank statements received'),
    ('cards','Credit cards reconciled'),
    ('reconciliation','Bank reconciliations verified'),
    ('sales_expenses','Sales and Expenses report verified'),
    ('payroll','Payroll and services verified'),
    ('uncategorized','Uncategorized transactions reviewed'),
    ('journal','Journal entries validated'),
    ('income','Profit & Loss validated'),
    ('balance','Balance Sheet validated'),
    ('report','Client report delivered')
 ) v(task_key,title)
 JOIN public.tbs_monthly_closes m ON m.status<>'CLOSED'
 WHERE t.close_id=m.id AND t.task_key=v.task_key AND t.title IS DISTINCT FROM v.title;

-- All ten tasks require DONE or NOT_APPLICABLE. A separate reviewer and no
-- unresolved HIGH/URGENT issues remain compulsory for approval.
CREATE OR REPLACE FUNCTION public.tbs_validate_close_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE missing_count int; critical_count int;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='CLOSED' AND NEW.status IS DISTINCT FROM OLD.status THEN
   RAISE EXCEPTION 'An approved close cannot be reopened through normal workflow';
 END IF;
 IF NEW.status IN ('READY_FOR_REVIEW','CLOSED') AND
    (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
   SELECT COUNT(*) INTO missing_count FROM (
      SELECT unnest(ARRAY[
        'statements','cards','reconciliation','sales_expenses','payroll',
        'uncategorized','journal','income','balance','report'
      ]) AS task_key
   ) required
   WHERE NOT EXISTS (
     SELECT 1 FROM public.tbs_close_tasks task
      WHERE task.close_id=NEW.id AND task.task_key=required.task_key
        AND task.status IN ('DONE','NOT_APPLICABLE')
   );
   IF missing_count>0 THEN
     RAISE EXCEPTION 'Ten monthly close tasks must be DONE or NOT_APPLICABLE; % still pending',missing_count;
   END IF;
   SELECT COUNT(*) INTO critical_count FROM public.tbs_review_queue r
    WHERE r.client_id=NEW.client_id AND r.period_start=NEW.period_start
      AND r.priority IN ('HIGH','URGENT') AND r.status NOT IN ('RESOLVED','APPROVED');
   IF critical_count>0 THEN
     RAISE EXCEPTION 'Resolve HIGH or URGENT review items before completing monthly close';
   END IF;
 END IF;
 IF NEW.status='CLOSED' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
   IF TG_OP='INSERT' OR OLD.status<>'READY_FOR_REVIEW' THEN
     RAISE EXCEPTION 'Monthly close must be READY_FOR_REVIEW before supervisor approval';
   END IF;
   IF NEW.assigned_to IS NULL THEN
     RAISE EXCEPTION 'Assign a preparer before supervisor approval';
   END IF;
   IF auth.uid() IS NULL OR auth.uid()=NEW.assigned_to THEN
     RAISE EXCEPTION 'Supervisor must be different from assigned preparer';
   END IF;
   NEW.reviewed_by:=auth.uid();
   NEW.closed_by:=auth.uid();
   NEW.closed_at:=now();
 END IF;
 RETURN NEW;
END $$;

-- Dropping a completed or N/A task back to a pending state must revoke READY.
CREATE OR REPLACE FUNCTION public.tbs_guard_close_task_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current_status text; target_id uuid;
BEGIN
  target_id:=CASE WHEN TG_OP='DELETE' THEN OLD.close_id ELSE NEW.close_id END;
  SELECT status INTO current_status FROM public.tbs_monthly_closes WHERE id=target_id;
  IF current_status='CLOSED' THEN RAISE EXCEPTION 'Approved monthly close tasks are locked'; END IF;
  IF current_status='READY_FOR_REVIEW' AND (
       TG_OP='DELETE'
       OR TG_OP='INSERT'
       OR (TG_OP='UPDATE' AND OLD.status IN ('DONE','NOT_APPLICABLE') AND NEW.status NOT IN ('DONE','NOT_APPLICABLE'))
     ) THEN
    UPDATE public.tbs_monthly_closes
       SET status='IN_PROGRESS',updated_at=now()
     WHERE id=target_id AND status='READY_FOR_REVIEW';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
