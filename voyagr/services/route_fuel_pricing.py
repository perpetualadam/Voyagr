"""Freeze one price per route calculation. No source HTTP or refresh on requests."""
from copy import deepcopy
from functools import wraps
import hashlib
import json
import math
import os

from voyagr.config.rates import fuel_price_for_vehicle_type, resolve_route_cost_params
from voyagr.services.weekly_fuel_prices import WeeklyFuelPriceCache


def resolve_fuel_pricing(data, *, cache=None):
    """Return resolved request copy and truthful quote; legacy explicit prices win."""
    resolved = dict(data)
    mode = data.get('fuel_price_mode', 'manual' if 'fuel_price' in data else 'automatic')
    category = data.get('fuel_category', '')
    if mode not in ('manual', 'automatic') or category not in ('', 'petrol', 'diesel'):
        raise ValueError('Invalid fuel pricing selection')
    vehicle = data.get('vehicle_type', 'petrol_diesel')
    excluded = vehicle == 'electric' or data.get('routing_mode') in ('pedestrian', 'bicycle')
    quote = None
    reason = None
    if mode == 'automatic' and not excluded:
        if not category:
            reason = 'CATEGORY_REQUIRED'
        else:
            if cache is None:
                path = os.getenv('VOYAGR_WEEKLY_FUEL_PRICE_CACHE')
                cache = WeeklyFuelPriceCache(path) if path else None
            quote = cache.quote(category) if cache is not None else None
            if quote is None:
                reason = 'WEEKLY_AVERAGE_UNAVAILABLE'
    if excluded:
        price = fuel_price_for_vehicle_type(vehicle)
        source = 'NOT_APPLICABLE'
    elif quote is not None:
        price = float(quote['price_gbp_per_l'])
        source = 'DESNZ_WEEKLY'
    elif mode == 'manual':
        if 'fuel_price' not in data:
            raise ValueError('Manual fuel price is required')
        price = data['fuel_price']
        source = 'MANUAL'
    else:
        price = fuel_price_for_vehicle_type(category or vehicle)
        source = 'CONFIGURED_FALLBACK'
    if price is None or isinstance(price, bool):
        raise ValueError('Invalid fuel price')
    price = float(price)
    if not math.isfinite(price) or price < 0 or price > 100:
        raise ValueError('Invalid fuel price')
    resolved['fuel_price'] = price
    if any(isinstance(resolved.get(key), bool) for key in ('fuel_efficiency', 'energy_efficiency', 'electricity_price')):
        raise ValueError('Invalid cost parameters')
    params = resolve_route_cost_params(resolved)
    if any(isinstance(v, bool) or not math.isfinite(v) or v < 0 for v in params.values()):
        raise ValueError('Invalid cost parameters')
    metadata = dict(quote or {})
    metadata.update(version=1, mode=mode, category=category or None, source=source,
                    currency='GBP', price_unit='GBP/L', price_gbp_per_l=str(price),
                    fallback_reason=reason)
    fingerprint = hashlib.sha256(json.dumps([params, metadata], sort_keys=True).encode()).hexdigest()[:24]
    return resolved, metadata, fingerprint


def attach_fuel_pricing(payload, metadata):
    """Add provenance to each alternative/leg without changing costs or geometry."""
    if not isinstance(payload, dict):
        return
    payload['fuel_pricing'] = deepcopy(metadata)
    for field in ('routes', 'legs'):
        for item in payload.get(field, []) or []:
            if isinstance(item, dict):
                attach_fuel_pricing(item, metadata)


def price_multidrop_fuel(payload, data):
    """Multi-drop previously emitted zero fuel costs; use the same frozen rate.

    Do not invent toll/CAZ charges or mark their verification as complete.
    """
    if payload.get('source') != 'Voyagr Multi-Drop':
        return
    params = resolve_route_cost_params(data)
    walking = data.get('routing_mode') in ('pedestrian', 'bicycle')
    electric = data.get('vehicle_type') == 'electric'
    def apply(item, distance):
        efficiency = params['energy_efficiency'] if electric else params['fuel_efficiency']
        rate = params['electricity_price'] if electric else params['fuel_price']
        amount = 0 if walking else float(distance) / 100 * efficiency
        item['fuel_litres'] = round(amount, 2)
        item['fuel_cost'] = round(amount * rate, 2)
        item['total_cost'] = round(item['fuel_cost'] + float(item.get('toll_cost', 0)) + float(item.get('caz_cost', 0)), 2)
    apply(payload, payload['total_distance_km'])
    for route in payload.get('routes', []):
        apply(route, route['distance_km'])
    for leg in payload.get('legs', []):
        apply(leg, leg['distance_km'])


def fuel_pricing_response(handler):
    """Attach the frozen request quote after all /api/route return paths."""
    @wraps(handler)
    def wrapped(*args, **kwargs):
        from flask import g, make_response
        response = make_response(handler(*args, **kwargs))
        metadata = getattr(g, 'route_fuel_pricing', None)
        if metadata is not None and response.is_json and 200 <= response.status_code < 300:
            payload = response.get_json()
            if isinstance(payload, dict) and payload.get('success') is not False:
                price_multidrop_fuel(payload, g.route_cost_request)
                attach_fuel_pricing(payload, metadata)
                response.set_data(json.dumps(payload))
        return response
    return wrapped
