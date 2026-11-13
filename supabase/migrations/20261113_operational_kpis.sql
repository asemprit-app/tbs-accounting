-- Per-client operational metrics are independent of the accounting ledger.
-- Definitions can be deactivated but are not deleted by the UI; monthly
-- observations remain available for historic comparisons and reports.
CREATE TABLE IF NOT EXISTS public.tbs_operational_metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
 unit text NOT NULL DEFAULT 'unidades' CHECK (char_length(trim(unit)) BETWEEN 1 AND 40),
 aggregation text NOT NULL DEFAULT 'sum'
   CHECK (aggregation IN ('sum','average','last')),
 description text NOT NULL DEFAULT '' CHECK (char_length(description)<=600),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,name),
 UNIQUE(id,client_id)
);
CREATE TABLE IF NOT EXISTS public.tbs_operational_metric_values (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 metric_id uuid NOT NULL,
 period_month date NOT NULL CHECK (period_month=date_trunc('month',period_month)::date),
 value numeric(18,4) NOT NULL CHECK (abs(value)<=100000000000),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes)<=800),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(metric_id,period_month),
 CONSTRAINT tbs_operational_values_metric_scope
   FOREIGN KEY (metric_id,client_id)
   REFERENCES public.tbs_operational_metrics(id,client_id)
   ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tbs_operational_metrics_client_idx
 ON public.tbs_operational_metrics(client_id,name);
CREATE INDEX IF NOT EXISTS tbs_operational_metric_values_client_month_idx
 ON public.tbs_operational_metric_values(client_id,period_month);
ALTER TABLE public.tbs_operational_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tbs_operational_metric_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tbs_operational_metrics_staff ON public.tbs_operational_metrics;
CREATE POLICY tbs_operational_metrics_staff ON public.tbs_operational_metrics
 FOR ALL TO authenticated USING (public.tbs_is_staff())
 WITH CHECK (public.tbs_is_staff());
DROP POLICY IF EXISTS tbs_operational_metric_values_staff ON public.tbs_operational_metric_values;
CREATE POLICY tbs_operational_metric_values_staff ON public.tbs_operational_metric_values
 FOR ALL TO authenticated USING (public.tbs_is_staff())
 WITH CHECK (public.tbs_is_staff());
REVOKE ALL ON public.tbs_operational_metrics FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.tbs_operational_metric_values FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tbs_operational_metrics TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tbs_operational_metric_values TO authenticated;
