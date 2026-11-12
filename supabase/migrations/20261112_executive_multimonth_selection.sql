-- Month-by-month selections are per-client, per-period executive report preferences.
ALTER TABLE public.tbs_executive_report_notes
  ADD COLUMN IF NOT EXISTS selected_months text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE public.tbs_executive_report_notes
  DROP CONSTRAINT IF EXISTS tbs_executive_comparison_mode_check;
ALTER TABLE public.tbs_executive_report_notes
  ADD CONSTRAINT tbs_executive_comparison_mode_check
  CHECK (comparison_mode IN ('previous','month','months','custom','none'));
ALTER TABLE public.tbs_executive_report_notes
  DROP CONSTRAINT IF EXISTS tbs_executive_selected_months_limit;
ALTER TABLE public.tbs_executive_report_notes
  ADD CONSTRAINT tbs_executive_selected_months_limit
  CHECK (COALESCE(array_length(selected_months,1),0)<=12);
-- Sending takes place only after an explicit user action through a staff-authenticated
-- Vercel endpoint. No report PDFs are stored in this table.
