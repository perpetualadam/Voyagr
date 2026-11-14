"""Bounded HTTP probes: never print credentials, UUIDs, response bodies or media."""
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import time
import uuid

import jwt
import requests

GATEWAY = 'http://gateway:8000'
APP = 'http://app:5000'
session = requests.Session()
session.trust_env = False
users_path = Path('/tmp/privacy-users.json')


def request(method, url, token=None, extra_headers=None, **kwargs):
    headers = {'apikey': 'synthetic-lab-key'}
    headers.update(extra_headers or {})
    if token:
        headers['Authorization'] = 'Bearer ' + token
    return session.request(method, url, headers=headers, timeout=(3, 5), allow_redirects=False, **kwargs)


def signup():
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            if request('GET', GATEWAY + '/auth/v1/health').status_code == 200:
                break
        except requests.RequestException:
            pass
        time.sleep(1)
    else:
        raise RuntimeError('Authentication readiness timeout')
    users = []
    for number in (1, 2):
        response = request('POST', GATEWAY + '/auth/v1/signup', json={
            'email': 'privacy-lab-' + uuid.uuid4().hex + '@example.com',
            'password': secrets.token_urlsafe(24),
        })
        if response.status_code != 200:
            raise RuntimeError('Synthetic signup rejected (HTTP ' + str(response.status_code) + ')')
        data = response.json()
        users.append({'id': data['user']['id'], 'token': data['access_token']})
    users_path.write_text(json.dumps(users))
    users_path.chmod(0o600)
    print(json.dumps([{'id': user['id']} for user in users]))


