"""
SEO, GEO, and AEO metadata — single source of truth.

This module centralises strings and structured data used in four places:
  * Index HTML <head> tags (Open Graph, Twitter, canonical, JSON-LD)
  * /robots.txt (sitemap reference)
  * /sitemap.xml (URL list)
  * /llms.txt (Generative-Engine-Optimisation context for LLMs)

Why one module: every crawler/scraper pulls the same facts (name,
description, canonical URL, FAQ, feature list). Duplicating them in Jinja
templates and Flask handlers causes drift (Google sees one description,
Bing sees another, LLMs see stale copy). By importing from here, every
surface stays in sync and a rebrand is a one-file edit.

Nothing here is environment-specific except the base URL, which can be
overridden with VOYAGR_SITE_URL (e.g. a staging host).
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

SITE_URL_DEFAULT = "https://vibevoyager.org"

APP_NAME = "Voyagr Navigation"
APP_SHORT_NAME = "Voyagr"
APP_TAGLINE = "Free GPS route planner with live turn-by-turn, trip tracking and dashcam"
APP_DESCRIPTION = (
    "Voyagr is a free navigation web app (PWA) with turn-by-turn directions, "
    "multi-stop route optimisation, speed-camera and hazard alerts, voice control "
    "with hands-free wake word, built-in dashcam, fuel and toll cost estimation, "
    "Clean Air Zone (CAZ) awareness, and trip history analytics. Installs to your "
    "home screen — no app store required."
)
APP_CATEGORY = "NavigationApplication"
APP_LANGUAGE = "en"
APP_KEYWORDS: List[str] = [
    "navigation app",
    "free sat nav",
    "GPS route planner",
    "turn-by-turn directions",
    "multi-stop route optimisation",
    "delivery route planner",
    "speed camera alerts",
    "traffic light camera warnings",
    "voice navigation",
    "wake word sat nav",
    "dashcam PWA",
    "trip tracker",
    "fuel cost estimator",
    "toll cost calculator",
    "clean air zone CAZ",
    "PWA navigation",
    "offline navigation",
]

# AEO (Answer Engine Optimisation): structured Q&A that voice assistants,
# Google's featured-snippet system, and LLMs lift verbatim. Keep answers short
# (1-3 sentences) and fact-dense — that is what wins rich results.
FAQ: List[Dict[str, str]] = [
    {
        "q": "Is Voyagr free to use?",
        "a": (
            "Yes. Voyagr Navigation is free to use in any modern browser, with "
            "turn-by-turn directions, trip tracking, and dashcam included. Voyager "
            "Premium is an optional paid subscription that unlocks advanced features."
        ),
    },
    {
        "q": "Does Voyagr work offline?",
        "a": (
            "Voyagr is a Progressive Web App (PWA). Once installed, the app shell "
            "loads offline and GPS tracking continues without connectivity. Routing "
            "and live map tiles require an internet connection."
        ),
    },
    {
        "q": "Can I use voice control and a wake word in Voyagr?",
        "a": (
            "Yes. Voyagr supports hands-free voice control with a 'Hey Sat Nav' wake "
            "word. Two engines are available: Picovoice (production) and an "
            "experimental Sherpa-ONNX keyword spotter running fully on-device. Voice "
            "requires HTTPS and microphone permission."
        ),
    },
    {
        "q": "How does Voyagr handle my location data?",
        "a": (
            "Location is processed in real time to provide navigation and is not "
            "stored on our servers unless you explicitly save a trip. Preferences "
            "stay in your browser's local storage. See /privacy for full details."
        ),
    },
    {
        "q": "Does Voyagr optimise multi-stop and delivery routes?",
        "a": (
            "Yes. Voyagr can optimise the order of multiple drop-offs, avoid road "
            "closures and accidents, apply Valhalla costing options, and compute "
            "round-trip delivery routes with per-stop dwell time."
        ),
    },
    {
        "q": "Does Voyagr warn about speed cameras and Clean Air Zones?",
        "a": (
            "Yes. Voyagr displays speed-camera, traffic-light-camera, average-speed, "
            "bus-lane and mobile camera alerts, and can route around them. UK Clean "
            "Air Zones (CAZ) are shown with charges, passes, and exemptions."
        ),
    },
    {
        "q": "Can I install Voyagr on my phone without the app store?",
        "a": (
            "Yes. Voyagr is a Progressive Web App and installs to the home screen on "
            "Android, iOS, and desktop browsers directly from the website. An "
            "optional Android Trusted Web Activity build is also available."
        ),
    },
]

FEATURE_LIST: List[str] = [
    "Turn-by-turn voice navigation with lane guidance",
    "Multi-stop and delivery route optimisation",
    "Speed camera and traffic-light camera warnings",
    "UK Clean Air Zone (CAZ) awareness with charges and exemptions",
    "Built-in dashcam recording with GPS metadata",
    "Trip history with analytics, fuel and toll cost breakdown",
    "Hands-free 'Hey Sat Nav' wake word (Picovoice or Sherpa-ONNX)",
    "Offline-capable Progressive Web App install",
    "Google Plus Codes support for destination search",
    "Hazard avoidance: tolls, motorways, ferries, unpaved, traffic lights",
]


def site_url() -> str:
    """Canonical origin (no trailing slash)."""
    return (os.getenv("VOYAGR_SITE_URL") or SITE_URL_DEFAULT).rstrip("/")


def canonical_url(path: str = "/") -> str:
    if not path.startswith("/"):
        path = "/" + path
    return site_url() + path


def seo_title() -> str:
    return f"{APP_NAME} — {APP_TAGLINE}"


def og_image_url() -> str:
    # 512x512 app icon. Square works for summary cards and LLM previews; a wider
    # 1200x630 card can be added later without changing this module's API.
    return canonical_url("/static/images/icons/icon-512.png")


def json_ld_graph() -> List[Dict[str, Any]]:
    """
    Build a single schema.org @graph containing WebSite, Organization,
    WebApplication (with offers + featureList) and FAQPage.

    Emitting one @graph instead of N top-level scripts keeps the HTML smaller
    and lets crawlers resolve @id references between entities.
    """
    root = canonical_url("/")
    logo = canonical_url("/static/images/icons/icon-512.png")
    return [
        {
            "@type": "WebSite",
            "@id": root + "#website",
            "url": root,
            "name": APP_NAME,
            "description": APP_DESCRIPTION,
            "inLanguage": APP_LANGUAGE,
            "publisher": {"@id": root + "#org"},
        },
        {
            "@type": "Organization",
            "@id": root + "#org",
            "name": APP_NAME,
            "url": root,
            "logo": logo,
        },
        {
            "@type": "WebApplication",
            "@id": root + "#app",
            "name": APP_NAME,
            "alternateName": APP_SHORT_NAME,
            "description": APP_DESCRIPTION,
            "url": root,
            "applicationCategory": APP_CATEGORY,
            "operatingSystem": "Any (web browser)",
            "browserRequirements": "Requires a modern browser with JavaScript and HTTPS.",
            "screenshot": logo,
            "image": logo,
            "featureList": FEATURE_LIST,
            "keywords": ", ".join(APP_KEYWORDS),
            "inLanguage": APP_LANGUAGE,
            "isAccessibleForFree": True,
            "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "GBP",
                "availability": "https://schema.org/InStock",
            },
            "publisher": {"@id": root + "#org"},
        },
        {
            "@type": "FAQPage",
            "@id": root + "#faq",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": item["q"],
                    "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
                }
                for item in FAQ
            ],
        },
    ]


def json_ld_document() -> Dict[str, Any]:
    return {"@context": "https://schema.org", "@graph": json_ld_graph()}


def sitemap_urls() -> List[Dict[str, str]]:
    """Routes we want indexed. Keep list short and update when public pages are added."""
    return [
        {"loc": canonical_url("/"), "priority": "1.0", "changefreq": "weekly"},
        {"loc": canonical_url("/privacy"), "priority": "0.3", "changefreq": "yearly"},
    ]


def render_sitemap_xml() -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for entry in sitemap_urls():
        lines.append(
            "  <url>"
            f"<loc>{entry['loc']}</loc>"
            f"<changefreq>{entry['changefreq']}</changefreq>"
            f"<priority>{entry['priority']}</priority>"
            "</url>"
        )
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def render_empty_sitemap_xml() -> str:
    """Used when search indexing is blocked — returns a valid but empty urlset."""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n'
    )


def render_robots_txt(allow: bool) -> str:
    if not allow:
        return "User-agent: *\nDisallow: /\n"
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /monitoring\n"
        "\n"
        f"Sitemap: {canonical_url('/sitemap.xml')}\n"
    )


def render_llms_txt(allow: bool) -> str:
    """
    Render llms.txt following the emerging llmstxt.org convention.

    Goal: give LLM crawlers a clean, linkable markdown summary so generative
    engines (ChatGPT, Perplexity, Gemini Deep Research, Claude) cite us with
    accurate, up-to-date facts instead of hallucinating from stale caches.
    """
    if not allow:
        return (
            f"# {APP_NAME}\n\n"
            "This site currently opts out of AI indexing and public discovery.\n"
        )

    lines: List[str] = [
        f"# {APP_NAME}",
        "",
        f"> {APP_DESCRIPTION}",
        "",
        "## Links",
        "",
        f"- Home: {canonical_url('/')}",
        f"- Privacy policy: {canonical_url('/privacy')}",
        f"- Web app manifest: {canonical_url('/manifest.json')}",
        f"- Sitemap: {canonical_url('/sitemap.xml')}",
        "",
        "## Features",
        "",
    ]
    for feat in FEATURE_LIST:
        lines.append(f"- {feat}")
    lines.extend(["", "## Frequently asked questions", ""])
    for item in FAQ:
        lines.append(f"### {item['q']}")
        lines.append("")
        lines.append(item["a"])
        lines.append("")
    return "\n".join(lines)
