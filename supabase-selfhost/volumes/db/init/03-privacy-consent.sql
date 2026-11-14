-- Additive, deny-by-default server authority. Review/apply manually on existing
-- installations; Docker init does not migrate an existing database.
-- No existing payloads are deleted or treated as consent. Cloud stays unavailable.
BEGIN;
DO $$ BEGIN
 IF current_user IN ('anon','authenticated','service_role') OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Privacy authority requires a reviewed privileged migration owner';
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Client roles must not bypass RLS';
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN
  IF pg_has_role('service_role','authenticated','USAGE') THEN
   RAISE EXCEPTION 'Unexpected inherited client privileges; review service role';
  END IF;
 END IF;
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
  WHERE n.nspname='public' AND c.relname IN ('voyagr_privacy_policy','voyagr_privacy_consent','voyagr_profile_snapshots')
  AND (r.rolname IN ('anon','authenticated','service_role') OR NOT(r.rolsuper OR r.rolbypassrls))) THEN
  RAISE EXCEPTION 'Unexpected privacy table owner; review before migration';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.voyagr_privacy_policy (
 category text PRIMARY KEY CHECK (category IN ('cloudSync','history','dashcamBackup','diagnostics')),
 policy_version text NOT NULL,
 available boolean NOT NULL DEFAULT false,
 grant_ttl_seconds integer NOT NULL DEFAULT 2592000 CHECK (grant_ttl_seconds BETWEEN 60 AND 2592000)
);
INSERT INTO public.voyagr_privacy_policy(category,policy_version)
 VALUES ('cloudSync','2026-11-14.1'),('history','2026-11-14.1'),
 ('dashcamBackup','2026-11-14.1'),('diagnostics','2026-11-14.1') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.voyagr_privacy_consent (
 user_id uuid NOT NULL,
 category text NOT NULL REFERENCES public.voyagr_privacy_policy(category),
 policy_version text NOT NULL,
 granted boolean NOT NULL DEFAULT false,
 epoch bigint NOT NULL DEFAULT 0 CHECK (epoch >= 0),
 expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,category),
 CHECK (NOT granted OR expires_at IS NOT NULL)
);
ALTER TABLE public.voyagr_privacy_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voyagr_privacy_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE public.voyagr_privacy_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voyagr_privacy_consent FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.voyagr_privacy_policy,public.voyagr_privacy_consent FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.voyagr_private_session_active()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb := auth.jwt();
BEGIN
 IF auth.uid() IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'is_anonymous','false') <> 'false'
    OR coalesce(claims->>'exp','') !~ '^[0-9]+([.][0-9]+)?$' THEN RETURN false; END IF;
 RETURN (claims->>'exp')::numeric > extract(epoch FROM clock_timestamp()) AND EXISTS(
  SELECT 1 FROM auth.sessions s WHERE s.id::text=claims->>'session_id'
   AND s.user_id=auth.uid() AND (s.not_after IS NULL OR s.not_after>clock_timestamp()));
END; $$;

