"""Real JWT verification and SQLite/files; only Supabase session authority is mocked."""
import io
import os
import sqlite3
import time
from pathlib import Path
from unittest.mock import Mock

import jwt
import pytest
import requests
from flask import Flask

from dashcam_blueprint import init_dashcam_blueprint
from dashcam_service import DashcamService
from dashcam_schema import ensure_dashcam_schema

A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
SA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
SB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
KEY = 'unit-test-signing-material-not-a-production-secret'
ISSUER = 'https://auth.example.test/auth/v1'


def token(user=A, session=SA, **overrides):
    claims = dict(sub=user, session_id=session, role='authenticated', aud='authenticated',
                  iss=ISSUER, iat=int(time.time())-1, exp=int(time.time())+3600)
    claims.update(overrides)
    return jwt.encode(claims, KEY, algorithm='HS256')


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv('SUPABASE_JWT_SECRET', KEY)
    monkeypatch.setenv('SUPABASE_URL', 'https://auth.example.test')
    monkeypatch.setenv('SUPABASE_ANON_KEY', 'test-public-key')
    monkeypatch.setenv('ALLOW_LOCAL_UNAUTH', 'true')  # Explicitly cannot bypass dashcam.
    db = tmp_path / 'recordings.db'
    storage = tmp_path / 'private'
    app = Flask(__name__)
    app.config.update(TESTING=True, MAX_CONTENT_LENGTH=1024*1024)
    init_dashcam_blueprint(app, str(db), str(storage))
    revoked = set()

    def authority(url, *, json, headers, timeout, allow_redirects):
        assert url == 'https://auth.example.test/rest/v1/rpc/voyagr_dashcam_session_active'
        assert json == {} and headers['apikey'] == 'test-public-key'
        assert allow_redirects is False and timeout == (3, 5)
        c = jwt.decode(headers['Authorization'][7:], KEY, algorithms=['HS256'], audience='authenticated', issuer=ISSUER)
        active = c['session_id'] not in revoked and {SA:A, SB:B}.get(c['session_id']) == c['sub']
        return Mock(status_code=200, json=lambda: active)

    rpc = Mock(side_effect=authority)
    monkeypatch.setattr('voyagr.utils.dashcam_auth.requests.post', rpc)
    clients = []
    for owner, session in [(A, SA), (B, SB)]:
        client = app.test_client()
        client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ' + token(owner, session)
        clients.append(client)
    return app, clients[0], clients[1], revoked, rpc, db, storage


def make_clip(client, data=b'owner-video', *, stop=True):
    rv = client.post('/api/dashcam/start', json={'user_id': B, 'owner_user_id': B})
    assert rv.status_code == 200 and rv.json['success']
    rid = rv.json['recording_id']
    rv = client.post('/api/dashcam/metadata', json=dict(recording_id=rid, lat=51.5, lon=-0.1, speed=2, heading=90))
    assert rv.status_code == 200 and rv.json['success']
    if stop:
        assert client.post('/api/dashcam/stop', json={'recording_id':rid}).json['success']
    assert client.post(f'/api/dashcam/recordings/{rid}/upload', data=data, content_type='video/webm').json['success']
    return rid


ENDPOINTS = [
    ('POST', '/start'), ('POST', '/stop'), ('GET', '/status'), ('POST', '/metadata'),
    ('GET', '/recordings'), ('GET', '/recordings/guessed/metadata'),
    ('GET', '/recordings/guessed/video'), ('POST', '/recordings/guessed/upload'),
    ('DELETE', '/recordings/guessed'), ('POST', '/cleanup'),
    ('GET', '/settings'), ('POST', '/settings'),
]


@pytest.mark.parametrize('method,path', ENDPOINTS)
def test_every_endpoint_requires_auth_even_on_localhost(setup, method, path):
    app, *_ = setup
    rv = app.test_client().open('/api/dashcam'+path, method=method, json={})
    assert rv.status_code == 401
    assert rv.headers['Cache-Control'] == 'private, no-store'


@pytest.mark.parametrize('header', ['Basic token', 'Bearer', 'Bearer one two', 'Bearer invalid.jwt', 'Bearer null'])
def test_malformed_credentials_fail_closed(setup, header):
    app, _, _, _, rpc, *_ = setup
    rv = app.test_client().get('/api/dashcam/recordings', headers={'Authorization':header})
    assert rv.status_code == 401
    rpc.assert_not_called()


