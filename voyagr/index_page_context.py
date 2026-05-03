"""
Shared context for the main PWA HTML template (index).

Used by voyagr.api.core (/) so kwargs stay in sync with voyagr_web.HTML_TEMPLATE.
"""

import json
import os
from typing import Any, Dict

from voyagr.discoverability import block_search_indexing
from voyagr.seo import (
    APP_DESCRIPTION,
    APP_NAME,
    canonical_url,
    json_ld_document,
    og_image_url,
    seo_title,
)


def project_root() -> str:
    """Repository root (parent of the voyagr package directory)."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def build_index_template_kwargs(voyagr_strict_auth_gate: bool = False) -> Dict[str, Any]:
    """All Jinja variables required by voyagr_web.HTML_TEMPLATE for GET /."""
    _base = project_root()
    _pv_dir = os.path.join(_base, "static", "vendor", "picovoice")
    _porcupine_js = os.path.join(_pv_dir, "porcupine-web.iife.js")
    _wvp_js = os.path.join(_pv_dir, "web-voice-processor.iife.js")
    _pv_model = os.path.join(_pv_dir, "porcupine_params.pv")
    picovoice_access_key = (os.getenv("PICOVOICE_ACCESS_KEY") or "").strip()
    picovoice_web_assets_ok = bool(
        picovoice_access_key
        and os.path.isfile(_porcupine_js)
        and os.path.isfile(_wvp_js)
        and os.path.isfile(_pv_model)
    )
    picovoice_keyword_public_path = (
        os.getenv("PICOVOICE_WEB_KEYWORD_PATH") or "/static/vendor/picovoice/hey_satnav_wasm.ppn"
    ).strip()
    _wake_b = (os.getenv("VOYAGR_WAKE_BACKEND") or "picovoice").strip().lower()
    wake_backend_default = _wake_b if _wake_b == "picovoice" else "picovoice"
    block_indexing = block_search_indexing()
    # Pre-serialise JSON-LD once per request so the template only needs to {{ safe }} it.
    # Using compact separators keeps the inline <script> payload small.
    seo_json_ld = "" if block_indexing else json.dumps(
        json_ld_document(), separators=(",", ":"), ensure_ascii=False
    )
    return {
        "tomtom_api_key": os.getenv("TOMTOM_API_KEY", ""),
        "voyagr_strict_auth_gate": bool(voyagr_strict_auth_gate),
        "block_search_indexing": block_indexing,
        "picovoice_access_key": picovoice_access_key,
        "picovoice_web_assets_ok": picovoice_web_assets_ok,
        "picovoice_keyword_public_path": picovoice_keyword_public_path,
        "wake_backend_default": wake_backend_default,
        # SEO / GEO / AEO — see voyagr/seo.py for the single source of truth.
        "seo_title": seo_title(),
        "seo_site_name": APP_NAME,
        "seo_description": APP_DESCRIPTION,
        "seo_canonical": canonical_url("/"),
        "seo_og_image": og_image_url(),
        "seo_json_ld": seo_json_ld,
    }
