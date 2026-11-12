ALTER TABLE public.tbs_executive_report_notes
 ADD COLUMN IF NOT EXISTS comparison_mode text NOT NULL DEFAULT 'previous',
 ADD COLUMN IF NOT EXISTS comparison_from date,
 ADD COLUMN IF NOT EXISTS comparison_to date;
ALTER TABLE public.tbs_executive_report_notes
 ADD CONSTRAINT tbs_executive_comparison_mode_check
 CHECK (comparison_mode IN ('previous','month','custom','none'));
ALTER TABLE public.tbs_executive_report_notes
 ADD CONSTRAINT tbs_executive_comparison_range_check
 CHECK (comparison_from IS NULL OR comparison_to IS NULL OR comparison_from <= comparison_to);
