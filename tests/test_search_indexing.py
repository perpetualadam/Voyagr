#!/usr/bin/env python3
"""Google Search Console: pages must stay eligible to be indexed.

Covers the public HTML surfaces (/ and /privacy) plus crawler handling for
the first-run safety overlay, which otherwise covers the homepage after JS
render because crawlers do not persist localStorage.
"""

import pytest

from voyagr.discoverability import is_search_crawler


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


def test_home_indexable_for_googlebot(client):
    rv = client.get("/", headers={"User-Agent": GOOGLEBOT_UA})
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert 'content="noindex' not in body
    assert 'name="robots" content="index, follow' in body
    assert (rv.headers.get("X-Robots-Tag") or "").lower().find("noindex") < 0
    assert 'rel="canonical"' in body
    assert "window.VOYAGR_IS_SEARCH_CRAWLER = true" in body
    assert "if (window.VOYAGR_IS_SEARCH_CRAWLER)" in body
    assert "voyagr-aeo-faq" in body
    assert "<noscript>" in body


def test_home_still_shows_safety_overlay_for_browsers(client):
    rv = client.get("/", headers={"User-Agent": CHROME_UA})
    assert rv.status_code == 200
    body = rv.data.decode("utf-8", errors="replace")
    assert "window.VOYAGR_IS_SEARCH_CRAWLER = false" in body
    assert "function showSafetyNotice()" in body
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


def test_index_html_redirects_to_home(client):
    rv = client.get("/index.html", follow_redirects=False)
    assert rv.status_code == 301
    location = rv.headers.get("Location", "")
    assert location.endswith("/")
    assert "/index.html" not in location
    dest = client.get("/", follow_redirects=False)
    assert dest.status_code == 200
