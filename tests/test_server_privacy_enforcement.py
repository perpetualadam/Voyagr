"""Temporary SQLite + real JWT verification; only remote session/consent RPCs mocked.

Actual PostgreSQL/RLS/locking is exercised by test-privacy-consent-sql.py separately.
"""
import json
import sqlite3
import time
from unittest.mock import Mock
import jwt
import pytest
import requests
from flask import Flask
from voyagr.api.privacy import privacy_bp
from voyagr.api.search import search_bp
from voyagr.api.trips import trips_bp
from voyagr.api.settings import settings_bp
from voyagr.utils import auth

A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
KEY='test-only-privacy-signing-key-never-production'
VERSION='2026-11-14.1'
CATEGORIES=['cloudSync','history','dashcamBackup','diagnostics']


def token(owner=A,**kw):
    claims=dict(sub=owner,session_id=SA if owner==A else SB,role='authenticated',aud='authenticated',
        iss='https://privacy.example.test/auth/v1',exp=int(time.time())+3600,iat=int(time.time())-1)
    claims.update(kw);return jwt.encode(claims,KEY,algorithm='HS256')


@pytest.fixture
def setup(tmp_path,monkeypatch):
    monkeypatch.setenv('SUPABASE_JWT_SECRET',KEY);monkeypatch.setenv('SUPABASE_URL','https://privacy.example.test');monkeypatch.setenv('SUPABASE_ANON_KEY','test-public-key');monkeypatch.setenv('ALLOW_LOCAL_UNAUTH','true')
    app=Flask(__name__);app.config['TESTING']=True
    for bp in [privacy_bp,search_bp,trips_bp,settings_bp]:app.register_blueprint(bp,url_prefix='/api')
    path=tmp_path/'legacy.sqlite'
    with sqlite3.connect(path) as db:
        db.executescript('''CREATE TABLE trips(id INTEGER PRIMARY KEY,user_id TEXT,start_lat REAL,start_lon REAL,start_address TEXT,end_lat REAL,end_lon REAL,end_address TEXT,distance_km REAL,duration_minutes REAL,fuel_cost REAL,toll_cost REAL,caz_cost REAL,routing_mode TEXT,timestamp TEXT);
         CREATE TABLE favorite_locations(id INTEGER PRIMARY KEY,user_id TEXT,name TEXT,address TEXT,lat REAL,lon REAL,category TEXT,timestamp TEXT);
         CREATE TABLE search_history(id INTEGER PRIMARY KEY,user_id TEXT,query TEXT,result_name TEXT,lat REAL,lon REAL,timestamp TEXT);''')
        for i,owner in enumerate([A,B],1):
            db.execute("INSERT INTO trips VALUES(?,?,53,-1,?,54,-2,'finish',1,2,3,4,5,'auto','2026-11-14')",(i,owner,'private-'+owner))
            db.execute("INSERT INTO favorite_locations VALUES(?,?,?,'address',53,-1,'place','2026-11-14')",(i,owner,'private-'+owner))
            db.execute("INSERT INTO search_history VALUES(?,?,?,'result',53,-1,'2026-11-14')",(i,owner,'private-'+owner))
    for module in ['voyagr.api.search','voyagr.api.trips']:
        monkeypatch.setattr(module+'.get_db_connection',lambda:sqlite3.connect(path))
        monkeypatch.setattr(module+'.return_db_connection',lambda db:db.close())
    calls=[];revoked=set()
    def authority(url,*,json,headers,timeout,allow_redirects):
        assert allow_redirects is False and timeout==(3,5)
        claims=jwt.decode(headers['Authorization'][7:],KEY,algorithms=['HS256'],audience='authenticated',issuer='https://privacy.example.test/auth/v1');calls.append((url,json,claims['sub']))
        if url.endswith('voyagr_dashcam_session_active'):return Mock(status_code=200,json=lambda:claims['session_id'] not in revoked)
        if url.endswith('voyagr_set_privacy_choice') and json['p_enabled']:return Mock(status_code=403)
        state={'schema':1,'categories':[dict(category=c,policy_version=VERSION,available=False,enabled=False,epoch=0,expires_at=None) for c in CATEGORIES]}
        return Mock(status_code=200,json=lambda:state)
    rpc=Mock(side_effect=authority);monkeypatch.setattr('voyagr.utils.dashcam_auth.requests.post',rpc)
    client=app.test_client();client.environ_base['HTTP_AUTHORIZATION']='Bearer '+token()
    return app,client,path,calls,revoked,rpc


