-- Restrict authenticated role to operations explicitly governed by staff RLS.
-- Supabase default table privileges can include TRUNCATE, which bypasses RLS.
REVOKE ALL PRIVILEGES ON TABLE public.tbs_executive_report_notes FROM authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.tbs_executive_report_notes TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.tbs_executive_report_notes FROM anon;
