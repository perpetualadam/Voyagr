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


def test_index_includes_soft_auth_banner(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'id="softAuthBanner"' in body
    assert "VOYAGR_DEFER_APP_UNTIL_AUTH" not in body


def test_index_vibevoyager_no_strict_defer(client):
    rv = client.get("/", headers={"Host": "www.vibevoyager.org"})
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "VOYAGR_DEFER_APP_UNTIL_AUTH" not in body
    assert "voyagr-strict-auth-pending" not in body
    assert 'id="softAuthBanner"' in body


def test_index_no_defer_on_localhost(client):
    rv = client.get("/", headers={"Host": "localhost"})
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "VOYAGR_DEFER_APP_UNTIL_AUTH" not in body


def test_get_index_returns_200(client):
    rv = client.get("/")
    assert rv.status_code == 200
    assert b"<!DOCTYPE html>" in rv.data or b"<html" in rv.data.lower()
    cc = (rv.headers.get("Cache-Control") or "").lower()
    assert "no-store" in cc or "no-cache" in cc


def test_index_injects_picovoice_wake_globals(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "window.VoyagrWakeBackendDefault" in body
    assert "window.PICOVOICE_ACCESS_KEY" in body
    assert "window.VoyagrPicovoiceWebAssetsOk" in body
    assert "VoyagrSherpaKwsLab" not in body


def test_picovoice_vendor_assets_served(client):
    """PWA Porcupine wake requires these static files (synced via npm run picovoice:sync)."""
    paths = (
        "/static/vendor/picovoice/porcupine-web.iife.js",
        "/static/vendor/picovoice/web-voice-processor.iife.js",
        "/static/vendor/picovoice/porcupine_params.pv",
        "/static/vendor/picovoice/hey_satnav_wasm.ppn",
    )
    for path in paths:
        rv = client.get(path)
        assert rv.status_code == 200, path
        assert len(rv.data) > 64, path


def test_picovoice_web_assets_ok_requires_access_key(monkeypatch):
    """Assets alone do not enable wake UI; PICOVOICE_ACCESS_KEY is still required."""
    from voyagr.index_page_context import build_index_template_kwargs

    monkeypatch.delenv("PICOVOICE_ACCESS_KEY", raising=False)
    kwargs = build_index_template_kwargs()
    assert kwargs["picovoice_web_assets_ok"] is False

    monkeypatch.setenv("PICOVOICE_ACCESS_KEY", "test-access-key")
    kwargs_with_key = build_index_template_kwargs()
    assert kwargs_with_key["picovoice_web_assets_ok"] is True
    assert kwargs_with_key["picovoice_access_key"] == "test-access-key"


def test_sherpa_lab_page_static(client):
    rv = client.get("/static/sherpa-kws-spike.html")
    assert rv.status_code == 200
    assert b"sherpa-onnx-wasm-kws-main.js" in rv.data


def test_sherpa_keywords_config_static(client):
    rv = client.get("/static/vendor/sherpa-kws/spike-config/keywords-hey-sat-nav.txt")
    assert rv.status_code == 200
    assert len(rv.data) > 0


def test_sherpa_onnx_kws_spike_glue_served(client):
    """KWS PWA load path uses this file (global createKws) — must 200 in prod."""
    rv = client.get("/static/js/sherpa-onnx-kws-spike.js")
    assert rv.status_code == 200
    assert b"createKws" in rv.data
    assert b"globalThis.createKws" in rv.data


def test_manifest_and_service_worker(client):
    assert client.get("/manifest.json").status_code == 200
    sw = client.get("/service-worker.js")
    assert sw.status_code == 200
    assert b"serviceWorker" in sw.data or b"self" in sw.data
    assert b"porcupine-web.iife.js" in sw.data
    assert b"porcupine_params.pv" in sw.data
    assert b"hey_satnav_wasm.ppn" in sw.data


def test_api_config_json(client):
    rv = client.get("/api/config")
    assert rv.status_code == 200
    assert rv.is_json
    assert rv.get_json().get("success") is True


def test_index_has_seo_meta_and_jsonld(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    # Canonical + OG + Twitter: one occurrence each, fed from voyagr.seo.
    assert '<link rel="canonical"' in body
    assert 'property="og:title"' in body
    assert 'property="og:image"' in body
    assert 'property="og:image:alt"' in body
    assert 'name="twitter:card"' in body
    assert 'type="application/ld+json"' in body
    assert "FAQPage" in body
    # Description must be present exactly once (no accidental duplication).
    assert body.count('<meta name="description"') == 1
    assert 'lang="en-GB"' in body


def test_robots_sitemap_llms_routes(client):
    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert b"User-agent: *" in robots.data

    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert b"<urlset" in sitemap.data

    llms = client.get("/llms.txt")
    assert llms.status_code == 200
    # llms.txt must name the app (proves it's the seo.py-rendered body, not a 404 page).
    assert b"Voyagr" in llms.data

    llms_full = client.get("/llms-full.txt")
    assert llms_full.status_code == 200
    assert b"extended LLM context" in llms_full.data