@pytest.mark.parametrize('bad', [
    lambda: token(exp=int(time.time())-30),
    lambda: jwt.encode(dict(sub=A, session_id=SA, role='authenticated', exp=int(time.time())+100), 'wrong-key', algorithm='HS256'),
    lambda: token(aud='other'), lambda: token(iss='https://wrong.example/auth/v1'),
    lambda: token(role='service_role'), lambda: token(is_anonymous=True),
    lambda: token(session_id=''), lambda: token(sub=''),
])
def test_invalid_expired_or_non_user_tokens_denied(setup, bad):
    app, _, _, _, rpc, *_ = setup
    rv = app.test_client().get('/api/dashcam/status', headers={'Authorization':'Bearer '+bad()})
    assert rv.status_code == 401
    rpc.assert_not_called()


def test_revoked_session_cannot_reuse_previously_accepted_token(setup):
    app, a, _, revoked, *_ = setup
    assert a.get('/api/dashcam/recordings').status_code == 200
    revoked.add(SA)
    for method, path in ENDPOINTS:
        assert a.open('/api/dashcam'+path, method=method, json={}).status_code == 401


def test_session_id_must_belong_to_subject(setup):
    app, *_ = setup
    rv = app.test_client().get('/api/dashcam/status', headers={'Authorization':'Bearer '+token(A, SB)})
    assert rv.status_code == 401


@pytest.mark.parametrize('response', [Mock(status_code=404), Mock(status_code=500), Mock(status_code=200, json=lambda: 'true')])
def test_missing_rpc_or_invalid_authority_response_is_not_authorization(setup, response):
    _, a, _, _, rpc, *_ = setup
    rpc.side_effect = None
    rpc.return_value = response
    assert a.get('/api/dashcam/recordings').status_code in (401, 503)


def test_authority_timeout_fails_closed_without_detail_leak(setup):
    _, a, _, _, rpc, *_ = setup
    rpc.side_effect = requests.Timeout('private-upstream-details')
    rv = a.get('/api/dashcam/status')
    assert rv.status_code == 503
    assert b'private-upstream-details' not in rv.data


def test_missing_auth_configuration_fails_closed(setup, monkeypatch):
    _, a, _, _, rpc, *_ = setup
    monkeypatch.delenv('SUPABASE_ANON_KEY')
    assert a.get('/api/dashcam/status').status_code == 503
    rpc.assert_not_called()


def test_two_owners_cannot_enumerate_or_change_others_resources(setup):
    app, a, b, _, _, db, storage = setup
    arid = make_clip(a, b'video-A', stop=False)
    brid = make_clip(b, b'video-B', stop=False)
    # Simultaneous active sessions have independent status, metadata and control.
    assert a.get('/api/dashcam/status').json['recording_id'] == arid
    assert b.get('/api/dashcam/status').json['recording_id'] == brid
    for attacker, foreign in [(a, brid), (b, arid)]:
        listing = attacker.get('/api/dashcam/recordings?user_id='+B+'&limit=-1').json['recordings']
        assert len(listing) == 1 and listing[0]['recording_id'] != foreign
        assert 'file_path' not in listing[0] and 'owner_user_id' not in listing[0]
        for suffix in ['/metadata', '/video', '/video?download=1']:
            rv = attacker.get(f'/api/dashcam/recordings/{foreign}'+suffix, headers={'Range':'bytes=0-2'})
            assert rv.status_code == 404
        assert attacker.delete(f'/api/dashcam/recordings/{foreign}').status_code == 404
        assert attacker.post(f'/api/dashcam/recordings/{foreign}/upload', data=b'overwrite').status_code == 404
        assert attacker.post('/api/dashcam/metadata', json=dict(recording_id=foreign, lat=0,lon=0,speed=0,heading=0)).status_code == 404
        assert attacker.post('/api/dashcam/stop', json={'recording_id':foreign}).status_code == 404
        # No thumbnail/sharing route exists, so no derivative resource can bypass auth.
        assert attacker.get(f'/api/dashcam/recordings/{foreign}/thumbnail').status_code == 404
    assert a.get(f'/api/dashcam/recordings/{arid}/video').data == b'video-A'
    assert b.get(f'/api/dashcam/recordings/{brid}/video').data == b'video-B'
    assert a.get(f'/api/dashcam/recordings/{arid}/metadata').json['metadata_points'] == 1
    with sqlite3.connect(db) as conn:
        assert conn.execute('SELECT owner_user_id FROM dashcam_recordings WHERE recording_id=?',(arid,)).fetchone()[0] == A