def verify():
    users = json.loads(users_path.read_text())
    a, b = [user['token'] for user in users]
    checks = 0

    def check(name, condition):
        nonlocal checks
        if not condition:
            raise RuntimeError('FAILED: ' + name)
        checks += 1
        print('PASS: ' + name, flush=True)

    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            response = request('GET', APP + '/api/privacy/consent', a)
            if response.status_code == 200:
                break
        except requests.RequestException:
            pass
        time.sleep(1)
    else:
        raise RuntimeError('Application/authenticated authority readiness timeout')
    check('Live GoTrue login reaches real authority', response.status_code == 200)
    check('Private responses are not cacheable', response.headers.get('Cache-Control') == 'private, no-store')
    categories = response.json()['privacy']['categories']
    check('All cloud categories unavailable and OFF', len(categories) == 4 and all(
        not item['enabled'] and not item['available'] for item in categories))
    for token, name in ((None, 'Anonymous'), ('malformed', 'Malformed JWT')):
        check(name + ' rejected by Flask', request('GET', APP + '/api/privacy/consent', token).status_code == 401)
        check(name + ' rejected by database RPC', request('POST', GATEWAY + '/rest/v1/rpc/voyagr_privacy_state', token, json={}).status_code in (401, 403))
    claims = jwt.decode(a, options={'verify_signature': False})
    claims['exp'] = int(time.time()) - 60
    expired = jwt.encode(claims, os.environ['SUPABASE_JWT_SECRET'], algorithm='HS256')
    check('Expired JWT rejected by Flask', request('GET', APP + '/api/privacy/consent', expired).status_code == 401)
    check('Expired JWT rejected by PostgREST', request('POST', GATEWAY + '/rest/v1/rpc/voyagr_privacy_state', expired, json={}).status_code == 401)
    forged = jwt.encode({**claims, 'exp': int(time.time()) + 3600}, 'wrong-synthetic-secret', algorithm='HS256')
    check('Invalid signature rejected by gateway path', request('POST', GATEWAY + '/rest/v1/rpc/voyagr_privacy_state', forged, json={}).status_code == 401)
    service = jwt.encode({'role': 'service_role', 'exp': int(time.time()) + 3600}, os.environ['SUPABASE_JWT_SECRET'], algorithm='HS256')
    check('Service role cannot act as consent owner', request('POST', GATEWAY + '/rest/v1/rpc/voyagr_privacy_state', service, json={}).status_code in (401, 403))
    for token, marker in ((a, 'owner-1'), (b, 'owner-2')):
        response = request('GET', GATEWAY + '/rest/v1/voyagr_profile_snapshots?select=snapshot&profile_id=eq.lab', token)
        check('Snapshot read restricted to ' + marker, response.status_code == 200 and response.json() == [{'snapshot': {'marker': marker}}])
    foreign = '?user_id=eq.' + users[1]['id']
    response = request('DELETE', GATEWAY + '/rest/v1/voyagr_profile_snapshots' + foreign, a)
    check('Foreign deletion has no effect', response.status_code == 204 and len(request('GET', GATEWAY + '/rest/v1/voyagr_profile_snapshots', b).json()) == 1)
    check('Legacy direct snapshot uploads blocked', request('POST', GATEWAY + '/rest/v1/voyagr_profile_snapshots', a,
        json={'user_id': users[0]['id'], 'profile_id': 'new', 'snapshot': {}}).status_code == 403)
    check('Legacy snapshot updates blocked', request('PATCH', GATEWAY + '/rest/v1/voyagr_profile_snapshots', a, json={'snapshot': {}}).status_code == 403)
    check('Unavailable cloud grant rejected', request('PUT', APP + '/api/privacy/consent', a,
        json={'category': 'cloudSync', 'enabled': True, 'policy_version': '2026-11-14.1', 'expected_epoch': 0}).status_code == 403)
    check('Withdrawal remains available', request('PUT', APP + '/api/privacy/consent', a,
        json={'category': 'cloudSync', 'enabled': False}).status_code == 200)
    for path in ('/trip-history', '/favorites', '/search-history', '/dashcam/start', '/dashcam/settings'):
        check('Optional upload denied: ' + path, request('POST', APP + '/api' + path, a, json={}).status_code == 403)
    # Seed existing private SQLite records directly; never weaken the HTTP upload guard.
    with sqlite3.connect('/tmp/privacy-fixtures.sqlite') as connection:
        for number, user in enumerate(users, 1):
            connection.execute("INSERT INTO trips VALUES(?,?,0,0,?,0,0,'synthetic',1,2,3,0,0,'auto','2026-11-14')",
                               (number, user['id'], 'owner-' + str(number)))
    for token, identifier in ((a, 1), (b, 2)):
        response = request('GET', APP + '/api/trip-history', token)
        check('Existing SQLite history restricted to owner ' + str(identifier), response.status_code == 200 and
              [item['id'] for item in response.json()['trips']] == [identifier])
    request('DELETE', APP + '/api/trip-history/2', a)
    check('Foreign SQLite record survives deletion attempt', len(request('GET', APP + '/api/trip-history', b).json()['trips']) == 1)
    check('Owner deletes history with cloud OFF', request('DELETE', APP + '/api/trip-history/1', a).status_code == 200 and not request('GET', APP + '/api/trip-history', a).json()['trips'])
    own_snapshot = GATEWAY + '/rest/v1/voyagr_profile_snapshots?profile_id=eq.lab'
    check('Owner deletes old snapshot with cloud OFF', request('DELETE', own_snapshot, a).status_code == 204 and request('GET', own_snapshot, a).json() == [])
    retained = request('GET', GATEWAY + '/rest/v1/voyagr_profile_snapshots', a)
    check('Revocation fixture exists before logout', retained.status_code == 200 and len(retained.json()) == 1)
    # Use the actual owner-bound storage service to seed pre-existing recordings.
    # Public upload guards stay enabled throughout the test.
    from dashcam_service import DashcamService
    storage = DashcamService(db_path='/tmp/privacy-fixtures.sqlite', storage_dir='/tmp/privacy-clips')
    clips = []
    video = b'synthetic-video-fixture'
    for user in users:
        owner_service = storage.for_owner(user['id'])
        clip = owner_service.start_recording()['recording_id']
        if not owner_service.stop_recording(recording_id=clip)['success']:
            raise RuntimeError('Synthetic recording setup failed')
        if not owner_service.save_recording_file(clip, video, 'webm')['success']:
            raise RuntimeError('Synthetic media setup failed')
        clips.append(clip)
    for token, clip in zip((a, b), clips):
        response = request('GET', APP + '/api/dashcam/recordings', token)
        check('Recording list restricted to owner', response.status_code == 200 and
              [item['recording_id'] for item in response.json()['recordings']] == [clip])
    foreign_clip = APP + '/api/dashcam/recordings/' + clips[1]
    for suffix in ('/metadata', '/video'):
        check('Foreign recording denied: ' + suffix, request('GET', foreign_clip + suffix, a).status_code == 404)
    check('Foreign recording deletion denied', request('DELETE', foreign_clip, a).status_code == 404)
    own_video = APP + '/api/dashcam/recordings/' + clips[0] + '/video'
    response = request('GET', own_video, a, extra_headers={'Range': 'bytes=0-3'})
    check('Owner media range works with cloud OFF', response.status_code == 206 and response.content == video[:4])
    check('Owner deletes recording with cloud OFF', request('DELETE', APP + '/api/dashcam/recordings/' + clips[0], a).status_code == 200 and
          request('GET', own_video, a).status_code == 404)
    check('Foreign recording remains intact', request('GET', foreign_clip + '/video', b).content == video)
    check('Real logout accepted', request('POST', GATEWAY + '/auth/v1/logout?scope=global', a).status_code in (200, 204))
    check('Unexpired token rejected after real logout', request('GET', APP + '/api/privacy/consent', a).status_code == 401)
    revoked_snapshots = request('GET', GATEWAY + '/rest/v1/voyagr_profile_snapshots', a)
    check('Old snapshot API hides retained record after logout', revoked_snapshots.status_code == 200 and revoked_snapshots.json() == [])
    check('Dashcam rejects logged-out token', request('GET', APP + '/api/dashcam/recordings', a).status_code == 401)
    check('Other user remains authenticated', request('GET', APP + '/api/privacy/consent', b).status_code == 200)
    print(str(checks) + ' HTTP integration checks passed.', flush=True)


if __name__ == '__main__':
    try:
        {'signup': signup, 'verify': verify}[sys.argv[1]]()
    except Exception as error:
        # Never print request objects, tokens, response bodies or traceback locals.
        print(str(error) if isinstance(error, RuntimeError) else 'Probe failed: ' + type(error).__name__)
        raise SystemExit(1)
