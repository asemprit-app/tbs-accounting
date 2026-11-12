-- Permit the new monthly sales section alongside the existing 12 possible sections.
-- Preserve prior per-client explicit selections; apply updated default for new reports.
ALTER TABLE public.tbs_executive_report_notes
  DROP CONSTRAINT IF EXISTS tbs_executive_client_sections_limit;
ALTER TABLE public.tbs_executive_report_notes
  ADD CONSTRAINT tbs_executive_client_sections_limit
  CHECK (COALESCE(array_length(client_sections,1),0)<=13);
ALTER TABLE public.tbs_executive_report_notes
  ALTER COLUMN client_sections SET DEFAULT ARRAY[
    'summary','indicators','comparison','monthlySales','charts','findings',
    'opportunities','risks','shortTerm','mediumTerm'
  ]::text[];
