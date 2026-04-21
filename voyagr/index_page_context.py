"""
Shared context for the main PWA HTML template (index).

Used by voyagr.api.core (/) so kwargs stay in sync with voyagr_web.HTML_TEMPLATE.
"""

import os
from typing import Any, Dict

from voyagr.discoverability import block_search_indexing


def project_root() -> str:
    """Repository root (parent of the voyagr package directory)."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def build_index_template_kwargs() -> Dict[str, Any]:
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
    _sherpa_lab = (os.getenv("VOYAGR_SHERPA_KWS_LAB") or "").strip().lower()
    sherpa_kws_lab = _sherpa_lab in ("1", "true", "yes", "on")
    _wake_b = (os.getenv("VOYAGR_WAKE_BACKEND") or "picovoice").strip().lower()
    wake_backend_default = _wake_b if _wake_b in ("picovoice", "sherpa") else "picovoice"
    return {
        "tomtom_api_key": os.getenv("TOMTOM_API_KEY", ""),
        "block_search_indexing": block_search_indexing(),
        "picovoice_access_key": picovoice_access_key,
        "picovoice_web_assets_ok": picovoice_web_assets_ok,
        "picovoice_keyword_public_path": picovoice_keyword_public_path,
        "sherpa_kws_lab": sherpa_kws_lab,
        "wake_backend_default": wake_backend_default,
    }