@pytest.mark.parametrize('method,path',[('GET','/trip-history'),('POST','/trip-history'),('DELETE','/trip-history/1'),('GET','/favorites'),('POST','/favorites'),('PUT','/favorites'),('DELETE','/favorites'),('GET','/search-history'),('POST','/search-history'),('DELETE','/search-history'),('GET','/privacy/consent'),('PUT','/privacy/consent')])
def test_private_routes_reject_localhost_admin_and_owner_forgery(setup,method,path):
    app,*_=setup
    response=app.test_client().open('/api'+path,method=method,headers={'X-API-Key':'any','X-Voyagr-Admin-Key':'admin','X-User-ID':A,'X-Forwarded-For':'127.0.0.1'},json={'user_id':A})
    assert response.status_code==401 and response.headers['Cache-Control']=='private, no-store'


@pytest.mark.parametrize('method,path',[('POST','/trip-history'),('POST','/favorites'),('PUT','/favorites'),('POST','/search-history')])
def test_legacy_writes_rejected_before_database_or_body_parse(setup,monkeypatch,method,path,caplog):
    _,client,_,_,_,_=setup
    no_db=Mock(side_effect=AssertionError('private storage opened'))
    monkeypatch.setattr('voyagr.api.search.get_db_connection',no_db);monkeypatch.setattr('voyagr.api.trips.get_db_connection',no_db)
    response=client.open('/api'+path,method=method,data=b'private-origin-53.123456,-1.234567',content_type='application/json')
    assert response.status_code==403 and response.json['code']=='CLOUD_UPLOAD_DISABLED';no_db.assert_not_called()
    assert '53.123456' not in caplog.text and b'53.123456' not in response.data


@pytest.mark.parametrize('path',['/app-settings','/gesture-event','/ml-predictions','/traffic-patterns'])
def test_global_settings_and_diagnostics_cannot_collect_payloads(setup,path):
    _,client,_,_,_,_=setup
    response=client.post('/api'+path,json={'user_id':A,'lat':53,'lon':-1})
    assert response.status_code==403 and response.json['code']=='CLOUD_UPLOAD_DISABLED'
    assert 'no-store' in response.headers['Cache-Control']


@pytest.mark.parametrize('path,key',[('/trip-history','trips'),('/favorites','favorites'),('/search-history','history')])
def test_owner_management_remains_available_without_grant(setup,path,key):
    _,client,db,*_=setup
    response=client.get('/api'+path+'?user_id='+B);assert response.status_code==200
    assert len(response.json[key])==1 and B not in json.dumps(response.json)
    assert 'Authorization' in response.headers['Vary']
    if path=='/trip-history':assert client.delete('/api/trip-history/2').status_code==200
    elif path=='/favorites':assert client.delete('/api/favorites',json={'id':2,'user_id':B}).status_code==200
    else:assert client.delete('/api/search-history?user_id='+B).status_code==200
    with sqlite3.connect(db) as conn:
        table={'/trip-history':'trips','/favorites':'favorite_locations','/search-history':'search_history'}[path]
        assert conn.execute('SELECT count(*) FROM '+table+' WHERE user_id=?',(B,)).fetchone()[0]==1


def test_revoked_or_missing_session_authority_denies_private_access(setup):
    _,client,_,_,revoked,rpc=setup;revoked.add(SA)
    assert client.get('/api/trip-history').status_code==401
    revoked.clear();rpc.side_effect=requests.Timeout('private sensitive authority detail')
    response=client.get('/api/privacy/consent');assert response.status_code==503 and b'sensitive' not in response.data


def test_read_consent_uses_server_state_not_browser_headers(setup):
    _,client,_,calls,*_=setup
    response=client.get('/api/privacy/consent',headers={'X-Privacy-Consent':'true','X-User-ID':B})
    assert response.status_code==200 and all(not x['enabled'] for x in response.json['privacy']['categories'])
    assert calls[-1][1:]==({},A)


