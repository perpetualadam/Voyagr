-- Review/apply to the configured Supabase project before deploying private dashcam.
-- Existing installations do not rerun Docker init scripts automatically.
-- No recordings are stored here; SQLite/file ownership remains in the application.
BEGIN;
CREATE OR REPLACE FUNCTION public.voyagr_dashcam_session_active()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- GoTrue may create auth.sessions after Postgres init scripts have run.
  -- PL/pgSQL defers table resolution until execution; a missing table fails closed.
  RETURN auth.uid() IS NOT NULL
    AND (auth.jwt()->>'role') = 'authenticated'
    AND COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
    AND EXISTS (
      SELECT 1 FROM auth.sessions AS s
      WHERE s.id::text = (auth.jwt()->>'session_id')
        AND s.user_id = auth.uid()
        AND (s.not_after IS NULL OR s.not_after > now())
    );
END;
$$;
REVOKE ALL ON FUNCTION public.voyagr_dashcam_session_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voyagr_dashcam_session_active() TO authenticated;
COMMENT ON FUNCTION public.voyagr_dashcam_session_active() IS
  'Private dashcam: own session exists and has not passed not_after; returns no session data.';
COMMIT;
