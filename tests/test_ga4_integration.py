#!/usr/bin/env python3
"""Tests for Google Analytics 4 head snippet integration."""

import os

import pytest


def test_measurement_id_default():
    from voyagr.ga4 import measurement_id

    old_disabled = os.environ.pop("GOOGLE_ANALYTICS_DISABLED", None)
    old_mid = os.environ.pop("GOOGLE_ANALYTICS_MEASUREMENT_ID", None)
    try:
        assert measurement_id() == ""
    finally:
        if old_disabled is not None:
            os.environ["GOOGLE_ANALYTICS_DISABLED"] = old_disabled
        if old_mid is not None:
            os.environ["GOOGLE_ANALYTICS_MEASUREMENT_ID"] = old_mid


def test_measurement_id_disabled():
    from voyagr.ga4 import measurement_id

    old = os.environ.get("GOOGLE_ANALYTICS_DISABLED")
    os.environ["GOOGLE_ANALYTICS_DISABLED"] = "1"
    try:
        assert measurement_id() == ""
    finally:
        if old is None:
            os.environ.pop("GOOGLE_ANALYTICS_DISABLED", None)
        else:
            os.environ["GOOGLE_ANALYTICS_DISABLED"] = old


def test_head_snippet_loads_only_local_consent_controller(monkeypatch):
    monkeypatch.setenv("GOOGLE_ANALYTICS_MEASUREMENT_ID", "G-8BESWPG747")
    from voyagr.ga4 import head_snippet

    snippet = head_snippet()
    assert '/static/js/app/analytics-consent.js' in snippet
    assert 'data-voyagr-analytics="G-8BESWPG747"' in snippet
    assert 'googletagmanager.com' not in snippet
    assert 'gtag(' not in snippet


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("GOOGLE_ANALYTICS_MEASUREMENT_ID", "G-8BESWPG747")
    monkeypatch.delenv("GOOGLE_ANALYTICS_DISABLED", raising=False)
    from voyagr_web import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_index_includes_ga4_once(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert body.count('data-voyagr-analytics="G-8BESWPG747"') == 1
    assert 'src="https://www.googletagmanager.com/' not in body
    assert body.index('data-voyagr-analytics=') < body.index('<meta charset')


def test_security_config_csp_allows_googletagmanager():
    """When SecurityConfig is used, gtag.js must be allowed (production/nginx may differ)."""
    from flask import Flask
    from security_config import SecurityConfig

    app = Flask(__name__)

    @app.route("/")
    def _ping():
        return "ok"

    SecurityConfig(app)
    with app.test_client() as c:
        rv = c.get("/")
        csp = rv.headers.get("Content-Security-Policy") or ""
        assert "https://www.googletagmanager.com" in csp


def test_privacy_includes_ga4_once(client):
    rv = client.get("/privacy")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert body.count('data-voyagr-analytics="G-8BESWPG747"') == 1
    assert 'src="https://www.googletagmanager.com/' not in body


def test_monitoring_has_no_optional_analytics(client, monkeypatch):
    monkeypatch.setenv('VOYAGR_ADMIN_SECRET', 'test-admin-key')
    rv = client.get('/monitoring', headers={'X-Voyagr-Admin-Key': 'test-admin-key'})
    assert rv.status_code == 200
    body = rv.get_data(as_text=True)
    assert 'data-voyagr-analytics=' not in body
    assert 'googletagmanager.com' not in body


def test_ga4_omitted_when_disabled(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_ANALYTICS_DISABLED", "1")
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'data-voyagr-analytics=' not in body


def test_privacy_discloses_voice_and_separate_analytics_choice(client):
    body = client.get('/privacy').get_data(as_text=True)
    assert 'id="analyticsAllow"' in body and 'id="analyticsDecline"' in body
    assert 'Browser speech recognition may send audio' in body
    assert 'recording of up to 15 seconds' in body
    assert 'does not make analytics anonymous' in body
    assert 'Capture starts only after you explicitly start a dashcam' not in body


def test_disabled_analytics_has_no_misleading_controls(client, monkeypatch):
    monkeypatch.setenv('GOOGLE_ANALYTICS_DISABLED', '1')
    body = client.get('/privacy').get_data(as_text=True)
    assert 'id="analyticsAllow"' not in body
    assert 'Optional analytics is disabled on this deployment' in body


def test_privacy_contact_is_configured_escaped_and_not_invented(client, monkeypatch):
    monkeypatch.setenv('VOYAGR_PRIVACY_OPERATOR_NAME', '<Operator & Co>')
    monkeypatch.setenv('VOYAGR_PRIVACY_CONTACT_EMAIL', 'privacy@example.test')
    body = client.get('/privacy').get_data(as_text=True)
    assert '&lt;Operator &amp; Co&gt;' in body
    assert 'mailto:privacy@example.test' in body
    monkeypatch.setenv('VOYAGR_PRIVACY_CONTACT_EMAIL', 'javascript:alert(1)')
    body = client.get('/privacy').get_data(as_text=True)
    assert 'mailto:javascript:' not in body
    assert 'public privacy-contact email has not been configured' in body


def test_policy_does_not_promise_unverified_automatic_deletion(client):
    body = client.get('/privacy').get_data(as_text=True)
    assert 'freshness checks do not guarantee' in body
    assert 'New temporary route-cache entries use private server' in body
    assert 'Older database cache records' in body
    assert 'short-lived cookie' in body
    assert 'Community reports' in body
    assert 'not stored on our\n    servers unless' not in body
    assert 'email address provided in the app' not in body


def test_default_contact_uses_only_public_alias_and_does_not_invent_identity(client, monkeypatch):
    monkeypatch.delenv('VOYAGR_PRIVACY_CONTACT_EMAIL', raising=False)
    monkeypatch.delenv('VOYAGR_PRIVACY_OPERATOR_NAME', raising=False)
    body = client.get('/privacy').get_data(as_text=True)
    assert 'mailto:info@vibevoyager.org' in body
    assert 'public legal identity has not been' in body
    assert '@gmail.com' not in body
    assert '@googlemail.com' not in body


def test_explicit_empty_contact_does_not_silently_advertise_an_alias(client, monkeypatch):
    monkeypatch.setenv('VOYAGR_PRIVACY_CONTACT_EMAIL', '')
    body = client.get('/privacy').get_data(as_text=True)
    assert 'mailto:info@vibevoyager.org' not in body
    assert 'public privacy-contact email has not been configured' in body
