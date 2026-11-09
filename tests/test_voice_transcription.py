import json
from unittest.mock import MagicMock

import pytest
from flask import Flask
from voyagr.api import navigation
from voyagr.services import voice_transcription as stt

AUDIO = b'\x1aE\xdf\xa3' + b'fixture'
HEADERS = {'Origin': 'http://localhost', 'X-Voyagr-Voice': '1', 'Content-Type': 'audio/webm;codecs=opus'}


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv('VOYAGR_STT_BASE_URL', 'https://speech.example/v1')
    monkeypatch.setenv('VOYAGR_STT_MODEL', 'chosen-model')
    monkeypatch.setenv('VOYAGR_STT_API_KEY', 'server-only-test-secret')
    monkeypatch.delenv('VOYAGR_PUBLIC_ORIGIN', raising=False)
    for limiter in (navigation._transcription_limiter, navigation._transcription_global_limiter):
        monkeypatch.setattr(limiter, 'is_allowed', lambda _key: True)
    app = Flask(__name__)
    app.register_blueprint(navigation.navigation_bp, url_prefix='/api')
    return app.test_client()


def upstream(monkeypatch, payload=None, status=200):
    response = MagicMock(status_code=status)
    response.__enter__.return_value = response
    response.iter_content.return_value = [json.dumps(payload if payload is not None else {'text': 'find nearest parking'}).encode()]
    post = MagicMock(return_value=response)
    monkeypatch.setattr(stt.requests, 'post', post)
    return post, response


def test_default_is_disabled_without_any_network(configured, monkeypatch):
    monkeypatch.delenv('VOYAGR_STT_MODEL')
    post, _ = upstream(monkeypatch)
    assert configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS).status_code == 503
    post.assert_not_called()


def test_model_independent_proxy_returns_only_text_and_keeps_key_server_side(configured, monkeypatch):
    post, response = upstream(monkeypatch, {'text': 'find nearest parking', 'action': 'start_navigation'})
    result = configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS)
    assert result.json == {'success': True, 'text': 'find nearest parking'}
    args, kwargs = post.call_args
    assert args == ('https://speech.example/v1/audio/transcriptions',)
    assert kwargs['data'] == {'model': 'chosen-model', 'language': 'en', 'response_format': 'json'}
    assert kwargs['headers']['Authorization'] == 'Bearer server-only-test-secret'
    assert kwargs['files']['file'] == ('command.webm', AUDIO, 'audio/webm')
    assert kwargs['allow_redirects'] is False
    assert kwargs['timeout'] == (3, 20)
    response.__exit__.assert_called_once()


@pytest.mark.parametrize('origin,header', [('https://other.example','1'), ('','1'), ('http://localhost','')])
def test_cross_origin_or_non_app_requests_refused(configured, monkeypatch, origin, header):
    post, _ = upstream(monkeypatch)
    assert configured.post('/api/voice/transcribe', data=AUDIO, headers={**HEADERS,'Origin':origin,'X-Voyagr-Voice':header}).status_code == 403
    post.assert_not_called()


@pytest.mark.parametrize('data,mime,status', [(b'', 'audio/webm',400), (b'not audio','audio/webm',400), (AUDIO,'text/plain',415), (AUDIO*100000,'audio/webm',413)])
def test_bounded_audio_validation(configured, monkeypatch, data, mime, status):
    post, _ = upstream(monkeypatch)
    assert configured.post('/api/voice/transcribe', data=data, headers={**HEADERS,'Content-Type':mime}).status_code == status
    post.assert_not_called()


@pytest.mark.parametrize('payload,status', [({'text':'x'*501},200), ({'text':[]},200), ({'error':'secret upstream detail'},401), ({'text':'hi'},302), ([],200)])
def test_upstream_failures_do_not_expose_details(configured, monkeypatch, payload, status):
    upstream(monkeypatch,payload,status)
    result = configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS)
    assert result.status_code == 502
    assert 'secret' not in result.get_data(as_text=True)


def test_oversized_upstream_and_network_failure(configured, monkeypatch):
    post, response = upstream(monkeypatch)
    response.iter_content.return_value = [b'x'*(stt.MAX_RESPONSE_BYTES+1)]
    assert configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS).status_code == 502
    post.side_effect = stt.requests.Timeout('secret upstream URL')
    result = configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS)
    assert result.status_code == 502
    assert 'secret' not in result.get_data(as_text=True)


def test_rate_limit_precedes_upstream(configured, monkeypatch):
    post, _ = upstream(monkeypatch)
    monkeypatch.setattr(navigation._transcription_limiter,'is_allowed',lambda _key:False)
    assert configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS).status_code == 429
    post.assert_not_called()


@pytest.mark.parametrize('url', ['http://speech.example/v1','https://user:secret@example.com/v1','https://example.com/v1?key=secret','file:///tmp/a','https://example.com:invalid/v1'])
def test_invalid_server_configuration(url,monkeypatch):
    monkeypatch.setenv('VOYAGR_STT_BASE_URL',url)
    monkeypatch.setenv('VOYAGR_STT_MODEL','model')
    assert not stt.configured()


def test_self_hosted_loopback_needs_no_api_key(configured,monkeypatch):
    monkeypatch.setenv('VOYAGR_STT_BASE_URL','http://127.0.0.1:9000/v1')
    monkeypatch.delenv('VOYAGR_STT_API_KEY')
    post, _ = upstream(monkeypatch, {'text':''})
    assert configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS).json == {'success':True,'text':''}
    assert 'Authorization' not in post.call_args.kwargs['headers']


def test_busy_worker_never_queues_another_provider_request(configured, monkeypatch):
    post, _ = upstream(monkeypatch)
    slots = MagicMock()
    slots.acquire.return_value = False
    monkeypatch.setattr(navigation, '_transcription_slots', slots)
    assert configured.post('/api/voice/transcribe', data=AUDIO, headers=HEADERS).status_code == 429
    post.assert_not_called()
    slots.release.assert_not_called()
