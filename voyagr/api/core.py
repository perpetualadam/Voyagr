"""
Core routes blueprint for Voyagr.

Contains:
- Index page
- Config endpoint
- Monitoring dashboard
- Manifest and service worker
- Digital Asset Links (TWA verification)
"""

import json
import os
from flask import Blueprint, jsonify, render_template_string, current_app

core_bp = Blueprint('core', __name__)


@core_bp.route('/')
def index():
    """Render the main application page."""
    from voyagr_web import HTML_TEMPLATE
    tomtom_key = os.getenv('TOMTOM_API_KEY', '')
    return render_template_string(HTML_TEMPLATE, tomtom_api_key=tomtom_key)


@core_bp.route('/api/config')
def get_config():
    """Return client-side configuration including API keys.
    This endpoint bypasses HTML caching issues."""
    response = jsonify({
        'tomtom_api_key': os.getenv('TOMTOM_API_KEY', ''),
        'openweathermap_api_key': os.getenv('OPENWEATHERMAP_API_KEY', ''),
        # Supabase (public)
        'supabase_url': os.getenv('SUPABASE_URL', ''),
        'supabase_anon_key': os.getenv('SUPABASE_ANON_KEY', ''),
        # Auth behavior
        'require_login': os.getenv('REQUIRE_LOGIN', 'false').lower() == 'true',
        'success': True
    })
    # Prevent caching
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@core_bp.route('/monitoring')
def monitoring_dashboard():
    """Monitoring dashboard for routing engines."""
    from voyagr_web import MONITORING_DASHBOARD_HTML
    return render_template_string(MONITORING_DASHBOARD_HTML)


@core_bp.route('/manifest.json')
def manifest():
    """Serve the PWA manifest file."""
    manifest_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'manifest.json')
    with open(manifest_path, 'r', encoding='utf-8') as f:
        return jsonify(json.load(f))


@core_bp.route('/service-worker.js')
def service_worker():
    """Serve the service worker script."""
    sw_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'service-worker.js')
    with open(sw_path, 'r', encoding='utf-8') as f:
        response = current_app.make_response(f.read())
        response.headers['Content-Type'] = 'application/javascript'
        response.headers['Service-Worker-Allowed'] = '/'
        return response


@core_bp.route('/.well-known/assetlinks.json')
def asset_links():
    """Serve Digital Asset Links for TWA (Trusted Web Activity) verification.

    The SHA-256 fingerprint is read from the TWA_SHA256_FINGERPRINT env var.
    Set this to the signing certificate fingerprint of your Android app
    (upload key or Play App Signing key).
    """
    fingerprint = os.getenv(
        'TWA_SHA256_FINGERPRINT',
        'REPLACE_WITH_YOUR_SHA256_FINGERPRINT'
    )
    package_name = os.getenv('TWA_PACKAGE_NAME', 'com.voyagr.app')
    asset_links = [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": package_name,
                "sha256_cert_fingerprints": [fingerprint]
            }
        }
    ]
    response = jsonify(asset_links)
    response.headers['Content-Type'] = 'application/json'
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response

