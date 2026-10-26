-- Mark only *approved* reconciliations for re-review if their underlying
-- bank account ledger has changed. Preserves existing statement/balances/marks.
-- The frontend confirms user-driven changes; triggers also cover indirect writes.

create or replace function public.tbs_mark_recon_pending_transaction()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p_client uuid;
begin
  p_client := case when TG_OP = 'DELETE' then OLD.client_id else NEW.client_id end;
  if TG_OP = 'UPDATE' and
    NEW.source_gl is not distinct from OLD.source_gl and
    NEW.date is not distinct from OLD.date and
    NEW.amount is not distinct from OLD.amount then
    return NEW;
  end if;

  update public.reconciliations r set status = 'REVIEW'
  where r.client_id = p_client and r.status = 'PASS' and (
    (TG_OP <> 'INSERT' and r.gl = OLD.source_gl and OLD.date <= r.period_end)
    or
    (TG_OP <> 'DELETE' and r.gl = NEW.source_gl and NEW.date <= r.period_end)
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.tbs_mark_recon_pending_transaction() from public, anon, authenticated;
drop trigger if exists tbs_tx_reconciliation_review on public.transactions;
create trigger tbs_tx_reconciliation_review
after insert or update of source_gl, date, amount or delete on public.transactions
for each row execute function public.tbs_mark_recon_pending_transaction();

create or replace function public.tbs_mark_recon_pending_journal()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p_client uuid;
begin
  p_client := case when TG_OP = 'DELETE' then OLD.client_id else NEW.client_id end;
  if TG_OP = 'UPDATE' and
     NEW.date is not distinct from OLD.date and
     NEW.lines is not distinct from OLD.lines then
     return NEW;
  end if;

  update public.reconciliations r set status = 'REVIEW'
  where r.client_id = p_client and r.status = 'PASS' and (
    (TG_OP <> 'INSERT' and OLD.date <= r.period_end and exists (
      select 1 from pg_catalog.jsonb_array_elements(coalesce(OLD.lines, '[]'::jsonb)) as item
      where item->>'gl' = r.gl and (
        coalesce(nullif(item->>'debit','')::numeric, 0) <> 0
        or coalesce(nullif(item->>'credit','')::numeric, 0) <> 0
      )
    ))
    or
    (TG_OP <> 'DELETE' and NEW.date <= r.period_end and exists (
      select 1 from pg_catalog.jsonb_array_elements(coalesce(NEW.lines, '[]'::jsonb)) as item
      where item->>'gl' = r.gl and (
        coalesce(nullif(item->>'debit','')::numeric, 0) <> 0
        or coalesce(nullif(item->>'credit','')::numeric, 0) <> 0
      )
    ))
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.tbs_mark_recon_pending_journal() from public, anon, authenticated;
drop trigger if exists tbs_je_reconciliation_review on public.journal_entries;
create trigger tbs_je_reconciliation_review
after insert or update of date, lines or delete on public.journal_entries
for each row execute function public.tbs_mark_recon_pending_journal();

create or replace function public.tbs_mark_recon_pending_account()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' and NEW.type is not distinct from OLD.type then return NEW; end if;

  update public.reconciliations r set status = 'REVIEW'
  where r.client_id = OLD.client_id and r.gl = OLD.code and r.status = 'PASS';

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.tbs_mark_recon_pending_account() from public, anon, authenticated;
drop trigger if exists tbs_account_reconciliation_review on public.accounts;
create trigger tbs_account_reconciliation_review
after update of type or delete on public.accounts
for each row execute function public.tbs_mark_recon_pending_account();

-- Each reconciliation remains client-scoped under its existing RLS policy.
