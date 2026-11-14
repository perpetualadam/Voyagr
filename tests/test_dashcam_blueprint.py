"""Temporary SQLite/file integration: manage legacy media, deny new cloud writes.

JWT/session boundaries are mocked here; the ownership suite verifies real JWTs.
"""
import sqlite3
from unittest.mock import Mock
import pytest
from flask import Flask
from dashcam_blueprint import init_dashcam_blueprint

OWNER='11111111-1111-4111-8111-111111111111'


@pytest.fixture
def app(tmp_path,monkeypatch):
    monkeypatch.setenv('SUPABASE_URL','https://auth.example.test')
    monkeypatch.setenv('SUPABASE_ANON_KEY','public-test-key')
    monkeypatch.setattr('voyagr.utils.dashcam_auth.verify_supabase_jwt',lambda _:dict(sub=OWNER,session_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='authenticated'))
    monkeypatch.setattr('voyagr.utils.dashcam_auth.requests.post',Mock(return_value=Mock(status_code=200,json=lambda:True)))
    app=Flask(__name__);app.config['TESTING']=True
    init_dashcam_blueprint(app,str(tmp_path/'media.db'),str(tmp_path/'private'))
    return app


@pytest.fixture
def client(app):
    client=app.test_client();client.environ_base['HTTP_AUTHORIZATION']='Bearer test-token';return client


@pytest.fixture
def legacy(app):
    store=app.extensions['voyagr_dashcam'].for_owner(OWNER)
    rid=store.start_recording()['recording_id'];assert store.add_metadata(51.5,-.1,2,90,recording_id=rid)
    assert store.stop_recording(recording_id=rid)['success'];assert store.save_recording_file(rid,b'0123456789','video/webm')['success']
    return store,rid


@pytest.mark.parametrize('path',['/start','/metadata','/settings','/recordings/guessed/upload'])
def test_optional_writes_denied_before_body_or_private_storage(app,client,monkeypatch,path):
    factory=Mock(side_effect=AssertionError('must not open private storage'))
    monkeypatch.setattr(app.extensions['voyagr_dashcam'],'for_owner',factory)
    response=client.post('/api/dashcam'+path,data=b'invalid body 53.123456,-1.234567',content_type='application/json')
    assert response.status_code==403 and response.json['code']=='CLOUD_UPLOAD_DISABLED';factory.assert_not_called()
    assert response.headers['Cache-Control']=='private, no-store'


def test_legacy_list_and_metadata_remain_available(client,legacy):
    _,rid=legacy;rows=client.get('/api/dashcam/recordings').json['recordings'];assert len(rows)==1
    assert rows[0]['recording_id']==rid and rows[0]['has_video'];assert 'file_path' not in rows[0] and 'owner_user_id' not in rows[0]
    metadata=client.get(f'/api/dashcam/recordings/{rid}/metadata');assert metadata.status_code==200
    assert metadata.json['metadata_points']==1 and metadata.json['points'][0]['lat']==51.5


def test_legacy_playback_download_range_and_delete(client,legacy):
    store,rid=legacy
    assert client.post(f'/api/dashcam/recordings/{rid}/upload',data=b'overwrite').status_code==403
    response=client.get(f'/api/dashcam/recordings/{rid}/video');assert response.data==b'0123456789'
    assert client.get(f'/api/dashcam/recordings/{rid}/video',headers={'Range':'bytes=2-4'}).data==b'234'
    assert client.get(f'/api/dashcam/recordings/{rid}/video?download=1').headers['Content-Disposition'].startswith('attachment;')
    assert client.delete(f'/api/dashcam/recordings/{rid}').json['success']
    assert client.get(f'/api/dashcam/recordings/{rid}/video').status_code==404
    assert not store.get_recording_metadata(rid)['success']


def test_existing_active_session_can_be_stopped_without_new_upload(client,app):
    store=app.extensions['voyagr_dashcam'].for_owner(OWNER);rid=store.start_recording()['recording_id']
    assert client.get('/api/dashcam/status').json['recording_id']==rid
    assert client.post('/api/dashcam/stop',json={'recording_id':rid}).json['success']
    assert client.get('/api/dashcam/status').json['recording'] is False


def test_existing_settings_read_and_explicit_cleanup_remain_available(client,legacy):
    store,rid=legacy;assert client.get('/api/dashcam/settings').status_code==200
    assert client.post('/api/dashcam/settings',json={'retention_days':0}).status_code==403
    assert client.get('/api/dashcam/settings').json['settings']['retention_days']==7
    store.update_settings({'retention_days':0})  # Synthetic fixture only, not a production retention change.
    assert client.post('/api/dashcam/cleanup').json['deleted_count']==1
    assert client.get(f'/api/dashcam/recordings/{rid}/video').status_code==404
