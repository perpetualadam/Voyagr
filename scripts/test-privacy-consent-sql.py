#!/usr/bin/env python3
"""Real isolated PostgreSQL tests. Never accepts a production DSN.

Fixtures emulate PostgREST-verified claims; JWT/gateway crypto is tested separately.
The only payload write RPC here is a synthetic test fixture, not a cloud feature.
"""
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import pgserver
import psycopg2

A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
VERSION='2026-11-14.1'
ROOT=Path(__file__).resolve().parents[1]


class PrivacySQLTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory(prefix='voyagr-privacy-sql-')
  cls.server=pgserver.get_server(Path(cls.temp.name)/'pgdata',cleanup_mode='stop')
  cls.conn=psycopg2.connect(cls.server.get_uri());cls.conn.autocommit=True
  with cls.conn.cursor() as c:
   c.execute('''CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
   ''')
   for name in ['01-voyagr-schema.sql','02-dashcam-session-check.sql','03-privacy-consent.sql','03-privacy-consent.sql']:
    c.execute((ROOT/'supabase-selfhost/volumes/db/init'/name).read_text())
   c.execute('''CREATE TABLE public.test_payload(user_id uuid,marker text);
    CREATE FUNCTION public.test_guarded_write(category text,version text,epoch bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
      PERFORM public.voyagr_assert_privacy_permission(category,version,epoch);
      INSERT INTO public.test_payload VALUES(auth.uid(),'synthetic'); END; $$;
    REVOKE ALL ON FUNCTION public.test_guarded_write(text,text,bigint) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.test_guarded_write(text,text,bigint) TO authenticated;
   ''')
 @classmethod
 def tearDownClass(cls):
  cls.conn.close();cls.server.cleanup();cls.temp.cleanup()
 def setUp(self):
  with self.conn.cursor() as c:
   c.execute('RESET ROLE;DELETE FROM auth.sessions;DELETE FROM public.voyagr_privacy_consent;DELETE FROM public.voyagr_profile_snapshots;DELETE FROM public.test_payload;UPDATE public.voyagr_privacy_policy SET available=false,policy_version=%s',(VERSION,))
   c.execute('INSERT INTO auth.sessions(id,user_id) VALUES(%s,%s),(%s,%s)',(SA,A,SB,B))
 def claims(self,owner=A,**kw):
  return dict(sub=owner,session_id=SA if owner==A else SB,role='authenticated',exp=time.time()+3600,**kw)
 def query(self,sql,args=(),owner=A,role='authenticated',claims=None):
  with self.conn.cursor() as c:
   c.execute('SET ROLE '+role)
   try:
    c.execute("SELECT set_config('request.jwt.claims',%s,false)",(json.dumps(claims or self.claims(owner)),))
    c.execute(sql,args)
    return c.fetchall() if c.description else []
   finally:c.execute('RESET ROLE')
 def state(self,owner=A):return self.query('SELECT public.voyagr_privacy_state()',owner=owner)[0][0]
 def enable(self,category='cloudSync',owner=A):
  with self.conn.cursor() as c:c.execute('UPDATE public.voyagr_privacy_policy SET available=true WHERE category=%s',(category,))
  self.query('SELECT public.voyagr_set_privacy_choice(%s,true,%s,0)',(category,VERSION),owner=owner)
 def assert_write_denied(self,category='cloudSync',version=VERSION,epoch=1,**kw):
  with self.assertRaises(psycopg2.errors.InsufficientPrivilege):self.query('SELECT public.test_guarded_write(%s,%s,%s)',(category,version,epoch),**kw)
 def test_defaults_are_off_without_backfill(self):
  state=self.state();self.assertEqual(len(state['categories']),4)
  self.assertTrue(all(not x['enabled'] and not x['available'] and x['epoch']==0 for x in state['categories']))
  self.assert_write_denied()
 def test_unavailable_category_cannot_grant(self):
  with self.assertRaises(psycopg2.errors.InsufficientPrivilege):self.query('SELECT public.voyagr_set_privacy_choice(%s,true,%s,0)',('cloudSync',VERSION))
 def test_valid_category_epoch_policy_and_owner(self):
  self.enable();self.query('SELECT public.test_guarded_write(%s,%s,1)',('cloudSync',VERSION))
  with self.conn.cursor() as c:c.execute("UPDATE public.voyagr_privacy_policy SET available=true WHERE category='dashcamBackup'")
  self.assert_write_denied(owner=B);self.assert_write_denied(category='dashcamBackup');self.assert_write_denied(epoch=0);self.assert_write_denied(version='old')
 def test_stale_grant_conflicts_and_stale_withdrawal_succeeds(self):
  self.enable()
  with self.assertRaises(psycopg2.errors.SerializationFailure):self.query('SELECT public.voyagr_set_privacy_choice(%s,true,%s,0)',('cloudSync',VERSION))
  self.query("SELECT public.voyagr_set_privacy_choice('cloudSync',false,'old',0)")
  self.assert_write_denied();row=next(x for x in self.state()['categories'] if x['category']=='cloudSync');self.assertEqual(row['epoch'],2)
 def test_expired_or_policy_changed_grant_denied(self):
  self.enable()
  with self.conn.cursor() as c:c.execute("UPDATE public.voyagr_privacy_consent SET expires_at=clock_timestamp()-interval '1 second'")
  self.assert_write_denied()
  with self.conn.cursor() as c:c.execute("UPDATE public.voyagr_privacy_consent SET expires_at=clock_timestamp()+interval '1 hour';UPDATE public.voyagr_privacy_policy SET policy_version='next'")
  self.assert_write_denied();self.assert_write_denied(version='next')
 def test_disabled_capability_denies_existing_grant(self):
  self.enable()
  with self.conn.cursor() as c:c.execute('UPDATE public.voyagr_privacy_policy SET available=false')
  self.assert_write_denied();self.assertTrue(all(not x['enabled'] for x in self.state()['categories']))
 def test_invalid_session_and_token_roles_deny(self):
  self.enable()
  for overrides in [{'role':'service_role'},{'is_anonymous':True},{'session_id':SB},{'exp':0}]:
   claims=self.claims();claims.update(overrides);self.assert_write_denied(claims=claims)
  with self.conn.cursor() as c:c.execute('DELETE FROM auth.sessions WHERE id=%s',(SA,))
  self.assert_write_denied()
 def test_missing_role_or_expiry_never_means_authenticated(self):
  self.enable()
  for key in ['role','exp','session_id','sub']:
   claims=self.claims();del claims[key];self.assert_write_denied(claims=claims)
 def test_timeboxed_session_denied(self):
  self.enable()
  with self.conn.cursor() as c:c.execute("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second'")
  self.assert_write_denied()
 def test_raw_consent_writes_and_other_owner_reads_denied(self):
  self.enable();self.enable(owner=B)
  self.assertEqual(len(self.query('SELECT * FROM public.voyagr_privacy_consent')),1)
  for sql in ["INSERT INTO public.voyagr_privacy_consent(user_id,category,policy_version) VALUES('11111111-1111-4111-8111-111111111111','dashcamBackup','2026-11-14.1')","UPDATE public.voyagr_privacy_consent SET granted=true","DELETE FROM public.voyagr_privacy_consent","UPDATE public.voyagr_privacy_policy SET available=true"]:
   with self.assertRaises(psycopg2.errors.InsufficientPrivilege):self.query(sql)
 def test_anon_and_service_role_have_no_authority(self):
  for role in ['anon','service_role']:
   for sql in ['SELECT public.voyagr_privacy_state()','SELECT * FROM public.voyagr_privacy_consent','SELECT * FROM public.voyagr_profile_snapshots']:
    with self.assertRaises(psycopg2.errors.InsufficientPrivilege):self.query(sql,role=role)
 def seed_snapshot(self):
  with self.conn.cursor() as c:c.execute("INSERT INTO public.voyagr_profile_snapshots VALUES(%s,%s,%s,now()),(%s,%s,%s,now())",(A,'sb:'+A,'{"label":"old-A"}',B,'sb:'+B,'{"label":"old-B"}'))
 def test_legacy_snapshots_manageable_without_grant(self):
  self.seed_snapshot();rows=self.query('SELECT snapshot FROM public.voyagr_profile_snapshots');self.assertEqual(rows,[({'label':'old-A'},)])
  self.query('DELETE FROM public.voyagr_profile_snapshots WHERE user_id=%s',(B,));self.assertEqual(len(self.query('SELECT * FROM public.voyagr_profile_snapshots',owner=B)),1)
  self.query('DELETE FROM public.voyagr_profile_snapshots');self.assertEqual(self.query('SELECT * FROM public.voyagr_profile_snapshots'),[])
 def test_legacy_plaintext_uploads_denied_even_with_grant(self):
  self.enable();self.seed_snapshot()
  for sql,args in [("INSERT INTO public.voyagr_profile_snapshots(user_id,profile_id,snapshot) VALUES(%s,'new','{}')",(A,)),("UPDATE public.voyagr_profile_snapshots SET snapshot='{}'",())]:
   with self.assertRaises(psycopg2.errors.InsufficientPrivilege):self.query(sql,args)
 def test_restrictive_boundary_survives_accidental_permissive_write_grant(self):
  self.seed_snapshot()
  with self.conn.cursor() as c:c.execute('GRANT INSERT,UPDATE ON public.voyagr_profile_snapshots TO authenticated')
  try:
   with self.assertRaises(psycopg2.errors.InsufficientPrivilege):self.query("INSERT INTO public.voyagr_profile_snapshots(user_id,profile_id,snapshot) VALUES(%s,'new','{}')",(A,))
   self.query("UPDATE public.voyagr_profile_snapshots SET snapshot='{}'");self.assertEqual(self.query('SELECT snapshot FROM public.voyagr_profile_snapshots'),[({'label':'old-A'},)])
  finally:
   with self.conn.cursor() as c:c.execute('REVOKE INSERT,UPDATE ON public.voyagr_profile_snapshots FROM authenticated')
 def test_migration_rejects_exposed_role_bypass_before_changing_policies(self):
  with self.conn.cursor() as c:
   c.execute('ALTER ROLE authenticated BYPASSRLS')
   try:
    with self.assertRaises(psycopg2.errors.RaiseException):c.execute((ROOT/'supabase-selfhost/volumes/db/init/03-privacy-consent.sql').read_text())
   finally:c.execute('ROLLBACK; ALTER ROLE authenticated NOBYPASSRLS')
  self.assertTrue(all(not row['available'] for row in self.state()['categories']))
 def test_repeat_migration_preserves_records_and_epochs(self):
  self.seed_snapshot();self.enable();before=self.state()
  with self.conn.cursor() as c:c.execute((ROOT/'supabase-selfhost/volumes/db/init/03-privacy-consent.sql').read_text())
  self.assertEqual(self.state(),before);self.assertEqual(len(self.query('SELECT * FROM public.voyagr_profile_snapshots')),1)
 def transaction_connection(self):
  conn=psycopg2.connect(self.server.get_uri());c=conn.cursor();c.execute('SET LOCAL ROLE authenticated');c.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps(self.claims()),));c.close();return conn
 def race(self,first,second,second_denied=False):
  self.enable();c1=self.transaction_connection();errors=[];done=threading.Event();pid=[]
  try:
   with c1.cursor() as c:c.execute(first)
   def worker():
    conn=self.transaction_connection();pid.append(conn.get_backend_pid())
    try:
     with conn.cursor() as c:c.execute(second)
     conn.commit()
    except Exception as e:errors.append(e);conn.rollback()
    finally:conn.close();done.set()
   thread=threading.Thread(target=worker);thread.start()
   deadline=time.monotonic()+3;blocked=False
   while time.monotonic()<deadline and not done.is_set():
    if pid:
     with self.conn.cursor() as c:c.execute('SELECT cardinality(pg_blocking_pids(%s))',(pid[0],));blocked=bool(c.fetchone()[0])
     if blocked:break
    time.sleep(.01)
   self.assertTrue(blocked,'Second operation must wait on the real consent lock');c1.commit();thread.join(5);self.assertTrue(done.is_set())
   self.assertEqual(len(errors),int(second_denied))
   if errors:self.assertIsInstance(errors[0],psycopg2.errors.InsufficientPrivilege)
   self.assert_write_denied()
  finally:c1.rollback();c1.close()
 def test_write_first_commits_before_waiting_withdrawal(self):
  self.race("SELECT public.test_guarded_write('cloudSync','2026-11-14.1',1)","SELECT public.voyagr_set_privacy_choice('cloudSync',false)")
  with self.conn.cursor() as c:c.execute('SELECT count(*) FROM public.test_payload');self.assertEqual(c.fetchone()[0],1)
 def test_withdrawal_first_blocks_waiting_write(self):
  self.race("SELECT public.voyagr_set_privacy_choice('cloudSync',false)","SELECT public.test_guarded_write('cloudSync','2026-11-14.1',1)",True)
  with self.conn.cursor() as c:c.execute('SELECT count(*) FROM public.test_payload');self.assertEqual(c.fetchone()[0],0)
 def test_session_timebox_revocation_waits_for_authorised_write(self):
  # RESET ROLE represents the trusted GoTrue authority, not a client capability.
  self.race("SELECT public.test_guarded_write('cloudSync','2026-11-14.1',1)","RESET ROLE; UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second'")
 def test_session_timebox_revocation_first_blocks_waiting_write(self):
  self.race("RESET ROLE; UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second'","SELECT public.test_guarded_write('cloudSync','2026-11-14.1',1)",True)

if __name__=='__main__':unittest.main(verbosity=2)
