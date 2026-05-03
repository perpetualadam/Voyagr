"""
Stripe: recurring subscriptions via Checkout (server-created session).
Optional subscription Payment Link URL is exposed via /api/config (no secret keys).

One-off tips: Buy Me a Coffee and Patreon (URLs only in config).
"""

import logging
import os
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request

support_bp = Blueprint('support', __name__)
logger = logging.getLogger('voyagr_web')


def _subscription_price_id() -> str:
    """Recurring Price ID from Stripe (e.g. price_xxx for a monthly/yearly product)."""
    return os.getenv('STRIPE_SUBSCRIPTION_PRICE_ID', '').strip() or os.getenv(
        'STRIPE_DONATE_PRICE_ID', ''
    ).strip()


def _subscription_trial_days() -> Optional[int]:
    """Free trial length for Checkout-created subscriptions (Stripe subscription_data)."""
    raw = os.getenv('STRIPE_SUBSCRIPTION_TRIAL_DAYS', '').strip()
    if not raw.isdigit():
        return None
    n = int(raw)
    return n if n > 0 else None


@support_bp.route('/support/stripe-checkout', methods=['POST'])
def create_stripe_checkout_session() -> Any:
    """
    Create a Stripe Checkout session in **subscription** mode.
    Requires STRIPE_SECRET_KEY and STRIPE_SUBSCRIPTION_PRICE_ID (recurring price in Dashboard).

    Legacy: STRIPE_DONATE_PRICE_ID is still read if STRIPE_SUBSCRIPTION_PRICE_ID is unset,
    but it must be a **recurring** Stripe Price or checkout will fail.

    Optional env STRIPE_SUBSCRIPTION_TRIAL_DAYS=N adds a free trial (subscription_data.trial_period_days).

    Body JSON (optional):
      success_url, cancel_url — must be valid https URLs on your domain (or localhost for dev).
      customer_email — prefills Stripe Checkout (e.g. signed-in Supabase user).
      supabase_user_id — stored as Checkout client_reference_id for your reconciliation.
    """
    secret = os.getenv('STRIPE_SECRET_KEY', '').strip()
    price_id = _subscription_price_id()
    if not secret or not price_id:
        return jsonify({
            'success': False,
            'error': 'Stripe subscription checkout is not configured on this server.',
        }), 503

    try:
        import stripe  # type: ignore
    except ImportError:
        logger.error('[support] stripe package not installed')
        return jsonify({'success': False, 'error': 'Stripe support unavailable.'}), 503

    stripe.api_key = secret

    default_origin = os.getenv('VOYAGR_PUBLIC_ORIGIN', '').strip().rstrip('/')
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    customer_email = (payload.get('customer_email') or '').strip()
    supabase_user_id = (payload.get('supabase_user_id') or '').strip()
    success_url = (payload.get('success_url') or os.getenv('STRIPE_SUCCESS_URL') or '').strip()
    cancel_url = (payload.get('cancel_url') or os.getenv('STRIPE_CANCEL_URL') or '').strip()

    if not success_url and default_origin:
        success_url = f'{default_origin}/?subscribe=success'
    if not cancel_url and default_origin:
        cancel_url = f'{default_origin}/?subscribe=cancelled'

    if not success_url or not cancel_url:
        return jsonify({
            'success': False,
            'error': 'Set STRIPE_SUCCESS_URL and STRIPE_CANCEL_URL (https, absolute) or VOYAGR_PUBLIC_ORIGIN.',
        }), 400

    def _allowed_redirect(u: str) -> bool:
        if u.startswith('https://'):
            return True
        return u.startswith('http://localhost') or u.startswith('http://127.0.0.1')

    for u in (success_url, cancel_url):
        if not _allowed_redirect(u):
            return jsonify({
                'success': False,
                'error': 'success_url and cancel_url must be https, or http://localhost for dev.',
            }), 400

    qs = '&' if '?' in success_url else '?'
    success_final = f'{success_url}{qs}session_id={{CHECKOUT_SESSION_ID}}'

    subscription_data: Dict[str, Any] = {}
    trial_days = _subscription_trial_days()
    if trial_days is not None:
        subscription_data['trial_period_days'] = trial_days

    try:
        create_kw: Dict[str, Any] = {
            'mode': 'subscription',
            'line_items': [{'price': price_id, 'quantity': 1}],
            'success_url': success_final,
            'cancel_url': cancel_url,
        }
        if subscription_data:
            create_kw['subscription_data'] = subscription_data
        if customer_email and '@' in customer_email:
            create_kw['customer_email'] = customer_email
        if supabase_user_id:
            create_kw['client_reference_id'] = supabase_user_id[:200]
        session = stripe.checkout.Session.create(**create_kw)
        url: Optional[str] = session.get('url')
        if not url:
            return jsonify({'success': False, 'error': 'Stripe did not return a checkout URL.'}), 502
        return jsonify({'success': True, 'url': url})
    except Exception as e:
        logger.warning('[support] Stripe subscription session failed: %s', e)
        return jsonify({'success': False, 'error': 'Could not start subscription checkout.'}), 502
