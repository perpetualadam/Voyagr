#!/usr/bin/env python3
"""Tests for Google Analytics 4 head snippet integration."""

import os

import pytest


def test_measurement_id_default():
    from voyagr.ga4 import measurement_id

    old_disabled = os.environ.pop("GOOGLE_ANALYTICS_DISABLED", None)
    old_mid = os.environ.pop("GOOGLE_ANALYTICS_MEASUREMENT_ID", None)
    try:
        assert measurement_id() == "G-8BESWPG747"
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


def test_head_snippet_contains_gtag_loader():
    from voyagr.ga4 import head_snippet

    snippet = head_snippet()
    assert "googletagmanager.com/gtag/js?id=G-8BESWPG747" in snippet
    assert "gtag('config', 'G-8BESWPG747')" in snippet
    assert snippet.count("googletagmanager.com/gtag/js") == 1


@pytest.fixture
def client():
    from voyagr_web import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_index_includes_ga4_once(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "googletagmanager.com/gtag/js?id=G-8BESWPG747" in body
    assert body.count("googletagmanager.com/gtag/js?id=G-8BESWPG747") == 1
    assert "gtag('config', 'G-8BESWPG747')" in body
    # Snippet must appear immediately after <head> (once per page).
    assert body.index("<!-- Google tag (gtag.js) -->") < body.index("<meta charset")


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
    assert body.count("googletagmanager.com/gtag/js?id=G-8BESWPG747") == 1


def test_monitoring_includes_ga4_once(client):
    rv = client.get("/monitoring")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert body.count("googletagmanager.com/gtag/js?id=G-8BESWPG747") == 1


def test_ga4_omitted_when_disabled(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_ANALYTICS_DISABLED", "1")
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "googletagmanager.com/gtag/js" not in body