def test_legitimate_playback_range_multipart_download_and_delete(setup):
    app, a, _, _, _, db, storage = setup
    rid = make_clip(a)
    rv = a.post(f'/api/dashcam/recordings/{rid}/upload', data={'file':(io.BytesIO(b'0123456789'), 'clip.webm')})
    assert rv.status_code == 200 and 'file_path' not in rv.json
    rv = a.get(f'/api/dashcam/recordings/{rid}/video?download=1')
    assert rv.data == b'0123456789' and rv.headers['Content-Disposition'].startswith('attachment;')
    assert rv.headers['Cache-Control'] == 'private, no-store'
    rv = a.get(f'/api/dashcam/recordings/{rid}/video', headers={'Range':'bytes=2-4'})
    assert rv.status_code == 206 and rv.data == b'234'
    assert a.delete(f'/api/dashcam/recordings/{rid}').json['success']
    assert a.get(f'/api/dashcam/recordings/{rid}/video').status_code == 404
    assert not list(storage.rglob('*.webm')) and not list(storage.rglob('*.meta.json'))


def test_cleanup_and_settings_are_owner_scoped(setup):
    _, a, b, *_ = setup
    arid = make_clip(a)
    brid = make_clip(b)
    assert a.post('/api/dashcam/settings', json={'retention_days':0, 'owner_user_id':B}).json['success']
    assert b.get('/api/dashcam/settings').json['settings']['retention_days'] == 7
    assert a.post('/api/dashcam/cleanup').json['deleted_count'] == 1
    assert a.get('/api/dashcam/recordings').json['recordings'] == []
    assert b.get(f'/api/dashcam/recordings/{brid}/video').status_code == 200


def test_legacy_rows_quarantined_and_migration_repeatable(tmp_path):
    db = tmp_path/'legacy.db'
    legacy_file = tmp_path/'old-video.webm'
    legacy_file.write_bytes(b'legacy')
    with sqlite3.connect(db) as conn:
        conn.execute('''CREATE TABLE dashcam_recordings(id INTEGER PRIMARY KEY, recording_id TEXT UNIQUE NOT NULL,
        trip_id TEXT,start_time TEXT NOT NULL,end_time TEXT,duration_seconds REAL,status TEXT,metadata_points INTEGER,
        file_path TEXT,file_size_mb REAL,created_at TEXT)''')
        conn.execute("INSERT INTO dashcam_recordings(recording_id,start_time,status,file_path) VALUES('legacy','2000-01-01','completed',?)",(str(legacy_file),))
        ensure_dashcam_schema(conn)
        ensure_dashcam_schema(conn)
    for owner in [A,B]:
        service = DashcamService(str(db), str(tmp_path/'store'), owner_user_id=owner)
        assert service.get_recordings() == []
        assert not service.get_recording_metadata('legacy')['success']
        assert not service.get_recording_file('legacy')['success']
        assert not service.delete_recording('legacy')['success']
        assert not service.save_recording_file('legacy', b'changed')['success']
        service.update_settings({'retention_days':0})
        assert service.cleanup_old_recordings()['deleted_count'] == 0
    assert legacy_file.read_bytes() == b'legacy'
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT owner_user_id FROM dashcam_recordings WHERE recording_id='legacy'").fetchone()[0] is None


def test_workers_share_persistent_sessions_and_metadata(setup):
    _, _, _, _, _, db, storage = setup
    one = DashcamService(str(db),str(storage), owner_user_id=A)
    two = DashcamService(str(db),str(storage), owner_user_id=A)
    rid = one.start_recording()['recording_id']
    assert not two.start_recording()['success']
    assert two.add_metadata(51,-1,3,90, recording_id=rid)
    assert one.get_recording_status()['metadata_points'] == 1
    assert two.stop_recording(recording_id=rid)['success']
    assert not one.get_recording_status()['recording']
    assert one.get_recording_metadata(rid)['metadata_points'] == 1


