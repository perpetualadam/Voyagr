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


def test_index_json_ld_primary_image_has_dimensions(client):
    from voyagr.seo import og_image_dimensions, og_image_url

    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    start = body.index('type="application/ld+json"')
    script_start = body.index(">", start) + 1
    script_end = body.index("</script>", script_start)
    payload = json.loads(body[script_start:script_end])
    webpage = next(
        n
        for n in payload["@graph"]
        if n.get("@type") == "WebPage" and "speakable" in n
    )
    image = webpage["primaryImageOfPage"]
    dims = og_image_dimensions()
    assert image["@type"] == "ImageObject"
    assert image["url"] == og_image_url()
    assert image["width"] == int(dims["width"])
    assert image["height"] == int(dims["height"])
    assert image.get("caption")


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
    assert 'property="og:image:alt"' in body
    assert 'name="twitter:image:alt"' in body
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
    assert "GPS navigation app" in summary
    assert "GPS navigation app" in full
    assert "Progressive Web App" not in summary
    assert "Progressive Web App" not in full
    assert "PWA" not in summary
    assert "PWA" not in full


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


def _write_minimal_png(path, width: int, height: int) -> None:
    """Write a tiny valid RGBA PNG with the given IHDR dimensions."""
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = b"".join(b"\x00" + (b"\x00\x00\x00\xff" * width) for _ in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)


def _write_minimal_lossy_webp(path, width: int, height: int) -> None:
    """Write a minimal lossy (VP8) WebP with the given frame dimensions."""
    import struct

    # Keyframe tag (3 bytes) + start code 0x9d 0x01 0x2a + 14-bit width/height.
    payload = (
        b"\x00\x00\x00"
        + b"\x9d\x01\x2a"
        + struct.pack("<HH", width & 0x3FFF, height & 0x3FFF)
        + b"\x00" * 8
    )
    riff_size = 4 + 8 + len(payload)
    data = (
        b"RIFF"
        + struct.pack("<I", riff_size)
        + b"WEBP"
        + b"VP8 "
        + struct.pack("<I", len(payload))
        + payload
    )
    with open(path, "wb") as fh:
        fh.write(data)


def test_seo_title_fits_serp_length():
    """Home <title>/og:title should stay within common SERP display budget."""
    from voyagr.seo import seo_title

    title = seo_title()
    assert "Voyagr" in title
    assert 30 <= len(title) <= 60


def test_privacy_description_fits_serp_length(client):
    from voyagr.seo import privacy_description

    desc = privacy_description()
    assert 120 <= len(desc) <= 160
    assert "GDPR" in desc

    rv = client.get("/privacy")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert f'content="{desc}"' in body


def test_seo_meta_description_fits_serp_length(client):
    """Home meta/og/twitter description should stay within ~150–160 chars."""
    from voyagr.seo import APP_DESCRIPTION, APP_META_DESCRIPTION

    assert 120 <= len(APP_META_DESCRIPTION) <= 160
    # Longer entity copy remains available for JSON-LD / llms.txt / noscript.
    assert len(APP_DESCRIPTION) > len(APP_META_DESCRIPTION)
    assert "PWA" not in APP_DESCRIPTION
    assert "PWA" not in APP_META_DESCRIPTION

    rv = client.get("/")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert f'content="{APP_META_DESCRIPTION}"' in body
    assert f'<meta name="description" content="{APP_META_DESCRIPTION}">' in body
    # Noscript product blurb keeps the fuller description.
    assert APP_DESCRIPTION in body
    assert "navigation web app (PWA)" not in body
    assert "UK GPS navigation PWA" not in body
    assert "Voyagr base (PWA)" not in body


def test_og_image_dimensions_default_icon(monkeypatch):
    from voyagr.seo import og_image_dimensions

    monkeypatch.delenv("VOYAGR_OG_IMAGE_PATH", raising=False)
    monkeypatch.delenv("VOYAGR_OG_IMAGE_WIDTH", raising=False)
    monkeypatch.delenv("VOYAGR_OG_IMAGE_HEIGHT", raising=False)
    assert og_image_dimensions() == {"width": "512", "height": "512"}


