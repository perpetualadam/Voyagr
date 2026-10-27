#!/usr/bin/env python3
"""Run session-RPC privilege tests on isolated PostgreSQL (pgserver + psycopg2).

Never accepts a production DSN. Supabase auth helpers/session table are fixtures;
this validates the actual migration SQL, not the deployed GoTrue gateway.
"""
import json
from pathlib import Path
import tempfile
import unittest

import pgserver
import psycopg2

A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
S = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'


class SessionPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='voyagr-session-sql-')
        cls.server = pgserver.get_server(Path(cls.temp.name)/'pgdata', cleanup_mode='stop')
        cls.conn = psycopg2.connect(cls.server.get_uri())
        cls.conn.autocommit = True
        with cls.conn.cursor() as c:
            c.execute('''CREATE ROLE anon; CREATE ROLE authenticated;
                CREATE SCHEMA auth;
                CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
                CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
                  $$ SELECT current_setting('request.jwt.claims', true)::jsonb $$;
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
                  $$ SELECT (auth.jwt()->>'sub')::uuid $$;
                GRANT USAGE ON SCHEMA auth TO authenticated;
            ''')
            sql = (Path(__file__).resolve().parents[1]/'supabase-selfhost/volumes/db/init/02-dashcam-session-check.sql').read_text()
            c.execute(sql)
            c.execute(sql)  # Repeatable migration.

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        cls.server.cleanup()
        cls.temp.cleanup()

    def setUp(self):
        with self.conn.cursor() as c:
            c.execute('RESET ROLE; DELETE FROM auth.sessions')
            c.execute('INSERT INTO auth.sessions(id,user_id) VALUES(%s,%s)', (S,A))

    def query(self, claims, role='authenticated'):
        with self.conn.cursor() as c:
            c.execute('SET ROLE '+role)
            try:
                c.execute("SELECT set_config('request.jwt.claims',%s,false)", (json.dumps(claims),))
                c.execute('SELECT public.voyagr_dashcam_session_active()')
                return c.fetchone()[0]
            finally:
                c.execute('RESET ROLE')

    def claims(self, **kw):
        return dict(sub=A, session_id=S, role='authenticated', **kw)

    def test_migration_can_precede_gotrue_session_table(self):
        sql = (Path(__file__).resolve().parents[1]/'supabase-selfhost/volumes/db/init/02-dashcam-session-check.sql').read_text()
        with self.conn.cursor() as c:
            c.execute('ALTER TABLE auth.sessions RENAME TO sessions_not_yet_migrated')
            try:
                c.execute(sql)
                with self.assertRaises(psycopg2.errors.UndefinedTable):
                    self.query(self.claims())
            finally:
                c.execute('ALTER TABLE auth.sessions_not_yet_migrated RENAME TO sessions')
        self.assertIs(self.query(self.claims()), True)

    def test_active_own_session(self):
        self.assertIs(self.query(self.claims()), True)

    def test_other_user_session(self):
        claims=self.claims(); claims['sub']=B
        self.assertIs(self.query(claims), False)

    def test_deleted_revoked_session(self):
        self.assertIs(self.query(self.claims()), True)
        with self.conn.cursor() as c: c.execute('DELETE FROM auth.sessions WHERE id=%s',(S,))
        self.assertIs(self.query(self.claims()), False)

    def test_timeboxed_expired_session(self):
        with self.conn.cursor() as c: c.execute("UPDATE auth.sessions SET not_after=now()-interval '1 second'")
        self.assertIs(self.query(self.claims()), False)

    def test_timeboxed_future_session(self):
        with self.conn.cursor() as c: c.execute("UPDATE auth.sessions SET not_after=now()+interval '1 minute'")
        self.assertIs(self.query(self.claims()), True)

    def test_missing_session(self):
        claims=self.claims(); del claims['session_id']
        self.assertIs(self.query(claims), False)

    def test_anonymous_user(self):
        self.assertIs(self.query(self.claims(is_anonymous=True)), False)

    def test_wrong_claim_role(self):
        claims=self.claims(); claims['role']='service_role'
        self.assertIs(self.query(claims), False)

    def test_anon_cannot_execute(self):
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            self.query(self.claims(), role='anon')

    def test_authenticated_cannot_read_session_rows(self):
        with self.conn.cursor() as c:
            c.execute('SET ROLE authenticated')
            try:
                with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
                    c.execute('SELECT * FROM auth.sessions')
            finally: c.execute('RESET ROLE')


if __name__ == '__main__':
    unittest.main(verbosity=2)