def test_missing_identity_at_service_layer_fails_closed(setup):
    _, _, _, _, _, db, storage = setup
    service = DashcamService(str(db),str(storage))
    for action in [service.start_recording, service.get_recordings, service.get_recording_status,
                   service.get_settings, service.cleanup_old_recordings]:
        with pytest.raises(PermissionError): action()


def test_parameter_and_path_manipulation_does_not_bypass_owner(setup):
    app, a, b, _, _, db, storage = setup
    rid = make_clip(b)
    anon = app.test_client()
    bearer = b.environ_base['HTTP_AUTHORIZATION'][7:]
    assert anon.get(f'/api/dashcam/recordings/{rid}/video?access_token={bearer}&user_id={B}').status_code == 401
    assert a.get(f'/api/dashcam/recordings/{rid}/video?owner_user_id={B}&download=1').status_code == 404
    assert a.get('/api/dashcam/recordings/..%2F..%2Foutside/video').status_code == 404
    assert a.get('/dashcam_recordings/'+rid+'.webm').status_code == 404
    assert a.get('/static/../dashcam_recordings/'+rid+'.webm').status_code == 404


def test_file_path_and_symlink_cannot_cross_owner_directory(setup, tmp_path):
    app, a, b, _, _, db, storage = setup
    arid = make_clip(a)
    brid = make_clip(b)
    bfile = app.extensions['voyagr_dashcam'].for_owner(B).get_recording_file(brid)['file_path']
    with sqlite3.connect(db) as conn:
        conn.execute('UPDATE dashcam_recordings SET file_path=? WHERE recording_id=?',(bfile,arid))
    assert a.get(f'/api/dashcam/recordings/{arid}/video').status_code == 404
    assert a.delete(f'/api/dashcam/recordings/{arid}').json['success']
    assert Path(bfile).read_bytes() == b'owner-video'
    arid = make_clip(a)
    afile = Path(app.extensions['voyagr_dashcam'].for_owner(A).get_recording_file(arid)['file_path'])
    afile.unlink(); afile.symlink_to(bfile)
    assert a.get(f'/api/dashcam/recordings/{arid}/video').status_code == 404
    assert a.post(f'/api/dashcam/recordings/{arid}/upload',data=b'hack').status_code == 500
    assert Path(bfile).read_bytes() == b'owner-video'


def test_trip_association_requires_same_owner(setup):
    _, a, b, _, _, db, _ = setup
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE trips(id INTEGER PRIMARY KEY, user_id TEXT)')
        conn.execute('INSERT INTO trips(id,user_id) VALUES(1,?)',(B,))
    assert a.post('/api/dashcam/start', json={'trip_id':1}).json['success'] is False
    assert b.post('/api/dashcam/start', json={'trip_id':1}).json['success'] is True


def test_refuse_storage_under_public_static_directory(tmp_path):
    app = Flask(__name__, static_folder=str(tmp_path/'static'))
    with pytest.raises(ValueError, match='publicly served'):
        init_dashcam_blueprint(app, str(tmp_path/'db.sqlite'), str(tmp_path/'static'/'recordings'))


def test_cannot_forge_owner_through_cookie_or_api_key(setup):
    app, *_ = setup
    client = app.test_client()
    client.set_cookie('owner_user_id', B)
    rv = client.get('/api/dashcam/recordings?owner_user_id='+B,
                    headers={'X-User-ID':B, 'X-API-Key':'development-key', 'X-Forwarded-For':'127.0.0.1'})
    assert rv.status_code == 401


def test_concurrent_starts_create_only_one_active_recording_per_owner(setup):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    _, _, _, _, _, db, storage = setup
    service = DashcamService(str(db), str(storage), owner_user_id=A)
    barrier = Barrier(4)
    def start(_):
        barrier.wait()
        return service.start_recording()['success']
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(start, range(4)))
    assert results.count(True) == 1
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT count(*) FROM dashcam_recordings WHERE owner_user_id=? AND status='recording'",(A,)).fetchone()[0] == 1