def test_og_image_dimensions_env_override(monkeypatch):
    from voyagr.seo import og_image_dimensions

    monkeypatch.setenv("VOYAGR_OG_IMAGE_PATH", "/static/images/icons/icon-512.png")
    monkeypatch.setenv("VOYAGR_OG_IMAGE_WIDTH", "1200")
    monkeypatch.setenv("VOYAGR_OG_IMAGE_HEIGHT", "630")
    assert og_image_dimensions() == {"width": "1200", "height": "630"}


def test_og_image_dimensions_probes_local_custom_png(monkeypatch, tmp_path):
    """Custom local card must not advertise 512×512 when the file is non-square."""
    from voyagr import seo

    root = tmp_path / "repo"
    card = root / "static" / "images" / "social" / "og-card.png"
    card.parent.mkdir(parents=True)
    _write_minimal_png(str(card), 1200, 630)

    monkeypatch.setattr(seo, "_project_root", lambda: str(root))
    monkeypatch.setenv("VOYAGR_OG_IMAGE_PATH", "/static/images/social/og-card.png")
    monkeypatch.delenv("VOYAGR_OG_IMAGE_WIDTH", raising=False)
    monkeypatch.delenv("VOYAGR_OG_IMAGE_HEIGHT", raising=False)
    assert seo.og_image_dimensions() == {"width": "1200", "height": "630"}


def test_og_image_dimensions_probes_local_custom_lossy_webp(monkeypatch, tmp_path):
    """Lossy VP8 WebP cards must be probed (not fall back to 1200×630)."""
    from voyagr import seo

    root = tmp_path / "repo"
    card = root / "static" / "images" / "social" / "og-card.webp"
    card.parent.mkdir(parents=True)
    # Use dims other than the 1200×630 fallback so a probe miss cannot pass.
    _write_minimal_lossy_webp(str(card), 1280, 720)

    monkeypatch.setattr(seo, "_project_root", lambda: str(root))
    monkeypatch.setenv("VOYAGR_OG_IMAGE_PATH", "/static/images/social/og-card.webp")
    monkeypatch.delenv("VOYAGR_OG_IMAGE_WIDTH", raising=False)
    monkeypatch.delenv("VOYAGR_OG_IMAGE_HEIGHT", raising=False)
    assert seo.og_image_dimensions() == {"width": "1280", "height": "720"}
    assert seo._webp_dimensions(card.read_bytes()) == (1280, 720)


def test_og_image_dimensions_remote_custom_avoids_square_default(monkeypatch):
    from voyagr.seo import og_image_dimensions

    monkeypatch.setenv("VOYAGR_OG_IMAGE_PATH", "https://cdn.example/og-card.png")
    monkeypatch.delenv("VOYAGR_OG_IMAGE_WIDTH", raising=False)
    monkeypatch.delenv("VOYAGR_OG_IMAGE_HEIGHT", raising=False)
    # Unknown remote size: landscape OG fallback, not the 512 app icon.
    assert og_image_dimensions() == {"width": "1200", "height": "630"}


def test_index_and_privacy_advertise_probed_og_dimensions(client, monkeypatch, tmp_path):
    from voyagr import seo

    root = tmp_path / "repo"
    card = root / "static" / "images" / "social" / "og-card.png"
    card.parent.mkdir(parents=True)
    _write_minimal_png(str(card), 1200, 630)

    monkeypatch.setattr(seo, "_project_root", lambda: str(root))
    monkeypatch.setenv("VOYAGR_OG_IMAGE_PATH", "/static/images/social/og-card.png")
    monkeypatch.delenv("VOYAGR_OG_IMAGE_WIDTH", raising=False)
    monkeypatch.delenv("VOYAGR_OG_IMAGE_HEIGHT", raising=False)

    for path in ("/", "/privacy"):
        rv = client.get(path)
        assert rv.status_code == 200
        body = rv.data.decode("utf-8", errors="replace")
        assert 'property="og:image:width" content="1200"' in body
        assert 'property="og:image:height" content="630"' in body
        assert 'property="og:image:width" content="512"' not in body
