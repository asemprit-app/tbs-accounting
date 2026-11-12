-- Staff subroles. The existing and only TBS staff login becomes supervisor.
-- Other staff accounts are administration by default; no implicit elevation.
ALTER TABLE public.profiles
 ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'admin';

ALTER TABLE public.profiles
 DROP CONSTRAINT IF EXISTS tbs_profiles_access_level_check;
ALTER TABLE public.profiles
 ADD CONSTRAINT tbs_profiles_access_level_check
 CHECK (access_level IN ('supervisor','admin'));

UPDATE public.profiles
 SET access_level='supervisor'
 WHERE id='b6ea3040-f313-4a4d-a9d6-328e7397f7ce'
   AND role='staff';

-- Dedicated server-side privilege; never infer supervisor from email,
-- client-controlled user metadata, or Vercel deployment ownership.
CREATE OR REPLACE FUNCTION public.tbs_is_supervisor()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path=''
 AS $function$
  SELECT EXISTS (
   SELECT 1 FROM public.profiles p
   WHERE p.id=auth.uid() AND p.role='staff' AND p.access_level='supervisor'
  );
 $function$;
REVOKE ALL ON FUNCTION public.tbs_is_supervisor() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tbs_is_supervisor() TO authenticated;

-- The management user can operate client workflows, but MUST NOT promote
-- their account, other people, or create staff profiles with privileged roles.
CREATE OR REPLACE FUNCTION public.tbs_guard_staff_role_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
 AS $function$
 BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tbs_is_supervisor() THEN
   IF TG_OP='INSERT' AND NEW.role='staff' THEN
    RAISE EXCEPTION 'Only supervisor can create staff profiles';
   ELSIF TG_OP='UPDATE' AND (
      OLD.role='staff' OR NEW.role='staff'
      OR OLD.role IS DISTINCT FROM NEW.role
      OR OLD.access_level IS DISTINCT FROM NEW.access_level
    ) THEN
    RAISE EXCEPTION 'Only supervisor can modify staff roles or access levels';
   ELSIF TG_OP='DELETE' AND OLD.role='staff' THEN
    RAISE EXCEPTION 'Only supervisor can remove staff profiles';
   END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END;
 $function$;
DROP TRIGGER IF EXISTS tbs_guard_staff_roles ON public.profiles;
CREATE TRIGGER tbs_guard_staff_roles
 BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.tbs_guard_staff_role_changes();

-- Executive financial reports are supervisor-only at the database layer,
-- not merely hidden in the interface.
DROP POLICY IF EXISTS tbs_executive_report_staff_select ON public.tbs_executive_report_notes;
DROP POLICY IF EXISTS tbs_executive_report_staff_insert ON public.tbs_executive_report_notes;
DROP POLICY IF EXISTS tbs_executive_report_staff_update ON public.tbs_executive_report_notes;

CREATE POLICY tbs_executive_report_supervisor_select
 ON public.tbs_executive_report_notes FOR SELECT TO authenticated
 USING (public.tbs_is_supervisor());

CREATE POLICY tbs_executive_report_supervisor_insert
 ON public.tbs_executive_report_notes FOR INSERT TO authenticated
 WITH CHECK (public.tbs_is_supervisor() AND updated_by=auth.uid());

CREATE POLICY tbs_executive_report_supervisor_update
 ON public.tbs_executive_report_notes FOR UPDATE TO authenticated
 USING (public.tbs_is_supervisor())
 WITH CHECK (public.tbs_is_supervisor() AND updated_by=auth.uid());

-- Force self / other staff profile edits to be supervisor-only, including
-- future policy additions, even if a caller can submit REST update queries.