CREATE OR REPLACE FUNCTION public.voyagr_privacy_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.voyagr_private_session_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('schema',1,'categories',jsonb_agg(jsonb_build_object(
  'category',p.category,'policy_version',p.policy_version,'available',p.available,
  'enabled',coalesce(p.available AND c.granted AND c.policy_version=p.policy_version AND c.expires_at>clock_timestamp(),false),
  'epoch',coalesce(c.epoch,0),'expires_at',c.expires_at) ORDER BY p.category)) INTO result
 FROM public.voyagr_privacy_policy p LEFT JOIN public.voyagr_privacy_consent c ON c.user_id=auth.uid() AND c.category=p.category;
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.voyagr_set_privacy_choice(
 p_category text,p_enabled boolean,p_policy_version text DEFAULT NULL,p_expected_epoch bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.voyagr_privacy_policy; c public.voyagr_privacy_consent;
BEGIN
 IF NOT public.voyagr_private_session_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL OR p_expected_epoch IS NULL OR p_expected_epoch<0 THEN RAISE EXCEPTION 'Invalid choice' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.voyagr_privacy_policy WHERE category=p_category FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown category' USING ERRCODE='22023'; END IF;
 INSERT INTO public.voyagr_privacy_consent(user_id,category,policy_version)
 VALUES(auth.uid(),p_category,p.policy_version) ON CONFLICT DO NOTHING;
 SELECT * INTO c FROM public.voyagr_privacy_consent WHERE user_id=auth.uid() AND category=p_category FOR UPDATE;
 -- Recheck after a lock wait; no positive session/grant cache.
 IF NOT public.voyagr_private_session_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_enabled THEN
  IF NOT p.available THEN RAISE EXCEPTION 'Cloud service unavailable' USING ERRCODE='42501'; END IF;
  IF p_policy_version IS DISTINCT FROM p.policy_version THEN RAISE EXCEPTION 'Policy changed' USING ERRCODE='22023'; END IF;
  IF p_expected_epoch<>c.epoch THEN RAISE EXCEPTION 'Choice changed' USING ERRCODE='40001'; END IF;
 END IF;
 -- Withdrawal succeeds even with a stale policy/epoch. Never delete epochs.
 UPDATE public.voyagr_privacy_consent SET granted=p_enabled,policy_version=p.policy_version,
 epoch=epoch+1,expires_at=CASE WHEN p_enabled THEN clock_timestamp()+p.grant_ttl_seconds*interval '1 second' ELSE NULL END,
 updated_at=clock_timestamp() WHERE user_id=auth.uid() AND category=p_category;
 RETURN public.voyagr_privacy_state();
END; $$;

CREATE OR REPLACE FUNCTION public.voyagr_assert_privacy_permission(p_category text,p_policy_version text,p_epoch bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.voyagr_privacy_policy; c public.voyagr_privacy_consent;
BEGIN
 -- Future write RPCs call this INSIDE the payload transaction, not by HTTP preflight.
 -- Hold the live session and consent rows through commit; revoke/delete serialises.
 PERFORM 1 FROM auth.sessions s WHERE s.user_id=auth.uid() AND s.id::text=auth.jwt()->>'session_id' FOR SHARE;
 SELECT * INTO p FROM public.voyagr_privacy_policy WHERE category=p_category FOR SHARE;
 SELECT * INTO c FROM public.voyagr_privacy_consent WHERE user_id=auth.uid() AND category=p_category FOR UPDATE;
 IF NOT public.voyagr_private_session_active() OR NOT coalesce(p.available,false)
  OR p.policy_version IS DISTINCT FROM p_policy_version OR c.policy_version IS DISTINCT FROM p.policy_version
  OR NOT coalesce(c.granted,false) OR c.epoch IS DISTINCT FROM p_epoch
  OR c.expires_at IS NULL OR c.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Current category permission required' USING ERRCODE='42501';
 END IF;
 RETURN true;
END; $$;

-- Do not retain a pre-existing untrusted function owner after CREATE OR REPLACE.
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['public.voyagr_private_session_active()','public.voyagr_privacy_state()',
 'public.voyagr_set_privacy_choice(text,boolean,text,bigint)','public.voyagr_assert_privacy_permission(text,text,bigint)'] LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO %I',f,current_user);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.voyagr_private_session_active(),public.voyagr_privacy_state(),
 public.voyagr_set_privacy_choice(text,boolean,text,bigint),public.voyagr_assert_privacy_permission(text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.voyagr_private_session_active(),public.voyagr_privacy_state(),
 public.voyagr_set_privacy_choice(text,boolean,text,bigint),public.voyagr_assert_privacy_permission(text,text,bigint) TO authenticated;
GRANT SELECT ON public.voyagr_privacy_consent TO authenticated;
DROP POLICY IF EXISTS privacy_select_own ON public.voyagr_privacy_consent;
CREATE POLICY privacy_select_own ON public.voyagr_privacy_consent FOR SELECT TO authenticated
 USING(user_id=auth.uid() AND public.voyagr_private_session_active());

-- Existing plaintext snapshots remain owner-manageable but cannot accept uploads,
-- even if a future encrypted-cloud category is granted. Restrictive policies also
-- defeat an accidentally retained permissive INSERT/UPDATE policy.
REVOKE ALL ON public.voyagr_profile_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.voyagr_profile_snapshots TO authenticated;
ALTER TABLE public.voyagr_profile_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profile_snapshots_private_boundary ON public.voyagr_profile_snapshots;
CREATE POLICY profile_snapshots_private_boundary ON public.voyagr_profile_snapshots AS RESTRICTIVE FOR ALL TO authenticated
 USING(user_id=auth.uid() AND public.voyagr_private_session_active())
 WITH CHECK(false);
DROP POLICY IF EXISTS profile_snapshots_no_plaintext_insert ON public.voyagr_profile_snapshots;
CREATE POLICY profile_snapshots_no_plaintext_insert ON public.voyagr_profile_snapshots AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
DROP POLICY IF EXISTS profile_snapshots_no_plaintext_update ON public.voyagr_profile_snapshots;
CREATE POLICY profile_snapshots_no_plaintext_update ON public.voyagr_profile_snapshots AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
-- Supabase service-role tokens are not ordinary user consent. DB administrators
-- remain trusted operators who can alter privileges; do not ship their keys.
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN
 REVOKE ALL ON public.voyagr_privacy_policy,public.voyagr_privacy_consent,public.voyagr_profile_snapshots FROM service_role;
 REVOKE ALL ON FUNCTION public.voyagr_private_session_active(),public.voyagr_privacy_state(),
 public.voyagr_set_privacy_choice(text,boolean,text,bigint),public.voyagr_assert_privacy_permission(text,text,bigint) FROM service_role;
END IF; END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