@pytest.mark.parametrize('body',[None,[],{'category':[],'enabled':True},{'category':'cloudSync','enabled':'true'},{'category':'cloudSync','enabled':True},{'category':'cloudSync','enabled':False,'user_id':B},{'category':'analytics','enabled':False},{'category':'cloudSync','enabled':False,'expected_epoch':True}])
def test_invalid_forged_or_missing_permission_requests_are_rejected(setup,body):
    _,client,_,calls,*_=setup
    response=client.put('/api/privacy/consent',json=body);assert response.status_code==400
    assert not any(url.endswith('voyagr_set_privacy_choice') for url,*_ in calls)


def test_withdrawal_is_separate_from_upload_and_accepts_stale_client_version(setup):
    _,client,_,calls,*_=setup
    response=client.put('/api/privacy/consent',json={'category':'dashcamBackup','enabled':False,'policy_version':'old','expected_epoch':0})
    assert response.status_code==200
    assert calls[-1][1]==dict(p_category='dashcamBackup',p_enabled=False,p_policy_version='old',p_expected_epoch=0)
    response=client.put('/api/privacy/consent',json={'category':'dashcamBackup','enabled':True,'policy_version':VERSION,'expected_epoch':0})
    assert response.status_code==403


def test_no_client_identity_or_api_admin_can_grant_as_service_role(setup):
    _,client,*_=setup
    response=client.put('/api/privacy/consent',headers={'Authorization':'Bearer '+token(role='service_role')},json={'category':'cloudSync','enabled':True,'policy_version':VERSION,'expected_epoch':0})
    assert response.status_code==401

@pytest.mark.parametrize('upstream',[Mock(status_code=404),Mock(status_code=500),Mock(status_code=200,json=lambda:[]),Mock(status_code=200,json=lambda:{'schema':1,'categories':[{'category':[]}]*4})])
def test_missing_or_malformed_privacy_authority_never_becomes_consent(setup,upstream):
    _,client,_,_,_,rpc=setup
    original=rpc.side_effect
    rpc.side_effect=lambda url,**kw:original(url,**kw) if url.endswith('voyagr_dashcam_session_active') else upstream
    response=client.get('/api/privacy/consent');assert response.status_code==503


def test_public_route_calculation_is_independent_of_private_auth_and_consent(monkeypatch):
    from voyagr_web import app
    no_auth=Mock(side_effect=AssertionError('private authority must not gate navigation'))
    monkeypatch.setattr('voyagr.utils.dashcam_auth.authenticate_dashcam_request',no_auth)
    monkeypatch.setattr('voyagr.api.privacy._rpc',no_auth)
    response=app.test_client().post('/api/route',json={'start':'invalid','end':'invalid'})
    assert response.status_code==400;no_auth.assert_not_called()

@pytest.mark.parametrize('path',['/app-settings','/ml-predictions','/traffic-patterns'])
def test_head_cannot_bypass_admin_or_fall_through_to_retired_writes(setup,monkeypatch,path):
    _,client,*_=setup;monkeypatch.setenv('VOYAGR_ADMIN_SECRET','')
    storage=Mock(side_effect=AssertionError('HEAD must not open unauthorised global storage'))
    monkeypatch.setattr('voyagr.api.settings.db_connection',storage)
    response=client.head('/api'+path,json={'start_lat':53,'start_lon':-1,'map_theme':'dark'})
    assert response.status_code==503;storage.assert_not_called()


def test_head_consent_is_read_only_even_when_a_choice_body_is_supplied(setup):
    _,client,_,calls,*_=setup
    response=client.head('/api/privacy/consent',json={'category':'cloudSync','enabled':False})
    assert response.status_code==200 and calls[-1][0].endswith('voyagr_privacy_state')
    assert not any(url.endswith('voyagr_set_privacy_choice') for url,*_ in calls)


@pytest.mark.parametrize('path',['/trip-history','/favorites','/search-history'])
def test_private_head_reads_do_not_mutate_collections(setup,path):
    _,client,db,*_=setup
    response=client.head('/api'+path,json={'id':1,'name':'forged','query':'forged'})
    assert response.status_code==200 and response.data==b''
    with sqlite3.connect(db) as conn:
        for table in ['trips','favorite_locations','search_history']:
            assert conn.execute('SELECT count(*) FROM '+table).fetchone()[0]==2
