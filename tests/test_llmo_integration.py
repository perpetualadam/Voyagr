#!/usr/bin/env python3
"""Tests for LLMO integration alongside SEO / GEO / AEO (voyagr.seo single source)."""

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


def test_llms_full_txt_has_llmo_sections(client):
    rv = client.get("/llms-full.txt")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "extended LLM context" in body
    assert "## About" in body
    assert "## Primary use cases" in body
    assert "## Citation guidance" in body
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


def test_robots_txt_advertises_llm_context_files(client):
    rv = client.get("/robots.txt")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "llms.txt" in body
    assert "llms-full.txt" in body
    assert "User-agent: GPTBot" in body
    assert "Sitemap:" in body


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
