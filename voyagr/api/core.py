"""
Core routes blueprint for Voyagr.

Contains:
- Index page
- Config endpoint
- Monitoring dashboard
- Manifest and service worker
- Digital Asset Links (TWA verification)
- Privacy policy (required by Google Play)
"""

import json
import os
from typing import Optional

from flask import Blueprint, jsonify, render_template_string, current_app, Response

from voyagr.discoverability import block_search_indexing

core_bp = Blueprint('core', __name__)


def _index_template_kwargs() -> dict:
    return {
        'tomtom_api_key': os.getenv('TOMTOM_API_KEY', ''),
        'block_search_indexing': block_search_indexing(),
    }


@core_bp.route('/')
def index():
    """Render the main application page."""
    from voyagr_web import HTML_TEMPLATE
    return render_template_string(HTML_TEMPLATE, **_index_template_kwargs())


@core_bp.route('/api/config')
def get_config():
    """Return client-side configuration including API keys.
    This endpoint bypasses HTML caching issues."""
    stripe_key = os.getenv('STRIPE_SECRET_KEY', '').strip()
    sub_price = os.getenv('STRIPE_SUBSCRIPTION_PRICE_ID', '').strip() or os.getenv(
        'STRIPE_DONATE_PRICE_ID', ''
    ).strip()
    trial_raw = os.getenv('STRIPE_SUBSCRIPTION_TRIAL_DAYS', '').strip()
    trial_days_out: Optional[int] = None
    if trial_raw.isdigit():
        tv = int(trial_raw)
        if tv > 0:
            trial_days_out = tv
    response = jsonify({
        'tomtom_api_key': os.getenv('TOMTOM_API_KEY', ''),
        'openweathermap_api_key': os.getenv('OPENWEATHERMAP_API_KEY', ''),
        # Supabase (public)
        'supabase_url': os.getenv('SUPABASE_URL', ''),
        'supabase_anon_key': os.getenv('SUPABASE_ANON_KEY', ''),
        # Auth behavior
        'require_login': os.getenv('REQUIRE_LOGIN', 'false').lower() == 'true',
        # Discoverability (client may adjust UI; enforcement is server headers + robots.txt)
        'block_search_indexing': block_search_indexing(),
        # Stripe = subscription (Payment Link or Checkout); BMC / Patreon = one-off tips
        'stripe_payment_link_url': os.getenv('VOYAGR_STRIPE_PAYMENT_LINK_URL', '').strip(),
        'buy_me_a_coffee_url': os.getenv('VOYAGR_BUYMEACOFFEE_URL', '').strip(),
        'patreon_url': os.getenv('VOYAGR_PATREON_URL', '').strip(),
        'stripe_subscription_checkout_available': bool(stripe_key and sub_price),
        # Deprecated alias (same flag); remove when all clients updated
        'stripe_checkout_available': bool(stripe_key and sub_price),
        # Shown in app UI for Checkout flow; Payment Link trials are set in Stripe Dashboard only
        'stripe_subscription_trial_days': trial_days_out,
        'success': True
    })
    # Prevent caching
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@core_bp.route('/robots.txt')
def robots_txt():
    """Crawler policy: disallow all when VOYAGR_BLOCK_SEARCH_INDEXING is enabled."""
    if block_search_indexing():
        body = 'User-agent: *\nDisallow: /\n'
    else:
        body = 'User-agent: *\nAllow: /\n'
    return Response(body, mimetype='text/plain')


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


