"""Opt-in account-free presentation; private access remains the Nginx boundary."""
import os
from flask import jsonify, request


def enabled():
    return os.getenv('VOYAGR_PERSONAL_MODE', '').strip().lower() in ('1', 'true', 'yes', 'on')


def public_config():
    return dict(personal_mode=True, supabase_url='', supabase_anon_key='', require_login=False,
                stripe_payment_link_url='', buy_me_a_coffee_url='', patreon_url='',
                stripe_subscription_checkout_available=False, stripe_checkout_available=False,
                stripe_subscription_trial_days=None, promo_premium_enforcement=False)


def install(app):
    @app.before_request
    def deny_retired_account_actions():
        if enabled() and (request.path == '/api/me' or request.path.startswith('/api/coupons/')
                          or request.path == '/api/support/stripe-checkout'):
            response = jsonify(success=False, code='PERSONAL_MODE', error='Accounts and subscriptions are unavailable in personal mode')
            response.headers['Cache-Control'] = 'no-store'
            return response, 403
