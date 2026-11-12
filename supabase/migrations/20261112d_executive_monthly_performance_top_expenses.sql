-- Extend client-selected sections for the new 5-largest expenses analysis.
-- Previously saved selections are preserved and may opt in by checkbox.
ALTER TABLE public.tbs_executive_report_notes
  DROP CONSTRAINT IF EXISTS tbs_executive_client_sections_limit;
ALTER TABLE public.tbs_executive_report_notes
  ADD CONSTRAINT tbs_executive_client_sections_limit
  CHECK (COALESCE(array_length(client_sections,1),0)<=14);
ALTER TABLE public.tbs_executive_report_notes
  ALTER COLUMN client_sections SET DEFAULT ARRAY[
   'summary','indicators','comparison','monthlySales','topExpenses','charts','findings',
   'opportunities','risks','shortTerm','mediumTerm'
  ]::text[];
