-- Save explicitly selected comparison periods per client's executive report
-- without changing existing market/strategy notes or financial records.
ALTER TABLE public.tbs_executive_report_notes
  ADD COLUMN IF NOT EXISTS comparison_periods jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tbs_executive_report_notes
  ADD CONSTRAINT tbs_executive_report_compare_array_check
  CHECK (jsonb_typeof(comparison_periods)='array'
         AND jsonb_array_length(comparison_periods)<=5);
