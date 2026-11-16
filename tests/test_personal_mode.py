"""Real private-mode config/render/API boundaries; no external auth or billing."""
import pytest
from voyagr.personal_use import enabled


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('VOYAGR_PERSONAL_MODE', '1')
    monkeypatch.setenv('SUPABASE_URL', 'https://accounts.example.invalid')
    monkeypatch.setenv('SUPABASE_ANON_KEY', 'synthetic-public-key')
    monkeypatch.setenv('REQUIRE_LOGIN', 'true')
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'synthetic-secret')
    monkeypatch.setenv('STRIPE_SUBSCRIPTION_PRICE_ID', 'synthetic-price')
    monkeypatch.setenv('VOYAGR_STRIPE_PAYMENT_LINK_URL', 'https://billing.example.invalid')
    monkeypatch.setenv('GOOGLE_ANALYTICS_MEASUREMENT_ID', 'G-TEST123')
    from voyagr_web import app
    return app.test_client()


def test_personal_shell_omits_account_sdk_and_sales_controls_but_keeps_device_features(client):
    response = client.get('/')
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert 'data-personal-mode="true"' in html
    for element in ('authRequiredGate', 'softAuthBanner', 'accountSection', 'supportVoyagrSection', 'promoCodeFormWrap'):
        assert 'id="'+element+'"' not in html
    assert 'openVoyagerPremiumSection()' not in html
    assert 'Sign in to sync your profile' not in html
    assert 'App &amp; device' in html
    for element in ('localDataControls', 'speedWidget', 'voiceBtn', 'previewRouteInfo'):
        assert 'id="'+element+'"' in html
    # Includes content-addressed runtime names; the account SDK must be absent.
    assert '/supabase.min.js' not in html
    assert 'data-voyagr-analytics=' not in html
    assert 'no-store' in response.headers['Cache-Control']


def test_personal_config_overrides_stale_account_and_billing_configuration(client):
    response = client.get('/api/config')
    data = response.get_json()
    assert data['personal_mode'] is True
    assert data['supabase_url'] == data['supabase_anon_key'] == ''
    assert data['require_login'] is False
    assert data['stripe_subscription_checkout_available'] is False
    assert data['stripe_payment_link_url'] == ''
    assert 'synthetic-secret' not in response.get_data(as_text=True)
    assert 'no-store' in response.headers['Cache-Control']


@pytest.mark.parametrize('path,method', [('/api/me','GET'),('/api/coupons/status','GET'),('/api/coupons/redeem','POST'),('/api/support/stripe-checkout','POST')])
def test_retired_actions_fail_before_account_or_payment_work(client,path,method):
    response = client.open(path,method=method,json={})
    assert response.status_code == 403
    assert response.get_json()['code'] == 'PERSONAL_MODE'
    assert response.headers['Cache-Control'] == 'no-store'


def test_private_mode_disables_discoverability_and_analytics_without_withdrawing_records(client):
    assert 'Disallow: /' in client.get('/robots.txt').get_data(as_text=True)
    assert '<loc>' not in client.get('/sitemap.xml').get_data(as_text=True)
    assert 'data-voyagr-analytics=' not in client.get('/privacy').get_data(as_text=True)


def test_public_mode_remains_explicitly_compatible(monkeypatch,client):
    monkeypatch.delenv('VOYAGR_PERSONAL_MODE')
    assert enabled() is False
    data=client.get('/api/config').get_json()
    assert data['personal_mode'] is False
    assert data['supabase_url']=='https://accounts.example.invalid'
    assert data['require_login'] is True
