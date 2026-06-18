"""
Google Analytics 4 (gtag.js) — single source for the <head> snippet on every HTML page.

Set GOOGLE_ANALYTICS_MEASUREMENT_ID to override the default property ID.
Set GOOGLE_ANALYTICS_DISABLED=1 to omit the tag (local/staging without polluting prod data).
"""

import os
import re

DEFAULT_MEASUREMENT_ID = "G-8BESWPG747"
_MEASUREMENT_ID_RE = re.compile(r"^G-[A-Z0-9]+$")


def measurement_id() -> str:
    """Return the GA4 measurement ID, or '' when analytics is disabled or invalid."""
    if os.getenv("GOOGLE_ANALYTICS_DISABLED", "").strip().lower() in ("1", "true", "yes", "on"):
        return ""
    raw = (os.getenv("GOOGLE_ANALYTICS_MEASUREMENT_ID") or DEFAULT_MEASUREMENT_ID).strip()
    if not raw or not _MEASUREMENT_ID_RE.match(raw):
        return ""
    return raw


def head_snippet() -> str:
    """Standard GA4 gtag.js block for insertion once in each page <head> (empty when disabled)."""
    mid = measurement_id()
    if not mid:
        return ""
    return (
        "<!-- Google tag (gtag.js) -->\n"
        f'<script async src="https://www.googletagmanager.com/gtag/js?id={mid}"></script>\n'
        "<script>\n"
        "  window.dataLayer = window.dataLayer || [];\n"
        "  function gtag(){dataLayer.push(arguments);}\n"
        "  gtag('js', new Date());\n"
        "\n"
        f"  gtag('config', '{mid}');\n"
        "</script>"
    )


def template_kwargs() -> dict:
    """Jinja kwargs: inject {{ ga4_head_snippet|safe }} once per HTML template <head>."""
    return {"ga4_head_snippet": head_snippet()}
