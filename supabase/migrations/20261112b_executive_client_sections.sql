ALTER TABLE public.tbs_executive_report_notes
  ADD COLUMN IF NOT EXISTS client_sections text[] NOT NULL
  DEFAULT ARRAY[
    'summary','indicators','comparison','charts','findings',
    'opportunities','risks','shortTerm','mediumTerm'
  ]::text[];
ALTER TABLE public.tbs_executive_report_notes
  DROP CONSTRAINT IF EXISTS tbs_executive_client_sections_limit;
ALTER TABLE public.tbs_executive_report_notes
  ADD CONSTRAINT tbs_executive_client_sections_limit
  CHECK (COALESCE(array_length(client_sections,1),0)<=12);
-- The UI controls which parts are included. The server email endpoint
-- additionally restricts staff authentication and validates nonempty PDFs.
