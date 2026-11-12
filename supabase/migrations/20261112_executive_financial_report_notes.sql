-- Staff-only notes and market evidence for executive financial reports.
-- No automatic market claims or modification of accounting entries.
CREATE TABLE IF NOT EXISTS public.tbs_executive_report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_from date NOT NULL,
  period_to date NOT NULL,
  sector text NOT NULL DEFAULT 'general',
  selected_kpis text[] NOT NULL DEFAULT ARRAY['revenue','expenses','net_income','net_margin','cash','receivables']::text[],
  market_context text NOT NULL DEFAULT '',
  market_source text NOT NULL DEFAULT '',
  market_source_date date,
  owner_discussion text NOT NULL DEFAULT '',
  agreements text NOT NULL DEFAULT '',
  followup_date date,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tbs_executive_report_period_valid CHECK (period_from <= period_to),
  CONSTRAINT tbs_executive_report_period_unique UNIQUE (client_id,period_from,period_to)
);
CREATE INDEX IF NOT EXISTS tbs_executive_report_notes_client_period_idx
  ON public.tbs_executive_report_notes (client_id,period_to DESC);
ALTER TABLE public.tbs_executive_report_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tbs_executive_report_staff_select ON public.tbs_executive_report_notes;
DROP POLICY IF EXISTS tbs_executive_report_staff_insert ON public.tbs_executive_report_notes;
DROP POLICY IF EXISTS tbs_executive_report_staff_update ON public.tbs_executive_report_notes;
CREATE POLICY tbs_executive_report_staff_select ON public.tbs_executive_report_notes
 FOR SELECT TO authenticated USING (public.tbs_is_staff());
CREATE POLICY tbs_executive_report_staff_insert ON public.tbs_executive_report_notes
 FOR INSERT TO authenticated WITH CHECK (public.tbs_is_staff() AND updated_by=auth.uid());
CREATE POLICY tbs_executive_report_staff_update ON public.tbs_executive_report_notes
 FOR UPDATE TO authenticated USING (public.tbs_is_staff())
 WITH CHECK (public.tbs_is_staff() AND updated_by=auth.uid());
REVOKE ALL ON TABLE public.tbs_executive_report_notes FROM anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.tbs_executive_report_notes TO authenticated;
