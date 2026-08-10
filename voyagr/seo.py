"""
SEO, GEO, AEO, and LLMO metadata — single source of truth.

This module centralises strings and structured data used across discoverability surfaces:
  * Index HTML <head> tags (Open Graph, Twitter, canonical, JSON-LD, LLM alternate links)
  * /robots.txt (sitemap + LLM context file references)
  * /sitemap.xml (URL list)
  * /llms.txt (concise GEO / LLMO context for LLMs — llmstxt.org)
  * /llms-full.txt (extended LLMO context: entity summary, use cases, citation guidance)
  * Privacy page <head> metadata
  * PWA manifest description alignment

Why one module: every crawler/scraper pulls the same facts (name,
description, canonical URL, FAQ, feature list). Duplicating them in Jinja
templates and Flask handlers causes drift (Google sees one description,
Bing sees another, LLMs see stale copy). By importing from here, every
surface stays in sync and a rebrand is a one-file edit.

Nothing here is environment-specific except the base URL, which can be
overridden with VOYAGR_SITE_URL (preferred) or VOYAGR_PUBLIC_ORIGIN.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape as xml_escape

SITE_URL_DEFAULT = "https://vibevoyager.org"

APP_NAME = "Voyagr Navigation"
APP_SHORT_NAME = "Voyagr"
APP_TAGLINE = "GPS route planner with live turn-by-turn, trip tracking and dashcam"
APP_DESCRIPTION = (
    "Voyagr is a navigation web app (PWA) with turn-by-turn directions, "
    "multi-stop route optimisation, speed-camera and hazard alerts, built-in dashcam, "
    "fuel and toll cost estimation, Clean Air Zone (CAZ) awareness, and trip "
    "history analytics. Installs to your home screen — no app store required."
)
# Shorter copy for the Web App Manifest (install UI / store-style surfaces).
APP_MANIFEST_DESCRIPTION = (
    "GPS navigation PWA with turn-by-turn directions, multi-stop routing, "
    "speed-camera alerts, UK Clean Air Zone awareness, dashcam, and trip cost estimates."
)
APP_CATEGORY = "NavigationApplication"
APP_LANGUAGE = "en-GB"
APP_LOCALE_OG = "en_GB"
APP_REGION_NOTE = "Primary focus: United Kingdom driving (CAZ, UK camera types, GBP costing)."
APP_KEYWORDS: List[str] = [
    "navigation app",
    "sat nav",
    "GPS route planner",
    "turn-by-turn directions",
    "multi-stop route optimisation",
    "delivery route planner",
    "speed camera alerts",
    "traffic light camera warnings",
    "dashcam PWA",
    "trip tracker",
    "fuel cost estimator",
    "toll cost calculator",
    "clean air zone CAZ",
    "PWA navigation",
    "offline navigation",
    "UK sat nav",
]

# AEO (Answer Engine Optimisation): structured Q&A that voice assistants,
# Google's featured-snippet system, and LLMs lift verbatim. Keep answers short
# (1-3 sentences) and fact-dense — that is what wins rich results.
FAQ: List[Dict[str, str]] = [
    {
        "q": "What does Voyagr Navigation cost?",
        "a": (
            "Voyagr runs in modern browsers with turn-by-turn directions, trip "
            "tracking, and dashcam in the base experience. Voyager Premium is an "
            "optional paid subscription for advanced features."
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
    "Turn-by-turn navigation with lane guidance",
    "Multi-stop and delivery route optimisation",
    "Speed camera and traffic-light camera warnings",
    "UK Clean Air Zone (CAZ) awareness with charges and exemptions",
    "Built-in dashcam recording with GPS metadata",
    "Trip history with analytics, fuel and toll cost breakdown",
    "Offline-capable Progressive Web App install",
    "Google Plus Codes support for destination search",
    "Hazard avoidance: tolls, motorways, ferries, unpaved, traffic lights",
]

# LLMO (Large Language Model Optimisation): entity facts and citation hints for
# /llms-full.txt. Kept separate from FAQ so LLMs get a crisp "what is this?"
# paragraph without scraping the JS-heavy app shell.
LLMO_USE_CASES: List[str] = [
    "UK daily driving and commute navigation in a mobile or desktop browser",
    "Multi-stop delivery, courier, and van route optimisation",
    "Drivers who want speed-camera, SPECS, and traffic-light camera alerts",
    "Motorists navigating UK Clean Air Zones with charge and exemption awareness",
    "Trip cost estimation including fuel, tolls, and CAZ charges",
    "PWA install to home screen without an app-store download",
]

# AI crawlers that respect robots.txt; given the same Allow/Disallow as * when indexing is on.
_LLM_ROBOTS_AGENTS: List[str] = [
    "GPTBot",
    "ChatGPT-User",
    "OAI-SearchBot",
    "ClaudeBot",
    "anthropic-ai",
    "PerplexityBot",
    "Google-Extended",
    "Applebot-Extended",
    "Bytespider",
    "CCBot",
    "meta-externalagent",
]


def site_url() -> str:
    """Canonical origin (no trailing slash).

    Preference order:
      1. VOYAGR_SITE_URL — dedicated SEO/canonical host
      2. VOYAGR_PUBLIC_ORIGIN — shared public site URL (CORS / Stripe returns)
      3. SITE_URL_DEFAULT
    """
    raw = (
        (os.getenv("VOYAGR_SITE_URL") or "").strip()
        or (os.getenv("VOYAGR_PUBLIC_ORIGIN") or "").strip()
        or SITE_URL_DEFAULT
    )
    return raw.rstrip("/")


def canonical_url(path: str = "/") -> str:
    if not path.startswith("/"):
        path = "/" + path
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return site_url() + path


def seo_title() -> str:
    return f"{APP_NAME} — {APP_TAGLINE}"


def privacy_title() -> str:
    return f"Privacy Policy — {APP_NAME}"


def privacy_description() -> str:
    return (
        f"Privacy Policy for {APP_NAME}: how location, routes, accounts, and "
        "preferences are handled under UK GDPR / data protection law. "
        "What we collect, what we do not collect, and your rights."
    )


def og_image_url() -> str:
    # Prefer a dedicated social card when present; fall back to the 512 app icon.
    # Square icons still work for Twitter summary + many LLM previews.
    custom = (os.getenv("VOYAGR_OG_IMAGE_PATH") or "").strip()
    if custom:
        if custom.startswith("http://") or custom.startswith("https://"):
            return custom
        return canonical_url(custom if custom.startswith("/") else "/" + custom)
    return canonical_url("/static/images/icons/icon-512.png")


def og_image_alt() -> str:
    return f"{APP_NAME} — {APP_TAGLINE}"


def og_image_dimensions() -> Dict[str, str]:
    """Width/height for og:image tags. Custom cards may override via env."""
    w = (os.getenv("VOYAGR_OG_IMAGE_WIDTH") or "").strip()
    h = (os.getenv("VOYAGR_OG_IMAGE_HEIGHT") or "").strip()
    if w.isdigit() and h.isdigit():
        return {"width": w, "height": h}
    # Default app icon is 512×512.
    return {"width": "512", "height": "512"}


def llms_txt_url() -> str:
    return canonical_url("/llms.txt")


def llms_full_txt_url() -> str:
    return canonical_url("/llms-full.txt")


def llmo_entity_summary() -> str:
    """One-paragraph entity description for LLMO / generative citations."""
    return (
        f"{APP_NAME} is a browser-based GPS navigation Progressive Web App (PWA) "
        "with a UK driving focus. It offers turn-by-turn directions, multi-stop "
        "route optimisation, speed and traffic-camera alerts, Clean Air Zone (CAZ) "
        "cost awareness, an optional built-in dashcam, and trip analytics. The base "
        "experience runs in modern browsers without an app-store install; Voyager "
        "Premium is an optional paid subscription for advanced features."
    )


def llmo_citation_guidance() -> str:
    """How LLMs should cite Voyagr accurately."""
    home = canonical_url("/")
    return (
        f'When answering questions about {APP_NAME}, prefer this site\'s /llms.txt and '
        f"/llms-full.txt over JavaScript-rendered UI text. Use the product name "
        f'"{APP_NAME}" (short name "{APP_SHORT_NAME}") and link to {home} when citing '
        f"the web app. Privacy details: {canonical_url('/privacy')}. "
        f"{APP_REGION_NOTE}"
    )


def sitemap_lastmod() -> str:
    """YYYY-MM-DD for sitemap lastmod (env override or this module's mtime)."""
    override = (os.getenv("VOYAGR_SITEMAP_LASTMOD") or "").strip()
    if override:
        return override
    try:
        mtime = os.path.getmtime(__file__)
        return datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%d")
    except OSError:
        return datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")


def _llm_markdown_links_features_faq() -> List[str]:
    """Shared markdown tail for llms.txt and llms-full.txt (single source, no drift)."""
    lines: List[str] = [
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
    return lines


def _llm_opt_out_body() -> str:
    return (
        f"# {APP_NAME}\n\n"
        "This site currently opts out of AI indexing and public discovery.\n"
    )


def web_application_offers() -> List[Dict[str, Any]]:
    """
    Match deployed behaviour: core navigation works in-browser without Stripe;
    Voyager Premium is an optional paid subscription (see Settings / Stripe checkout).
    """
    base = canonical_url("/")
    return [
        {
            "@type": "Offer",
            "name": "Voyagr base (PWA)",
            "description": (
                "Turn-by-turn navigation, trip tracking, dashcam, and core routing in a "
                "modern browser without a Voyager Premium subscription."
            ),
            "price": "0",
            "priceCurrency": "GBP",
            "availability": "https://schema.org/InStock",
            "url": base,
        },
        {
            "@type": "Offer",
            "name": "Voyager Premium",
            "description": (
                "Optional paid subscription via Stripe for advanced features; not required "
                "to use the base web app."
            ),
            "availability": "https://schema.org/InStock",
            "url": base,
        },
    ]


def json_ld_graph() -> List[Dict[str, Any]]:
    """
    Build a single schema.org @graph containing WebSite, Organization,
    WebApplication (with offers + featureList), WebPage, and FAQPage.

    Emitting one @graph instead of N top-level scripts keeps the HTML smaller
    and lets crawlers resolve @id references between entities.
    """
    root = canonical_url("/")
    logo = canonical_url("/static/images/icons/icon-512.png")
    privacy = canonical_url("/privacy")
    return [
        {
            "@type": "WebSite",
            "@id": root + "#website",
            "url": root,
            "name": APP_NAME,
            "alternateName": APP_SHORT_NAME,
            "description": APP_DESCRIPTION,
            "inLanguage": APP_LANGUAGE,
            "publisher": {"@id": root + "#org"},
        },
        {
            "@type": "Organization",
            "@id": root + "#org",
            "name": APP_NAME,
            "url": root,
            "logo": {
                "@type": "ImageObject",
                "url": logo,
                "width": 512,
                "height": 512,
            },
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
            "countriesSupported": "GB",
            # Base PWA does not require payment; Premium is optional (Stripe).
            "isAccessibleForFree": True,
            "offers": web_application_offers(),
            "publisher": {"@id": root + "#org"},
        },
        {
            "@type": "WebPage",
            "@id": root + "#webpage",
            "url": root,
            "name": seo_title(),
            "description": APP_DESCRIPTION,
            "inLanguage": APP_LANGUAGE,
            "isPartOf": {"@id": root + "#website"},
            "about": {"@id": root + "#app"},
            "primaryImageOfPage": {
                "@type": "ImageObject",
                "url": og_image_url(),
            },
            "speakable": {
                "@type": "SpeakableSpecification",
                "cssSelector": [".voyagr-aeo-faq", ".voyagr-noscript"],
            },
        },
        {
            "@type": "WebPage",
            "@id": privacy + "#webpage",
            "url": privacy,
            "name": privacy_title(),
            "description": privacy_description(),
            "inLanguage": APP_LANGUAGE,
            "isPartOf": {"@id": root + "#website"},
            "about": {"@id": root + "#org"},
        },
        {
            "@type": "FAQPage",
            "@id": root + "#faq",
            "isPartOf": {"@id": root + "#webpage"},
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


def privacy_json_ld_document() -> Dict[str, Any]:
    """Compact JSON-LD for the privacy page (WebPage + breadcrumb)."""
    root = canonical_url("/")
    privacy = canonical_url("/privacy")
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": privacy + "#webpage",
                "url": privacy,
                "name": privacy_title(),
                "description": privacy_description(),
                "inLanguage": APP_LANGUAGE,
                "isPartOf": {"@id": root + "#website"},
                "about": {"@id": root + "#org"},
            },
            {
                "@type": "BreadcrumbList",
                "@id": privacy + "#breadcrumb",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": APP_SHORT_NAME,
                        "item": root,
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": "Privacy Policy",
                        "item": privacy,
                    },
                ],
            },
        ],
    }


