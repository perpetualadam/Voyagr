"""
Optional Google Analytics 4 — local consent bootstrap on every HTML page.

Set GOOGLE_ANALYTICS_MEASUREMENT_ID explicitly to offer optional analytics.
No analytics property is enabled by default.
Set GOOGLE_ANALYTICS_DISABLED=1 to omit the tag (local/staging without polluting prod data).
"""

import os
import re

_MEASUREMENT_ID_RE = re.compile(r"^G-[A-Z0-9]+$")


def measurement_id() -> str:
    """Return the GA4 measurement ID, or '' when analytics is disabled or invalid."""
    if os.getenv("GOOGLE_ANALYTICS_DISABLED", "").strip().lower() in ("1", "true", "yes", "on"):
        return ""
    raw = (os.getenv("GOOGLE_ANALYTICS_MEASUREMENT_ID") or "").strip()
    if not raw or not _MEASUREMENT_ID_RE.match(raw):
        return ""
    return raw


def head_snippet() -> str:
    """Local consent controller only; no Google request before explicit opt-in."""
    mid = measurement_id()
    if not mid:
        return ""
    return (
        '<script defer src="/static/js/modules/privacy/consent-policy.js?v=20261114privacy3"></script>'
        '<script defer src="/static/js/app/analytics-consent.js?v=20261114privacy3" '
        f'data-voyagr-analytics="{mid}"></script>'
    )


def template_kwargs() -> dict:
    contact = os.getenv("VOYAGR_PRIVACY_CONTACT_EMAIL", "info@vibevoyager.org").strip()
    if not re.fullmatch(r"[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", contact):
        contact = ""
    return {"ga4_head_snippet": head_snippet(), "optional_analytics_available": bool(measurement_id()),
            "optional_analytics_measurement_id": measurement_id(),
            "privacy_operator_name": os.getenv("VOYAGR_PRIVACY_OPERATOR_NAME", "").strip()[:200],
            "privacy_contact_email": contact}
