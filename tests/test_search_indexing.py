#!/usr/bin/env python3
"""Google Search Console: pages must stay eligible to be indexed.

Covers the public HTML surfaces (/ and /privacy) plus crawler handling for
the first-run safety overlay, which otherwise covers the homepage after JS
render because crawlers do not persist localStorage.
"""

import json

import pytest

from voyagr.discoverability import (
    SEARCH_CRAWLER_UA_TOKENS,
    SEARCH_CRAWLER_UA_WORD_TOKENS,
    is_search_crawler,
)


GOOGLEBOT_UA = (
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
)
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


@pytest.fixture
def client():
    from voyagr_web import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.mark.parametrize(
    "ua,expected",
    [
        (GOOGLEBOT_UA, True),
        (
            "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.94 "
            "Mobile Safari/537.36 (compatible; Googlebot/2.1; "
            "+http://www.google.com/bot.html)",
            True,
        ),
        ("Mozilla/5.0 (compatible; Google-InspectionTool/1.0)", True),
        ("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", True),
        ("Mozilla/5.0 (compatible; Baiduspider/2.0)", True),
        ("Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)", True),
        (CHROME_UA, False),
        ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", False),
        ("", False),
    ],
)
def test_is_search_crawler_user_agents(ua, expected):
    assert is_search_crawler(ua) is expected


def test_is_search_crawler_does_not_match_chrome_google_token():
    """Chrome UAs mention Google's company, not Googlebot."""
    assert is_search_crawler(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
    ) is False


def test_is_search_crawler_slurp_requires_word_boundary():
    assert is_search_crawler("Mozilla/5.0 slurpee-browser/1.0") is False
    assert is_search_crawler("Mozilla/5.0 (compatible; Yahoo! Slurp)") is True


def test_is_search_crawler_does_not_match_similar_product_names():
    assert is_search_crawler("Mozilla/5.0 DuckDuckGo/7") is False
    assert is_search_crawler("Mozilla/5.0 YaBrowser/24.1.0.0") is False
    assert is_search_crawler("Mozilla/5.0 AppleWebKit/605.1.15") is False
    assert is_search_crawler("Mozilla/5.0 (compatible; YandexBot/3.0)") is True


def test_home_indexable_for_googlebot(client):
    rv = client.get("/", headers={"User-Agent": GOOGLEBOT_UA})
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'content="noindex' not in body
    assert 'name="robots" content="index, follow' in body
    assert (rv.headers.get("X-Robots-Tag") or "").lower().find("noindex") < 0
    assert 'rel="canonical"' in body
    assert "window.VOYAGR_IS_SEARCH_CRAWLER =" not in body
    assert "VOYAGR_SEARCH_CRAWLER_UA_RE" not in body
    assert "function voyagrUaIsSearchCrawler()" in body
    assert "navigator.userAgent" in body
    assert json.dumps(list(SEARCH_CRAWLER_UA_TOKENS)) in body
    assert json.dumps(sorted(SEARCH_CRAWLER_UA_WORD_TOKENS)) in body
    assert "voyagr-aeo-faq" in body
    assert "<noscript>" in body


def test_home_html_does_not_vary_crawler_flag_by_user_agent(client):
    """Baked-in UA flags can skip the legal overlay when the SW caches /."""
    bot = client.get("/", headers={"User-Agent": GOOGLEBOT_UA})
    browser = client.get("/", headers={"User-Agent": CHROME_UA})
    assert bot.status_code == 200
    assert browser.status_code == 200
    bot_body = bot.data.decode("utf-8", errors="replace")
    browser_body = browser.data.decode("utf-8", errors="replace")
    assert "VOYAGR_SEARCH_CRAWLER_UA_TOKENS" in bot_body
    assert "VOYAGR_SEARCH_CRAWLER_UA_TOKENS" in browser_body
    assert json.dumps(list(SEARCH_CRAWLER_UA_TOKENS)) in bot_body
    assert json.dumps(list(SEARCH_CRAWLER_UA_TOKENS)) in browser_body
    assert "\\bslurp\\b" not in bot_body
    crawler_boot = bot_body[bot_body.find("VOYAGR_SEARCH_CRAWLER_UA_TOKENS"):bot_body.find("voyagrAcceptSafetyNotice")]
    assert "new RegExp" not in crawler_boot
    assert "window.VOYAGR_IS_SEARCH_CRAWLER = true" not in bot_body
    assert "window.VOYAGR_IS_SEARCH_CRAWLER = false" not in browser_body


