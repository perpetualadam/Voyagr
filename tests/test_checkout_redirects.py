"""Checkout must not send customers to arbitrary caller-supplied destinations."""
import sys
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from flask import Flask
from voyagr.api.support import support_bp


@pytest.fixture
def checkout(monkeypatch):
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'test-only-key')
    monkeypatch.setenv('STRIPE_SUBSCRIPTION_PRICE_ID', 'price_test')
    monkeypatch.setenv('VOYAGR_PUBLIC_ORIGIN', 'https://voyagr.example')
    monkeypatch.delenv('STRIPE_SUCCESS_URL', raising=False)
    monkeypatch.delenv('STRIPE_CANCEL_URL', raising=False)
    create = Mock(return_value={'url': 'https://checkout.stripe.com/test-only'})
    monkeypatch.setitem(sys.modules, 'stripe', SimpleNamespace(checkout=SimpleNamespace(Session=SimpleNamespace(create=create))))
    app = Flask(__name__)
    app.register_blueprint(support_bp, url_prefix='/api')
    return app.test_client(), create


@pytest.mark.parametrize('url', [
    'https://attacker.example/finish', 'https://voyagr.example.attacker.test/',
    'https://voyagr.example@attacker.test/', 'https://voyagr.example:444/',
    'http://localhost.attacker.test/', 'javascript:alert(1)',
    'https://voyagr.example/#fragment', 'https://voyagr.example/\\attacker',
    'https://voyagr.example/\nprivate', 'https://[invalid/',
])
def test_untrusted_redirect_never_creates_a_paid_checkout(checkout, url):
    client, create = checkout
    response = client.post('/api/support/stripe-checkout', json={'success_url': url})
    assert response.status_code == 400
    create.assert_not_called()


def test_same_origin_keeps_checkout_mode_trial_and_query(checkout, monkeypatch):
    client, create = checkout
    monkeypatch.setenv('STRIPE_SUBSCRIPTION_TRIAL_DAYS', '7')
    response = client.post('/api/support/stripe-checkout', json={'success_url': 'https://voyagr.example/finish?done=1'})
    assert response.status_code == 200
    args = create.call_args.kwargs
    assert args['mode'] == 'subscription'
    assert args['subscription_data'] == {'trial_period_days': 7}
    assert args['success_url'] == 'https://voyagr.example/finish?done=1&session_id={CHECKOUT_SESSION_ID}'
    assert args['cancel_url'] == 'https://voyagr.example/?subscribe=cancelled'


def test_configured_redirect_origin_works_without_public_origin(checkout, monkeypatch):
    client, create = checkout
    monkeypatch.delenv('VOYAGR_PUBLIC_ORIGIN')
    monkeypatch.setenv('STRIPE_SUCCESS_URL', 'https://return.example/success')
    monkeypatch.setenv('STRIPE_CANCEL_URL', 'https://return.example/cancel')
    assert client.post('/api/support/stripe-checkout', json={}).status_code == 200
    assert create.call_count == 1


@pytest.mark.parametrize('origin', ['http://localhost:5000', 'http://127.0.0.1:5000', 'http://[::1]:5000'])
def test_exact_loopback_development_origin_is_supported(checkout, monkeypatch, origin):
    client, _ = checkout
    monkeypatch.setenv('VOYAGR_PUBLIC_ORIGIN', origin)
    assert client.post('/api/support/stripe-checkout', json={}).status_code == 200


@pytest.mark.parametrize('body', [[], ['bad'], {'success_url': 42}, {'customer_email': []}])
def test_invalid_checkout_body_does_not_call_provider(checkout, body):
    client, create = checkout
    assert client.post('/api/support/stripe-checkout', json=body).status_code == 400
    create.assert_not_called()


def test_provider_error_does_not_log_customer_or_secret(checkout, caplog):
    client, create = checkout
    create.side_effect = RuntimeError('private-customer@example.test test-only-key')
    assert client.post('/api/support/stripe-checkout', json={}).status_code == 502
    assert 'private-customer' not in caplog.text
    assert 'test-only-key' not in caplog.text
