"""Offline price selection and HTTP/cache provenance regressions."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import Mock, patch
import pytest
from flask import Flask, g, jsonify
from voyagr.services.route_fuel_pricing import resolve_fuel_pricing, fuel_pricing_response
from voyagr.services.weekly_fuel_prices import WeeklyFuelPriceCache, parse_weekly_csv
from voyagr.config.rates import FUEL_PRICE_PETROL_GBP, FUEL_PRICE_DIESEL_GBP
from voyagr.services.routing.route_cache_key import build_route_cache_key
from voyagr.services.costs import calculate_fuel_cost

NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)
URL = 'https://assets.publishing.service.gov.uk/media/example/prices.csv'


def cache_at(now=NOW):
    cache = WeeklyFuelPriceCache(clock=lambda: now)
    cache._snapshot = parse_weekly_csv((Path(__file__).parent / 'fixtures/fuel_prices/weekly.csv').read_bytes(), retrieved_at=NOW, source_url=URL)
    return cache


@pytest.mark.parametrize('category,price', [('petrol', 1.7278), ('diesel', 1.9858)])
def test_automatic_uses_dated_gbp_quote_without_http(category, price):
    raw = {'fuel_price_mode': 'automatic', 'fuel_category': category, 'fuel_price': 99}
    before = deepcopy(raw)
    with patch('requests.get', side_effect=AssertionError('No source HTTP on route request')):
        resolved, quote, _ = resolve_fuel_pricing(raw, cache=cache_at())
    assert raw == before and resolved['fuel_price'] == price
    assert quote['source'] == 'DESNZ_WEEKLY' and quote['observation_date'] == '2026-11-02'
    assert quote['currency'] == 'GBP' and quote['price_unit'] == 'GBP/L'
    assert calculate_fuel_cost(100, 6.5, resolved['fuel_price']) == pytest.approx(6.5 * price)


def test_manual_and_legacy_override_do_not_consult_cache():
    for mode in ({}, {'fuel_price_mode': 'manual'}):
        cache = Mock()
        resolved, quote, _ = resolve_fuel_pricing({**mode, 'fuel_price': 1.23}, cache=cache)
        assert resolved['fuel_price'] == 1.23 and quote['source'] == 'MANUAL'
        cache.quote.assert_not_called()


@pytest.mark.parametrize('category,expected', [('petrol', FUEL_PRICE_PETROL_GBP), ('diesel', FUEL_PRICE_DIESEL_GBP)])
def test_stale_or_empty_cache_has_explicit_configured_fallback(category, expected):
    for cache in (cache_at(NOW + timedelta(days=20)), WeeklyFuelPriceCache()):
        resolved, quote, _ = resolve_fuel_pricing({'fuel_price_mode': 'automatic', 'fuel_category': category}, cache=cache)
        assert resolved['fuel_price'] == expected and quote['source'] == 'CONFIGURED_FALLBACK'
        assert quote['fallback_reason'] == 'WEEKLY_AVERAGE_UNAVAILABLE'
        assert 'observation_date' not in quote


def test_no_category_is_not_inferred_from_combined_vehicle_label():
    cache = Mock()
    _, quote, _ = resolve_fuel_pricing({'fuel_price_mode': 'automatic', 'vehicle_type': 'petrol_diesel'}, cache=cache)
    assert quote['category'] is None and quote['fallback_reason'] == 'CATEGORY_REQUIRED'
    cache.quote.assert_not_called()


@pytest.mark.parametrize('data', [
    {'fuel_price_mode': 'bad'}, {'fuel_category': 'E10'}, {'fuel_price_mode': []},
    {'fuel_price_mode': 'manual'}, {'fuel_price': None}, {'fuel_price': True},
    {'fuel_price': float('nan')}, {'fuel_price': float('inf')}, {'fuel_price': -1},
    {'fuel_price': 101}, {'fuel_price': ''}, {'fuel_price': 'n/a'},
    {'electricity_price': True}, {'fuel_efficiency': False},
    {'electricity_price': float('inf')}, {'energy_efficiency': float('nan')},
])
def test_invalid_cost_selection_is_rejected(data):
    with pytest.raises((ValueError, TypeError)):
        resolve_fuel_pricing(data)


@pytest.mark.parametrize('travel', [{'vehicle_type': 'electric'}, {'routing_mode': 'pedestrian'}, {'routing_mode': 'bicycle'}])
def test_non_fuel_travel_does_not_use_weekly_prices(travel):
    cache = Mock()
    resolved, quote, _ = resolve_fuel_pricing({**travel, 'fuel_price_mode': 'automatic', 'fuel_category': 'petrol', 'electricity_price': .45}, cache=cache)
    assert resolved['electricity_price'] == .45 and quote['source'] == 'NOT_APPLICABLE'
    cache.quote.assert_not_called()


def test_persistent_snapshot_reader_reloads_atomic_operator_publication(tmp_path, monkeypatch):
    path = tmp_path / 'weekly.json'
    monkeypatch.setenv('VOYAGR_WEEKLY_FUEL_PRICE_CACHE', str(path))
    # Use the real validation/read path with a controlled clock, no source I/O.
    cache = cache_at()
    cache.path = path
    from voyagr.utils.request_budget import WorkBudget
    cache._publish(cache.snapshot(), WorkBudget(12))
    with patch('voyagr.services.route_fuel_pricing.WeeklyFuelPriceCache', side_effect=lambda p: WeeklyFuelPriceCache(p, clock=lambda: NOW)):
        resolved, quote, _ = resolve_fuel_pricing({'fuel_category': 'diesel'})
    assert resolved['fuel_price'] == 1.9858 and quote['snapshot_id'] == cache.snapshot().snapshot_id


def test_price_consumption_and_source_changes_cannot_replay_old_cost_cache():
    base = dict(start_lat=53.5, start_lon=-1.1, end_lat=54.5, end_lon=-5.9, routing_mode='auto', vehicle_type='petrol_diesel')
    keys = []
    for request in ({'fuel_price': 1.2}, {'fuel_price': 1.3}, {'fuel_price': 1.2, 'fuel_efficiency': 7}, {'fuel_category': 'diesel'}):
        _, _, fingerprint = resolve_fuel_pricing(request, cache=cache_at())
        keys.append(build_route_cache_key(**base, cost_fingerprint=fingerprint))
    assert len(set(keys)) == 4 and all(key.endswith('rv10') for key in keys)


def test_http_response_freezes_one_quote_for_all_alternatives_and_legs():
    app = Flask(__name__)
    original = {'success': True, 'routes': [{'geometry': 'same', 'fuel_cost': 12.34, 'legs': [{'distance_km': 3}]}]}
    before = deepcopy(original)
    @app.route('/route')
    @fuel_pricing_response
    def route():
        g.route_cost_request, g.route_fuel_pricing, _ = resolve_fuel_pricing({'fuel_category': 'diesel'}, cache=cache_at())
        return jsonify(original)
    result = app.test_client().get('/route').get_json()
    assert result['fuel_pricing'] == result['routes'][0]['fuel_pricing'] == result['routes'][0]['legs'][0]['fuel_pricing']
    assert result['routes'][0]['fuel_cost'] == 12.34 and result['routes'][0]['geometry'] == 'same'
    assert original == before


@pytest.mark.parametrize('vehicle,mode,expected', [('petrol_diesel','auto',11.23), ('electric','auto',8.33), ('petrol_diesel','pedestrian',0)])
def test_multidrop_total_alternatives_and_legs_use_same_rate(vehicle, mode, expected):
    from voyagr.services.route_fuel_pricing import price_multidrop_fuel
    data, quote, _ = resolve_fuel_pricing({'vehicle_type':vehicle, 'routing_mode':mode, 'fuel_category':'petrol', 'electricity_price':.45}, cache=cache_at())
    payload = {'source':'Voyagr Multi-Drop', 'total_distance_km':100, 'routes':[{'distance_km':100,'fuel_cost':0}], 'legs':[{'distance_km':40}, {'distance_km':60}]}
    price_multidrop_fuel(payload, data)
    assert payload['fuel_cost'] == expected and payload['routes'][0]['fuel_cost'] == expected
    assert sum(leg['fuel_cost'] for leg in payload['legs']) == pytest.approx(expected, abs=.01)
    assert 'toll_cost' not in payload and 'caz_cost' not in payload


def test_real_route_handler_freezes_price_before_multidrop_and_cache(monkeypatch):
    import voyagr_web as web
    from voyagr.services.routing import multidrop
    data = {'start':'53.536,-1.380','end':'53.517,-1.150','fuel_price_mode':'automatic','fuel_category':'diesel'}
    expected = {'success':True,'source':'Synthetic fixture','routes':[{'geometry':'same','fuel_cost':1.29}]}
    seen = []
    def md(params):
        seen.append(params.fuel_price)
        return deepcopy(expected)
    monkeypatch.delenv('VOYAGR_WEEKLY_FUEL_PRICE_CACHE', raising=False)
    with patch('voyagr.services.route_fuel_pricing.WeeklyFuelPriceCache') as factory, patch.object(multidrop,'build_route_multidrop_response',side_effect=md):
        factory.return_value = cache_at()
        monkeypatch.setenv('VOYAGR_WEEKLY_FUEL_PRICE_CACHE','/unused-by-fixture')
        result = web.app.test_client().post('/api/route',json=data)
    assert result.status_code == 200 and seen == [1.9858]
    body = result.get_json()
    assert body['fuel_pricing']['source'] == 'DESNZ_WEEKLY'
    assert body['routes'][0]['fuel_pricing']['snapshot_id'] == body['fuel_pricing']['snapshot_id']
    assert body['routes'][0]['fuel_cost'] == 1.29
    # Exercise the real in-memory cache implementation, not only the key helper.
    cache = web.RouteCache()
    _, _, first = resolve_fuel_pricing({'fuel_price':1.2})
    _, _, second = resolve_fuel_pricing({'fuel_price':1.3})
    args = (53.536,-1.380,53.517,-1.150,'auto','petrol_diesel')
    cache.set(*args, expected, cost_fingerprint=first)
    assert cache.get(*args,cost_fingerprint=first) == expected
    assert cache.get(*args,cost_fingerprint=second) is None


def test_direct_multistop_handler_prices_response_and_rejects_invalid_selection():
    import voyagr_web as web
    from voyagr.services.routing import multidrop
    fake = {'success':True,'source':'Voyagr Multi-Drop','total_distance_km':100,'legs':[{'distance_km':100}]}
    with patch.object(multidrop,'build_multidrop_route_from_request',return_value=(fake,200)) as build:
        response = web.app.test_client().post('/api/multi-stop-route',json={'fuel_price':1.5,'fuel_efficiency':6})
        assert response.status_code == 200
        result = response.get_json()
        assert result['fuel_cost'] == 9 and result['legs'][0]['fuel_pricing']['source'] == 'MANUAL'
        assert build.call_args.args[0]['fuel_price'] == 1.5
        response = web.app.test_client().post('/api/multi-stop-route',json={'fuel_price_mode':'invalid'})
        assert response.status_code == 400 and build.call_count == 1