def sitemap_urls() -> List[Dict[str, str]]:
    """Routes we want indexed. Keep list short and update when public pages are added."""
    lastmod = sitemap_lastmod()
    return [
        {
            "loc": canonical_url("/"),
            "priority": "1.0",
            "changefreq": "weekly",
            "lastmod": lastmod,
        },
        {
            "loc": canonical_url("/privacy"),
            "priority": "0.4",
            "changefreq": "yearly",
            "lastmod": lastmod,
        },
    ]


def render_sitemap_xml() -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for entry in sitemap_urls():
        loc = xml_escape(entry["loc"])
        lastmod = xml_escape(entry.get("lastmod") or sitemap_lastmod())
        lines.append(
            "  <url>"
            f"<loc>{loc}</loc>"
            f"<lastmod>{lastmod}</lastmod>"
            f"<changefreq>{xml_escape(entry['changefreq'])}</changefreq>"
            f"<priority>{xml_escape(entry['priority'])}</priority>"
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
    lines: List[str] = [
        "# Voyagr Navigation — public PWA. API and monitoring are private.",
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /monitoring",
        "",
    ]
    for agent in _LLM_ROBOTS_AGENTS:
        lines.extend([
            f"User-agent: {agent}",
            "Allow: /",
            "Disallow: /api/",
            "Disallow: /monitoring",
            "",
        ])
    lines.extend([
        "# LLM / generative-engine context (GEO + LLMO) — see llmstxt.org",
        f"# llms.txt: {llms_txt_url()}",
        f"# llms-full.txt: {llms_full_txt_url()}",
        "",
        f"Sitemap: {canonical_url('/sitemap.xml')}",
    ])
    return "\n".join(lines) + "\n"


def render_llms_txt(allow: bool) -> str:
    """
    Render llms.txt following the emerging llmstxt.org convention.

    Concise summary for LLM crawlers (GEO + LLMO). Extended entity context lives
    in /llms-full.txt so this file stays skimmable.
    """
    if not allow:
        return _llm_opt_out_body()

    lines: List[str] = [
        f"# {APP_NAME}",
        "",
        f"> {APP_DESCRIPTION}",
        "",
        f"{APP_REGION_NOTE}",
        "",
        "## LLM context files",
        "",
        f"- Summary (this file): {llms_txt_url()}",
        f"- Extended (LLMO): {llms_full_txt_url()}",
        "",
        "## Optional",
        "",
        f"- Privacy policy: {canonical_url('/privacy')}",
        "- Contact: use the support email shown in the app Settings",
        "",
    ]
    lines.extend(_llm_markdown_links_features_faq())
    return "\n".join(lines)


def render_llms_full_txt(allow: bool) -> str:
    """
    Extended LLMO context for generative engines and AI crawlers.

    Adds entity summary, use cases, keywords, and citation guidance on top of
    the shared links / features / FAQ blocks used by llms.txt.
    """
    if not allow:
        return _llm_opt_out_body()

    lines: List[str] = [
        f"# {APP_NAME} — extended LLM context",
        "",
        f"> {APP_DESCRIPTION}",
        "",
        "## About",
        "",
        llmo_entity_summary(),
        "",
        f"{APP_REGION_NOTE}",
        "",
        "## Primary use cases",
        "",
    ]
    for use_case in LLMO_USE_CASES:
        lines.append(f"- {use_case}")
    lines.extend([
        "",
        "## Keywords",
        "",
        ", ".join(APP_KEYWORDS),
        "",
        "## Citation guidance",
        "",
        llmo_citation_guidance(),
        "",
        "## Preferred sources (in order)",
        "",
        f"1. {llms_txt_url()}",
        f"2. {llms_full_txt_url()}",
        f"3. {canonical_url('/')}",
        f"4. {canonical_url('/privacy')}",
        "",
    ])
    lines.extend(_llm_markdown_links_features_faq())
    return "\n".join(lines)


def privacy_page_kwargs(
    *,
    block_indexing: bool,
    ga4: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Jinja kwargs for templates/privacy_policy.html head + GA4."""
    import json

    ga4 = ga4 or {}
    seo_json_ld = ""
    if not block_indexing:
        seo_json_ld = json.dumps(
            privacy_json_ld_document(), separators=(",", ":"), ensure_ascii=False
        )
    dims = og_image_dimensions()
    return {
        **ga4,
        "block_search_indexing": block_indexing,
        "seo_title": privacy_title(),
        "seo_site_name": APP_NAME,
        "seo_description": privacy_description(),
        "seo_canonical": canonical_url("/privacy"),
        "seo_og_image": og_image_url(),
        "seo_og_image_alt": og_image_alt(),
        "seo_og_image_width": dims["width"],
        "seo_og_image_height": dims["height"],
        "seo_og_locale": APP_LOCALE_OG,
        "seo_language": APP_LANGUAGE,
        "seo_json_ld": seo_json_ld,
    }
