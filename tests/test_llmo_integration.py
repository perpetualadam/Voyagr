#!/usr/bin/env python3
"""Tests for LLMO integration alongside SEO / GEO / AEO (voyagr.seo single source)."""

import json

import pytest


@pytest.fixture
def client():
    from voyagr_web import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_llms_txt_includes_llmo_file_links(client):
    rv = client.get("/llms.txt")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "LLM context files" in body
    assert "/llms.txt" in body
    assert "/llms-full.txt" in body
    assert "Voyagr Navigation" in body
    assert "United Kingdom" in body
    assert "## Optional" in body


def test_llms_full_txt_has_llmo_sections(client):
    rv = client.get("/llms-full.txt")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "extended LLM context" in body
    assert "## About" in body
    assert "## Primary use cases" in body
    assert "## Citation guidance" in body
    assert "## Preferred sources" in body
    assert "## Frequently asked questions" in body
    # Shared FAQ must match llms.txt (same source arrays).
    assert "What does Voyagr Navigation cost?" in body


def test_index_head_has_llm_alternate_links_once(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert body.count('rel="alternate" type="text/markdown"') == 2
    assert 'href="/llms.txt"' in body or "llms.txt" in body
    assert "llms-full.txt" in body
    # Alternate links sit in head before body content.
    assert body.index('rel="alternate"') < body.index("<body")


def test_index_has_hreflang_and_lang(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'lang="en-GB"' in body
    assert 'hreflang="en-GB"' in body
    assert 'hreflang="x-default"' in body
    assert 'property="og:image:alt"' in body


def test_index_json_ld_graph_types(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'type="application/ld+json"' in body
    start = body.index('type="application/ld+json"')
    script_start = body.index(">", start) + 1
    script_end = body.index("</script>", script_start)
    payload = json.loads(body[script_start:script_end])
    assert payload.get("@context") == "https://schema.org"
    types = {node.get("@type") for node in payload.get("@graph", [])}
    assert "WebSite" in types
    assert "Organization" in types
    assert "WebApplication" in types
    assert "WebPage" in types
    assert "FAQPage" in types


def test_index_has_visible_aeo_faq(client):
    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "voyagr-aeo-faq" in body
    assert "Does Voyagr work offline?" in body
    assert "<noscript>" in body
    assert "voyagr-seo-brand" in body


def test_robots_txt_advertises_llm_context_files(client):
    rv = client.get("/robots.txt")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "llms.txt" in body
    assert "llms-full.txt" in body
    assert "User-agent: GPTBot" in body
    assert "User-agent: OAI-SearchBot" in body
    assert "User-agent: Applebot-Extended" in body
    assert "Sitemap:" in body


def test_sitemap_includes_lastmod(client):
    rv = client.get("/sitemap.xml")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "<lastmod>" in body
    assert "/privacy" in body


def test_privacy_page_has_seo_meta(client):
    rv = client.get("/privacy")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'lang="en-GB"' in body
    assert '<meta name="description"' in body
    assert 'rel="canonical"' in body
    assert 'property="og:title"' in body
    assert 'type="application/ld+json"' in body
    assert "BreadcrumbList" in body or "Privacy Policy" in body


def test_manifest_description_aligned_with_seo(client):
    from voyagr.seo import APP_MANIFEST_DESCRIPTION, APP_NAME, APP_SHORT_NAME

    rv = client.get("/manifest.json")
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["name"] == APP_NAME
    assert data["short_name"] == APP_SHORT_NAME
    assert data["description"] == APP_MANIFEST_DESCRIPTION


def test_site_url_prefers_voyagr_site_url(monkeypatch):
    from voyagr import seo

    monkeypatch.setenv("VOYAGR_SITE_URL", "https://seo.example/")
    monkeypatch.setenv("VOYAGR_PUBLIC_ORIGIN", "https://public.example")
    assert seo.site_url() == "https://seo.example"
    assert seo.canonical_url("/privacy") == "https://seo.example/privacy"


def test_llmo_shared_faq_consistency():
    from voyagr.seo import render_llms_full_txt, render_llms_txt

    summary = render_llms_txt(allow=True)
    full = render_llms_full_txt(allow=True)
    assert "Does Voyagr work offline?" in summary
    assert "Does Voyagr work offline?" in full
    assert summary.count("Progressive Web App") >= 1
    assert full.count("Progressive Web App") >= 1


def test_llmo_opt_out_when_indexing_blocked(client, monkeypatch):
    monkeypatch.setenv("VOYAGR_BLOCK_SEARCH_INDEXING", "1")
    rv = client.get("/llms-full.txt")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "opts out of AI indexing" in body
    assert "## Primary use cases" not in body

    rv_index = client.get("/")
    body_index = rv_index.data.decode("utf-8", errors="replace")
    assert 'rel="alternate" type="text/markdown"' not in body_index
    assert "voyagr-aeo-faq" not in body_index