def test_home_still_shows_safety_overlay_for_browsers(client):
    rv = client.get("/", headers={"User-Agent": CHROME_UA})
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "function showSafetyNotice()" in body
    assert "function voyagrUaIsSearchCrawler()" in body
    assert 'id="safetyNoticeOverlay"' in body
    assert 'name="robots" content="index, follow' in body


def test_privacy_indexable(client):
    rv = client.get("/privacy", headers={"User-Agent": GOOGLEBOT_UA})
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'content="noindex' not in body
    assert 'name="robots" content="index, follow' in body
    assert 'rel="canonical"' in body
    assert (rv.headers.get("X-Robots-Tag") or "").lower().find("noindex") < 0


def test_robots_allows_public_pages_and_lists_sitemap(client):
    rv = client.get("/robots.txt")
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "User-agent: *" in body
    assert "Disallow: /\n" not in body
    assert "Sitemap:" in body
    assert "/privacy" in client.get("/sitemap.xml").data.decode("utf-8", errors="replace")


def _charset_count(content_type: str) -> int:
    return content_type.lower().count("charset=")


@pytest.mark.parametrize(
    "path,mime_prefix",
    (
        ("/robots.txt", "text/plain"),
        ("/llms.txt", "text/plain"),
        ("/llms-full.txt", "text/plain"),
        ("/sitemap.xml", "application/xml"),
    ),
)
def test_discoverability_text_content_type_has_one_charset(client, path, mime_prefix):
    rv = client.get(path)
    assert rv.status_code == 200
    ct = rv.headers.get("Content-Type") or ""
    assert ct.lower().startswith(mime_prefix)
    assert _charset_count(ct) == 1


def test_sitemap_urls_are_live_html(client):
    sm = client.get("/sitemap.xml")
    assert sm.status_code == 200
    body = sm.data.decode("utf-8", errors="replace")
    assert "<loc>" in body
    for path in ("/", "/privacy"):
        rv = client.get(path)
        assert rv.status_code == 200, path
        assert b"<html" in rv.data.lower()
        assert b"noindex" not in rv.data


def test_privacy_trailing_slash_redirects_to_canonical(client):
    rv = client.get("/privacy/", follow_redirects=False)
    assert rv.status_code == 301
    assert rv.headers.get("Location", "").endswith("/privacy")
    # Canonical page remains 200 HTML (not a redirect loop).
    dest = client.get("/privacy", follow_redirects=False)
    assert dest.status_code == 200
    assert b"<html" in dest.data.lower()


@pytest.mark.parametrize(
    "path",
    ("/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"),
)
def test_apple_touch_icon_probes_redirect(client, path):
    rv = client.get(path, follow_redirects=False)
    assert rv.status_code == 301
    location = rv.headers.get("Location", "")
    assert location.endswith("/static/images/icons/icon-192.png")
    dest = client.get("/static/images/icons/icon-192.png")
    assert dest.status_code == 200
    assert dest.data[:8] == b"\x89PNG\r\n\x1a\n"


def test_favicon_ico_permanent_redirect(client):
    rv = client.get("/favicon.ico", follow_redirects=False)
    assert rv.status_code == 301
    location = rv.headers.get("Location", "")
    assert location.endswith("/static/images/icons/icon.svg")
    dest = client.get("/static/images/icons/icon.svg")
    assert dest.status_code == 200
    assert dest.data.startswith(b"<svg") or dest.data.startswith(b"<?xml")


def test_nginx_http_www_is_single_hop_to_apex():
    """http://www must not hop via https://www (GSC: Page with redirect / Redirect error)."""
    from pathlib import Path

    conf = (Path(__file__).resolve().parents[1] / "deploy" / "nginx-vibevoyager.org.conf").read_text(
        encoding="utf-8"
    )
    http_idx = conf.index("# --- HTTP")
    https_www_idx = conf.index("# --- HTTPS www")
    http_block = conf[http_idx:https_www_idx]
    assert "listen 80" in http_block
    assert "www.vibevoyager.org" in http_block
    assert "https://vibevoyager.org$request_uri" in http_block
    assert "https://$host$request_uri" not in http_block
    https_www_block = conf[https_www_idx : conf.index("# --- HTTPS (app")]
    assert "return 301 https://vibevoyager.org$request_uri;" in https_www_block


def test_index_html_redirects_to_home(client):
    rv = client.get("/index.html", follow_redirects=False)
    assert rv.status_code == 301
    location = rv.headers.get("Location", "")
    assert location.endswith("/")
    assert "/index.html" not in location
    dest = client.get("/", follow_redirects=False)
    assert dest.status_code == 200
