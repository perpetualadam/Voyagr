#!/usr/bin/env python3
"""
Pytest: PWA index page and Sherpa KWS static assets (no browser).

Fixes regression: core.index must pass full template kwargs (Picovoice + Sherpa).
"""

import pytest


@pytest.fixture
def client():
    from voyagr_web import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_get_index_returns_200(client):
    rv = client.get("/")
    assert rv.status_code == 200
    assert b"<!DOCTYPE html>" in rv.data or b"<html" in rv.data.lower()
    cc = (rv.headers.get("Cache-Control") or "").lower()
    assert "no-store" in cc or "no-cache" in cc


def test_index_injects_wake_and_sherpa_globals(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "window.VoyagrSherpaKwsLab" in body
    assert "window.VoyagrWakeBackendDefault" in body
    assert "window.PICOVOICE_ACCESS_KEY" in body


def test_sherpa_lab_page_static(client):
    rv = client.get("/static/sherpa-kws-spike.html")
    assert rv.status_code == 200
    assert b"sherpa-onnx-wasm-kws-main.js" in rv.data


def test_sherpa_keywords_config_static(client):
    rv = client.get("/static/vendor/sherpa-kws/spike-config/keywords-hey-sat-nav.txt")
    assert rv.status_code == 200
    assert len(rv.data) > 0


def test_manifest_and_service_worker(client):
    assert client.get("/manifest.json").status_code == 200
    sw = client.get("/service-worker.js")
    assert sw.status_code == 200
    assert b"serviceWorker" in sw.data or b"self" in sw.data


def test_api_config_json(client):
    rv = client.get("/api/config")
    assert rv.status_code == 200
    assert rv.is_json
    assert rv.get_json().get("success") is True