PRIVACY_POLICY_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy - Voyagr Navigation</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         line-height: 1.7; color: #333; background: #f9fafb; }
  .container { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
  h1 { font-size: 28px; color: #667eea; margin-bottom: 8px; }
  .updated { color: #888; font-size: 14px; margin-bottom: 32px; }
  h2 { font-size: 20px; color: #333; margin: 28px 0 12px; }
  p, li { margin-bottom: 12px; }
  ul { padding-left: 24px; }
  a { color: #667eea; }
  .back { display: inline-block; margin-top: 32px; color: #667eea; text-decoration: none;
          font-weight: 600; }
  .back:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <h1>Privacy Policy</h1>
  <p class="updated">Last updated: February 2026</p>

  <p>Voyagr Navigation ("Voyagr", "we", "our") is committed to protecting your
  privacy. This policy explains what data we collect, why, and how we handle it.</p>

  <h2>1. Data We Collect</h2>
  <ul>
    <li><strong>Location data</strong> &mdash; When you use GPS tracking or navigation,
    your device's location is used to provide turn-by-turn directions, speed monitoring,
    and route progress. Location data is processed in real time and is not stored on our
    servers unless you explicitly save a trip.</li>
    <li><strong>Route calculations</strong> &mdash; Start and end coordinates are sent
    to routing engines (Valhalla, GraphHopper) to calculate routes. These are processed
    transiently and cached locally on the server for performance.</li>
    <li><strong>Saved trips</strong> &mdash; If you save a trip, the route summary
    (distance, duration, cost estimate) is stored in a local database on the server.</li>
    <li><strong>Account data</strong> &mdash; If you sign in, your email address and
    display name are managed by Supabase (our authentication provider).</li>
    <li><strong>Preferences</strong> &mdash; Settings such as vehicle type, units, and
    theme are stored in your browser's local storage.</li>
  </ul>

  <h2>2. Data We Do NOT Collect</h2>
  <ul>
    <li>We do not sell or share your personal data with advertisers.</li>
    <li>We do not use tracking pixels, fingerprinting, or cross-site tracking.</li>
    <li>We do not collect contacts, messages, photos, or files from your device.</li>
  </ul>

  <h2>3. Third-Party Services</h2>
  <p>Voyagr uses the following third-party services that may process data according
  to their own privacy policies:</p>
  <ul>
    <li><strong>TomTom</strong> &mdash; Traffic data and geocoding.
    <a href="https://www.tomtom.com/privacy/" target="_blank">TomTom Privacy Policy</a></li>
    <li><strong>OpenWeatherMap</strong> &mdash; Weather conditions along routes.
    <a href="https://openweather.co.uk/privacy-policy" target="_blank">OpenWeatherMap Privacy Policy</a></li>
    <li><strong>Supabase</strong> &mdash; User authentication (if you sign in).
    <a href="https://supabase.com/privacy" target="_blank">Supabase Privacy Policy</a></li>
    <li><strong>OpenFreeMap / OpenStreetMap</strong> &mdash; Map tiles and geographic data.
    <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank">OSM Privacy Policy</a></li>
  </ul>

  <h2>4. Location Permission</h2>
  <p>Voyagr requests location access only when you actively use GPS tracking or
  navigation. You can revoke this permission at any time in your device or browser
  settings. The app functions without location access (route planning, cost estimation)
  but real-time navigation features require it.</p>

  <h2>5. Data Storage and Security</h2>
  <ul>
    <li>User preferences are stored locally in your browser and never sent to our servers.</li>
    <li>Trip history is stored in an encrypted server-side database.</li>
    <li>All communication uses HTTPS encryption.</li>
    <li>We retain trip data only as long as your account is active. You can delete your
    data at any time by contacting us.</li>
  </ul>

  <h2>6. Children's Privacy</h2>
  <p>Voyagr is not directed at children under 13. We do not knowingly collect data from
  children.</p>

  <h2>7. Your Rights</h2>
  <p>Under UK GDPR and applicable data protection laws, you have the right to:</p>
  <ul>
    <li>Access, correct, or delete your personal data</li>
    <li>Withdraw consent for location tracking at any time</li>
    <li>Request a copy of your data in a portable format</li>
    <li>Lodge a complaint with the Information Commissioner's Office (ICO)</li>
  </ul>

  <h2>8. Changes to This Policy</h2>
  <p>We may update this privacy policy from time to time. Changes will be posted on this
  page with an updated date.</p>

  <h2>9. Contact</h2>
  <p>If you have questions about this privacy policy or your data, please contact us at
  the email address provided in the app's settings or support page.</p>

  <a href="/" class="back">&larr; Back to Voyagr</a>
</div>
</body>
</html>"""


@core_bp.route('/privacy')
def privacy_policy():
    """Serve the privacy policy page (required by Google Play Store)."""
    return render_template_string(PRIVACY_POLICY_HTML)

