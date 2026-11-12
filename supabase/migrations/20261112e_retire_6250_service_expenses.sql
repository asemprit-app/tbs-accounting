
-- 2026-11-12: Retire GL 6250 with a reversible, audited historical reclassification.
-- The target is 5010 for professional services, 5000 for employee wages,
-- and 5980 for employee reimbursements. Do not modify amounts or offsetting lines.
CREATE SCHEMA IF NOT EXISTS tbs_internal_ledger_audit;
REVOKE ALL ON SCHEMA tbs_internal_ledger_audit FROM PUBLIC, anon, authenticated;

CREATE TABLE tbs_internal_ledger_audit.reclass_6250_20261112_journal AS
SELECT
  j.id,
  j.client_id,
  j.date AS original_date,
  j.memo AS original_memo,
  j.lines AS original_lines,
  CASE
    WHEN s.resource_type = 'employee' AND s.source_invoice_id IS NULL THEN 'employee'
    WHEN s.id IS NOT NULL THEN 'professional'
    WHEN EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.client_id = j.client_id
        AND lower(trim(e.name)) =
          lower(trim(regexp_replace(split_part(split_part(j.memo, ' — ', 2), ' — Invoice', 1), ' \(.*$', '')))
    ) THEN 'employee'
    WHEN EXISTS (
      SELECT 1 FROM public.services s2
      WHERE s2.client_id = j.client_id
        AND lower(trim(s2.employee_name)) =
          lower(trim(regexp_replace(split_part(split_part(j.memo, ' — ', 2), ' — Invoice', 1), ' \(.*$', '')))
        AND s2.resource_type = 'service_provider'
    ) THEN 'professional'
    ELSE 'unclassified'
  END AS classification,
  now() AS captured_at
FROM public.journal_entries j
LEFT JOIN public.services s
  ON s.posted_je_id = j.id
 AND s.client_id = j.client_id
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(j.lines) l WHERE l->>'gl' = '6250'
);

CREATE TABLE tbs_internal_ledger_audit.reclass_6250_20261112_accounts AS
SELECT a.*, now() AS captured_at
FROM public.accounts a
WHERE a.code = '6250';

REVOKE ALL ON ALL TABLES IN SCHEMA tbs_internal_ledger_audit FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tbs_internal_ledger_audit.reclass_6250_20261112_journal
    WHERE classification = 'unclassified'
  ) THEN
    RAISE EXCEPTION 'Cannot retire 6250: some Journal Entries have unknown resource type.';
  END IF;

  IF (SELECT count(*) FROM tbs_internal_ledger_audit.reclass_6250_20261112_journal) <>
     (SELECT count(*) FROM public.journal_entries j WHERE EXISTS
      (SELECT 1 FROM jsonb_array_elements(j.lines) l WHERE l->>'gl'='6250')) THEN
    RAISE EXCEPTION 'Cannot retire 6250: unexpected duplicate service/journal links.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tbs_internal_ledger_audit.reclass_6250_20261112_journal b
    WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.client_id=b.client_id AND a.code='5010' AND a.type='Expense')
       OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.client_id=b.client_id AND a.code='5000' AND a.type='Expense')
       OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.client_id=b.client_id AND a.code='5980' AND a.type='Expense')
  ) THEN
    RAISE EXCEPTION 'Cannot retire 6250: a target client is missing 5010, 5000 or 5980.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.transactions WHERE gl='6250' OR source_gl='6250') OR
     EXISTS (SELECT 1 FROM public.rules WHERE gl='6250') THEN
    RAISE EXCEPTION 'Cannot retire 6250: it is also referenced by transactions or categorization rules.';
  END IF;
END $$;

UPDATE public.journal_entries j
SET lines = (
  SELECT jsonb_agg(
    CASE WHEN entry.value->>'gl' = '6250'
      THEN jsonb_set(entry.value, '{gl}',
        to_jsonb(CASE
          WHEN b.classification = 'employee' AND entry.value->>'desc' = 'Reimbursement' THEN '5980'
          WHEN b.classification = 'employee' THEN '5000'
          ELSE '5010'
        END), false)
      ELSE entry.value
    END
    ORDER BY entry.ordinality
  )
  FROM jsonb_array_elements(b.original_lines) WITH ORDINALITY AS entry(value, ordinality)
)
FROM tbs_internal_ledger_audit.reclass_6250_20261112_journal b
WHERE j.id = b.id AND j.client_id = b.client_id;

-- Use the exact name the organization requests on every client chart.
UPDATE public.accounts
SET name = 'Professional Services Expenses'
WHERE code='5010' AND client_id IS NOT NULL;

-- Accounts are removed only after all historical postings have been reclassified.
DELETE FROM public.accounts WHERE code='6250';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.journal_entries j
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(j.lines) l WHERE l->>'gl'='6250')
  ) OR EXISTS (SELECT 1 FROM public.accounts WHERE code='6250') THEN
    RAISE EXCEPTION '6250 retirement incomplete.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tbs_internal_ledger_audit.reclass_6250_20261112_journal b
    JOIN public.journal_entries j ON j.id=b.id AND j.client_id=b.client_id
    WHERE (
      SELECT jsonb_agg(x.value - 'gl' ORDER BY x.ordinality)
      FROM jsonb_array_elements(j.lines) WITH ORDINALITY x(value,ordinality)
    ) IS DISTINCT FROM (
      SELECT jsonb_agg(x.value - 'gl' ORDER BY x.ordinality)
      FROM jsonb_array_elements(b.original_lines) WITH ORDINALITY x(value,ordinality)
    )
  ) THEN
    RAISE EXCEPTION 'Journal lines other than GL changed unexpectedly.';
  END IF;
END $$;
