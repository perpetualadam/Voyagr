#!/usr/bin/env python3
"""Discovery withdrawal at HTTP boundaries; legacy internal metadata helpers."""

import json

import pytest


@pytest.fixture
def client():
    from voyagr_web import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.mark.parametrize('personal', ['0', '1'])
@pytest.mark.parametrize('legacy_flag', ['', 'false', 'true'])
def test_discovery_stays_disabled_in_every_mode(client, monkeypatch, personal, legacy_flag):
    monkeypatch.setenv('VOYAGR_PERSONAL_MODE', personal)
    monkeypatch.setenv('VOYAGR_BLOCK_SEARCH_INDEXING', legacy_flag)
    assert client.get('/api/config').json['block_search_indexing'] is True
    robots = client.get('/robots.txt')
    assert robots.status_code == 200
    assert robots.text == 'User-agent: *\nDisallow: /\n'
    assert robots.headers['Cache-Control'] == 'no-store'
    sitemap = client.get('/sitemap.xml')
    assert sitemap.status_code == 200 and '<urlset' in sitemap.text
    assert '<loc>' not in sitemap.text and '<lastmod>' not in sitemap.text
    for path in ('/llms.txt', '/llms-full.txt'):
        response = client.get(path)
        assert response.status_code == 410
        assert response.headers['Cache-Control'] == 'no-store'
        assert '##' not in response.text and 'https://' not in response.text
    for path in ('/', '/privacy'):
        response = client.get(path)
        assert response.status_code == 200
        assert 'noindex' in response.headers['X-Robots-Tag']
        for marker in ('rel="canonical"', 'hreflang=', 'property="og:', 'name="twitter:',
                       'application/ld+json', 'llms.txt', 'llms-full.txt', 'voyagr-aeo-faq'):
            assert marker not in response.text
        assert 'name="robots" content="noindex' in response.text
        assert 'name="googlebot" content="noindex' in response.text
    assert 'id="speedWidget"' in client.get('/').text


@pytest.mark.parametrize('path,status', [('/api/config',200),('/service-worker.js',200),
    ('/static/css/voyagr.css',200),('/privacy/',301),('/does-not-exist',404)])
def test_opt_out_header_covers_app_assets_errors_and_redirects(client, path, status):
    response = client.get(path)
    assert response.status_code == status
    assert set(response.headers['X-Robots-Tag'].split(', ')) == {
        'noindex','nofollow','noarchive','nosnippet','noimageindex'}


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
    assert "navigation app" in summary
    assert "navigation app" in full
    assert "Progressive Web App" not in summary
    assert "Progressive Web App" not in full
    assert "PWA" not in summary
    assert "PWA" not in full


def test_legacy_opt_out_flag_cannot_restore_ai_context(client, monkeypatch):
    monkeypatch.setenv('VOYAGR_BLOCK_SEARCH_INDEXING', 'false')
    assert client.get('/llms-full.txt').status_code == 410
    assert '## Citation guidance' not in client.get('/llms-full.txt').text



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


def test_privacy_page_keeps_information_without_search_description(client):
    response=client.get('/privacy')
    assert response.status_code == 200
    assert 'Privacy Policy' in response.text
    assert '<meta name="description"' not in response.text


def test_noscript_is_operational_help_without_marketing_context(client):
    body = client.get('/').text
    assert 'JavaScript is required' in body
    assert 'LLM context' not in body
    assert 'Extended LLM context' not in body



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


def test_social_card_metadata_is_not_published(client):
    for path in ('/', '/privacy'):
        assert 'property="og:image' not in client.get(path).text
