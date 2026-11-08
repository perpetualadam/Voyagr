"""
Search blueprint for Voyagr.

Contains:
- POI search
- Parking search
- Search history
- Favorites
"""

import logging
import math
import os
import re
import time
import requests
from voyagr.utils import request_budget as route_transport
from typing import Any
from flask import Blueprint, jsonify, request

from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils import sanitize_string, require_private_user
from voyagr.utils.geometry import get_distance_between_points
from voyagr.services.geocoding import (
    build_nominatim_structured_params,
    dedupe_results,
    looks_like_uk_postcode_query,
    nominatim_extra_params_for_query,
    parse_address_query,
    query_has_house_number,
    rank_geocode_results,
    should_fetch_tomtom,
)

logger = logging.getLogger(__name__)

search_bp = Blueprint('search', __name__)

NOMINATIM_BASE_URL = os.getenv('NOMINATIM_URL', 'https://nominatim.openstreetmap.org').strip().rstrip('/')
NOMINATIM_COUNTRYCODES = os.getenv('NOMINATIM_COUNTRYCODES', '').strip()
NOMINATIM_LANGUAGE = os.getenv('NOMINATIM_LANGUAGE', 'en').strip()
OVERPASS_API_URL = os.getenv('OVERPASS_API_URL', 'https://overpass-api.de/api/interpreter').strip()
POSTCODES_IO_BASE_URL = os.getenv('POSTCODES_IO_URL', 'https://api.postcodes.io').strip().rstrip('/')


def _nominatim_headers() -> dict:
    """OSM policy: identifiable User-Agent; optional NOMINATIM_USER_AGENT override."""
    ua = os.getenv('NOMINATIM_USER_AGENT', '').strip() or (
        'Voyagr/1.0 (+https://github.com/perpetualadam/Voyagr)'
    )
    return {
        'User-Agent': ua,
        'Accept': 'application/json',
        'Accept-Language': NOMINATIM_LANGUAGE,
        'Accept-Encoding': 'gzip',
    }


def _nominatim_email_params(params: dict) -> None:
    """Nominatim prefers contact email when using the public instance (NOMINATIM_EMAIL)."""
    email = os.getenv('NOMINATIM_EMAIL', '').strip()
    if email:
        params['email'] = email


def _postcodes_io_geocode(query: str) -> list:
    """
    Resolve UK unit postcodes and outward codes via postcodes.io.

    Returns Nominatim-shaped dicts so ranking/dedupe/UI stay unchanged.
    Free public API (no key); fails soft when unreachable.
    """
    parsed = parse_address_query(query)
    if not parsed.postcode:
        # Only call when the whole query looks like a UK postcode / outcode.
        if not looks_like_uk_postcode_query(query):
            return []
        # Re-parse after stripping separators so compact forms still work.
        compact = re.sub(r'[-\s.]+', '', (query or '').strip())
        parsed = parse_address_query(compact)
        if not parsed.postcode:
            return []

    code = parsed.postcode_display or parsed.postcode
    code_path = requests.utils.quote(code.replace(' ', ''))
    headers = {
        'User-Agent': 'Voyagr/1.0 (+https://github.com/perpetualadam/Voyagr)',
        'Accept': 'application/json',
    }

    def _unit_result(result: dict) -> dict:
        postcode = result.get('postcode') or parsed.postcode_display or parsed.postcode
        district = result.get('admin_district') or result.get('parish') or ''
        region = result.get('region') or result.get('country') or ''
        parts = [p for p in (postcode, district, region, 'United Kingdom') if p]
        return {
            'lat': str(result['latitude']),
            'lon': str(result['longitude']),
            'display_name': ', '.join(parts),
            'name': postcode,
            'type': 'postcode',
            'class': 'place',
            'importance': 0.9,
            'address': {
                'postcode': postcode,
                'city': district or '',
                'state': region or '',
                'country': 'United Kingdom',
                'country_code': 'gb',
            },
            '_source': 'postcodes_io',
        }

    def _outcode_result(result: dict) -> dict:
        outcode = result.get('outcode') or parsed.postcode_display or parsed.postcode
        districts = result.get('admin_district') or []
        if isinstance(districts, str):
            districts = [districts]
        district = districts[0] if districts else ''
        countries = result.get('country') or []
        if isinstance(countries, str):
            countries = [countries]
        country = countries[0] if countries else 'England'
        parts = [p for p in (outcode, district, country, 'United Kingdom') if p]
        return {
            'lat': str(result['latitude']),
            'lon': str(result['longitude']),
            'display_name': ', '.join(parts),
            'name': outcode,
            'type': 'postcode',
            'class': 'place',
            'importance': 0.75,
            'address': {
                'postcode': outcode,
                'city': district or '',
                'state': country or '',
                'country': 'United Kingdom',
                'country_code': 'gb',
            },
            '_source': 'postcodes_io',
        }

    try:
        if parsed.postcode_kind == 'outward':
            url = f"{POSTCODES_IO_BASE_URL}/outcodes/{code_path}"
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                body = resp.json() or {}
                result = body.get('result') or {}
                if result.get('latitude') is not None and result.get('longitude') is not None:
                    return [_outcode_result(result)]
            return []

        url = f"{POSTCODES_IO_BASE_URL}/postcodes/{code_path}"
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            body = resp.json() or {}
            result = body.get('result') or {}
            if result.get('latitude') is not None and result.get('longitude') is not None:
                return [_unit_result(result)]

        # Fallback: treat as outcode if unit lookup failed (e.g. LS1 typed alone
        # but somehow classified as unit — defensive).
        url = f"{POSTCODES_IO_BASE_URL}/outcodes/{code_path}"
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            body = resp.json() or {}
            result = body.get('result') or {}
            if result.get('latitude') is not None and result.get('longitude') is not None:
                return [_outcode_result(result)]
    except Exception as e:
        logger.debug(f"[Geocode] postcodes.io error: {e}")
    return []


def _has_house_number(query: str) -> bool:
    """Check if query likely contains a street number."""
    return query_has_house_number(query)


def _nominatim_search(params: dict, headers: dict) -> tuple:
    """Run Nominatim /search; returns (results, http_ok)."""
    url = f"{NOMINATIM_BASE_URL}/search"
    _nominatim_email_params(params)
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        if resp.status_code != 200:
            logger.warning('[Geocode] Nominatim HTTP %s', resp.status_code)
            return [], False
        raw = resp.json()
    except (requests.RequestException, ValueError) as error:
        # Expected upstream failures must still allow the existing fallback chain.
        # Do not expose provider URLs, query text or exception details to clients.
        logger.warning('[Geocode] Nominatim unavailable (%s)', type(error).__name__)
        return [], False
    if not isinstance(raw, list) or any(not isinstance(item, dict) for item in raw):
        logger.warning('[Geocode] Nominatim returned an invalid result list')
        return [], False
    return raw, True


def _tomtom_category_class(categories: list) -> tuple:
    """Map TomTom POI category ids to Nominatim-like (class, type)."""
    joined = ' '.join(str(c).lower() for c in (categories or []))
    if any(k in joined for k in ('shop', 'commercial', 'supermarket', 'market')):
        return 'shop', 'shop'
    if any(k in joined for k in ('eat', 'restaurant', 'cafe', 'coffee', 'fast')):
        return 'amenity', 'restaurant'
    if any(k in joined for k in ('hotel', 'motel', 'lodging')):
        return 'tourism', 'hotel'
    if any(k in joined for k in ('petrol', 'gas_station', 'fuel')):
        return 'amenity', 'fuel'
    if any(k in joined for k in ('parking',)):
        return 'amenity', 'parking'
    if any(k in joined for k in ('hospital', 'clinic', 'health')):
        return 'amenity', 'hospital'
    if any(k in joined for k in ('office', 'company', 'industrial')):
        return 'office', 'company'
    return 'amenity', 'poi'


def _tomtom_geocode(query: str, limit: int) -> list:
    """Use TomTom Fuzzy Search API for geocoding (house numbers + business POIs)."""
    api_key = os.getenv('TOMTOM_API_KEY', '')
    if not api_key:
        return []
    try:
        url = f"https://api.tomtom.com/search/2/search/{requests.utils.quote(query)}.json"
        params = {'key': api_key, 'limit': limit, 'language': NOMINATIM_LANGUAGE}
        country_set = NOMINATIM_COUNTRYCODES.upper() if NOMINATIM_COUNTRYCODES else ''
        if not country_set and looks_like_uk_postcode_query(query):
            country_set = 'GB'
        if country_set:
            params['countrySet'] = country_set
        # Prefer POIs when the query looks like a named business.
        parsed = parse_address_query(query)
        if parsed.is_business and not parsed.house_number:
            params['idxSet'] = 'POI,PAD,Addr,Str'
        resp = requests.get(url, params=params, timeout=8)
        if resp.status_code != 200:
            return []
        results = []
        for r in resp.json().get('results', []):
            pos = r.get('position', {})
            addr = r.get('address', {})
            if not pos.get('lat') or not pos.get('lon'):
                continue
            house_num = addr.get('streetNumber', '')
            street = addr.get('streetName', '')
            city = addr.get('municipality', '')
            country = addr.get('country', '')
            postcode = addr.get('postalCode') or addr.get('extendedPostalCode') or ''
            freeform = addr.get('freeformAddress', '')
            poi = r.get('poi') or {}
            poi_name = (poi.get('name') or '').strip()
            result_type = (r.get('type') or 'address').lower()
            categories = poi.get('categories') or []

            name_parts = []
            if house_num:
                name_parts.append(house_num)
            if street:
                name_parts.append(street)
            street_label = ' '.join(name_parts)

            # Prefer business/POI name so autocomplete can select shops as destinations.
            if poi_name and result_type == 'poi':
                name = poi_name
                if freeform and poi_name.lower() not in freeform.lower():
                    display_name = f"{poi_name}, {freeform}"
                else:
                    display_name = freeform or (
                        f"{poi_name}, {city}, {country}".strip(', ')
                    )
                rclass, rtype = _tomtom_category_class(categories)
            elif street_label:
                name = street_label
                display_name = freeform or f"{name}, {city}, {country}".strip(', ')
                rclass = ''
                rtype = result_type if result_type != 'poi' else 'address'
            else:
                name = freeform or poi_name or 'Location'
                display_name = freeform or f"{name}, {city}, {country}".strip(', ')
                if poi_name:
                    rclass, rtype = _tomtom_category_class(categories)
                else:
                    rclass = ''
                    rtype = result_type

            address_obj = {}
            if house_num:
                address_obj['house_number'] = house_num
            if street:
                address_obj['road'] = street
            if city:
                address_obj['city'] = city
            if country:
                address_obj['country'] = country
            if postcode:
                address_obj['postcode'] = postcode
            country_code = (addr.get('countryCode') or '').lower()
            if country_code:
                address_obj['country_code'] = country_code
            entry = {
                'lat': str(pos['lat']),
                'lon': str(pos['lon']),
                'display_name': display_name,
                'name': name,
                'type': rtype,
                'address': address_obj,
                '_source': 'tomtom',
            }
            if isinstance(r.get('id'), str) and len(r['id']) <= 128:
                entry['id'] = r['id']
            if isinstance(r.get('entryPoints'), list):
                entry['entry_points'] = []
                for candidate in r['entryPoints'][:8]:
                    position = candidate.get('position') if isinstance(candidate, dict) else None
                    if not isinstance(position, dict):
                        continue
                    lat, lon = position.get('lat'), position.get('lon')
                    if (all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in (lat, lon))
                            and abs(lat) <= 90 and abs(lon) <= 180):
                        entry['entry_points'].append({'lat': lat, 'lon': lon,
                            'type': candidate['type'][:40] if isinstance(candidate.get('type'), str) else 'unknown'})
            if rclass:
                entry['class'] = rclass
            results.append(entry)
        return results
    except Exception as e:
        logger.debug(f"[Geocode] TomTom fallback error: {e}")
        return []


@search_bp.route('/geocode', methods=['GET'])
def geocode():
    """
    Server-side geocoding proxy: queries postcodes.io for UK postcodes,
    Nominatim for general addresses and business/POI names, then TomTom when
    Nominatim is empty, fails HTTP, or throws; also merges TomTom for
    house-number queries with no Nominatim house match and for named businesses.

    Query params:
      - q: query string (required)
      - limit: number of results (default 8; max 10)
    Returns: Nominatim-style JSON array

    UK unit and outward postcodes (e.g. SW1A 1AA, LS1) resolve via
    postcodes.io when present, with Nominatim biased to countrycodes=gb.

    Supports start/destination search for:
      - Business / POI names (shops, amenities, offices)
      - Street addresses with house numbers
      - UK postcodes (unit and outward)
    """
    try:
        q = (request.args.get('q') or '').strip()
        if not q:
            return jsonify({'success': False, 'error': 'Missing q'}), 400

        try:
            limit = int(request.args.get('limit') or 8)
        except Exception:
            limit = 8
        limit = max(1, min(limit, 10))

        headers = _nominatim_headers()
        fetch_limit = max(limit, 10)
        parsed = parse_address_query(q)

        data: list = []
        nominatim_http_ok = False

        # Dedicated UK postcode provider first — reliable for unit + outward codes
        # even when Nominatim is rate-limited, self-hosted without GB data, or
        # returns foreign homonyms for short outcodes like LS1.
        if looks_like_uk_postcode_query(q) or parsed.postcode:
            pc_results = _postcodes_io_geocode(q)
            if pc_results:
                data = dedupe_results(pc_results)

        params = {
            'q': q,
            'format': 'json',
            'limit': str(fetch_limit),
            'addressdetails': '1',
            'namedetails': '1',
        }
        params.update(nominatim_extra_params_for_query(q))
        if NOMINATIM_COUNTRYCODES:
            params['countrycodes'] = NOMINATIM_COUNTRYCODES

        batch, ok = _nominatim_search(params, headers)
        if batch:
            data = dedupe_results(list(data) + list(batch))
        nominatim_http_ok = nominatim_http_ok or ok

        # UK free-text retry when empty and not already country-filtered.
        already_gb = (params.get('countrycodes') or '').lower() == 'gb'
        if (not data) and (',' not in q) and (not NOMINATIM_COUNTRYCODES) and (not already_gb):
            retry_params = dict(params)
            retry_params['q'] = f"{q}, United Kingdom"
            batch, ok = _nominatim_search(retry_params, headers)
            if batch:
                data = dedupe_results(list(batch) + list(data))
            nominatim_http_ok = nominatim_http_ok or ok
        elif (not data) and looks_like_uk_postcode_query(q) and not already_gb:
            retry_params = dict(params)
            retry_params['q'] = f"{q}, United Kingdom"
            retry_params['countrycodes'] = 'gb'
            batch, ok = _nominatim_search(retry_params, headers)
            if batch:
                data = dedupe_results(list(batch) + list(data))
            nominatim_http_ok = nominatim_http_ok or ok

        structured = build_nominatim_structured_params(parsed)
        if structured:
            if NOMINATIM_COUNTRYCODES:
                structured['countrycodes'] = NOMINATIM_COUNTRYCODES
            elif looks_like_uk_postcode_query(q) or parsed.postcode:
                structured['countrycodes'] = 'gb'
            batch, ok = _nominatim_search(structured, headers)
            if batch:
                data = dedupe_results(list(batch) + list(data))
            nominatim_http_ok = nominatim_http_ok or ok

        if os.getenv('TOMTOM_API_KEY', '').strip() and should_fetch_tomtom(q, data):
            tomtom_results = _tomtom_geocode(q, fetch_limit)
            if tomtom_results:
                data = dedupe_results(list(tomtom_results) + list(data))

        if not data and os.getenv('TOMTOM_API_KEY', '').strip():
            tomtom_fallback = _tomtom_geocode(q, fetch_limit)
            if tomtom_fallback:
                data = tomtom_fallback

        if data:
            ranked = rank_geocode_results(q, data)
            # Drop internal scoring metadata before JSON response
            for r in ranked:
                r.pop('_source', None)
            data = ranked[:limit]
        elif not nominatim_http_ok and not os.getenv('TOMTOM_API_KEY', '').strip():
            return jsonify({'success': False, 'error': 'Geocode failed (Nominatim unavailable)'}), 502

        out = jsonify(data if data else [])
        out.headers['Cache-Control'] = 'no-store'
        return out
    except Exception as e:
        logger.warning(f"[Geocode] Exception, trying TomTom: {e}")
        q_fb = (request.args.get('q') or '').strip()
        try:
            lim_fb = max(1, min(int(request.args.get('limit') or 8), 10))
        except Exception:
            lim_fb = 8
        try:
            if q_fb:
                tomtom_fallback = _tomtom_geocode(q_fb, lim_fb)
                if tomtom_fallback:
                    out = jsonify(tomtom_fallback[:lim_fb])
                    out.headers['Cache-Control'] = 'no-store'
                    return out
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)}), 500


@search_bp.route('/reverse-geocode', methods=['GET'])
def reverse_geocode():
    """
    Server-side reverse geocoding proxy (privacy).

    Query params:
      - lat: latitude (required)
      - lon: longitude (required)
    Returns: Nominatim reverse JSON object
    """
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        if lat is None or lon is None:
            return jsonify({'success': False, 'error': 'Missing lat/lon'}), 400

        url = f"{NOMINATIM_BASE_URL}/reverse"
        params = {
            'lat': lat,
            'lon': lon,
            'format': 'json',
            'addressdetails': '1',
        }
        _nominatim_email_params(params)
        headers = _nominatim_headers()
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        if resp.status_code != 200:
            return jsonify({'success': False, 'error': f'Reverse geocode failed (HTTP {resp.status_code})'}), 502

        out = jsonify(resp.json())
        out.headers['Cache-Control'] = 'no-store'
        return out
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _nominatim_poi_fallback(lat: float, lon: float, poi_type: str, radius: int, *, budgeted=False) -> Any:
    """Fallback POI search using Nominatim when Overpass fails."""
    try:
        url = f'{NOMINATIM_BASE_URL}/search'
        search_terms = {
            'fuel': 'petrol station',
            'food': 'restaurant',
            'charging': 'electric vehicle charging',
            'hospital': 'hospital',
            'pharmacy': 'pharmacy',
            'parking': 'parking',
            'groceries': 'supermarket',
            'supermarket': 'supermarket',
        }

        params = {
            'q': f'{search_terms.get(poi_type, poi_type)} near {lat},{lon}',
            'format': 'json',
            'limit': 15,
            'addressdetails': 1
        }
        _nominatim_email_params(params)

        headers = _nominatim_headers()
        response = (route_transport.get if budgeted else requests.get)(url, params=params, headers=headers, timeout=10)

        if response.status_code != 200:
            return jsonify({'success': False, 'error': 'POI search failed'})

        results = response.json()
        poi_list = []

        for result in results:
            try:
                if budgeted and ('lat' not in result or 'lon' not in result or
                                 isinstance(result['lat'], bool) or isinstance(result['lon'], bool)):
                    continue
                p_lat = float(result.get('lat', 0))
                p_lon = float(result.get('lon', 0))
                distance_m = get_distance_between_points(lat, lon, p_lat, p_lon)

                if distance_m > radius:
                    continue

                poi_list.append({
                    'name': result.get('name', result.get('display_name', 'Unknown')[:50]),
                    'lat': p_lat,
                    'lon': p_lon,
                    'distance_m': round(distance_m, 0),
                    'type': poi_type,
                    'address': result.get('display_name', '')
                })
            except (ValueError, KeyError, TypeError, OverflowError):
                continue

        poi_list.sort(key=lambda x: x['distance_m'])
        return jsonify({'success': True, 'results': poi_list[:15], 'type': poi_type, 'source': 'nominatim'})

    except route_transport.RoutingDeadlineExceeded:
        raise
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@search_bp.route('/arrival-access-evidence', methods=['POST'])
def arrival_access_evidence():
    """On-demand nearby map observations; isolated from route selection/live gates."""
    from voyagr.services.arrival_map_evidence import point, collect
    data = request.get_json(silent=True)
    target = point([data.get('lat'), data.get('lon')]) if isinstance(data, dict) else None
    parking_way_id = data.get('parking_way_id') if isinstance(data, dict) else None
    valid_identity = parking_way_id is None or type(parking_way_id) is int and 0 < parking_way_id <= 2**63 - 1
    if target is None or not valid_identity:
        response = jsonify(success=False, error='Valid arrival coordinates and an optional positive parking_way_id are required')
        response.status_code = 400
    else:
        evidence = collect(target, parking_way_id)
        if evidence is None:
            response = jsonify(success=False, error='Arrival map evidence is unavailable or incomplete')
            response.status_code = 503
        else:
            response = jsonify(success=True, evidence=evidence)
    response.headers['Cache-Control'] = 'no-store'
    return response


@search_bp.route('/arrival-parking-search', methods=['POST'])
def arrival_parking_search():
    """Parking candidates around an explicit destination, never map/current GPS centre."""
    from voyagr.services.routing.origin_integrity import coordinate
    from voyagr.services.arrival_parking import RADIUS_M, search_near_destination, filter_candidates, PRICE_PREFS
    data = request.get_json(silent=True)
    values = [data.get('lat'), data.get('lon')] if isinstance(data, dict) else []
    valid = len(values) == 2 and all(isinstance(n, (int, float)) and not isinstance(n, bool)
        and -bound <= n <= bound for n, bound in zip(values, (90, 180)))
    point = coordinate(values) if valid else None
    if point is None:
        return jsonify(success=False, error='A valid destination coordinate is required'), 400
    price = data.get('price_pref', 'any')
    if not isinstance(price, str) or price not in PRICE_PREFS:
        return jsonify(success=False, error='Unsupported parking price filter'), 400
    candidates = search_near_destination(*point)
    if candidates is not None:
        candidates = filter_candidates(candidates, price)
    if candidates is None:
        response = jsonify(success=False, error='Nearby parking search is temporarily unavailable')
        response.status_code = 503
    else:
        context = {
            'version': 1, 'coordinates': list(point), 'radius_m': RADIUS_M,
            'coverage': 'CANDIDATES_ONLY', 'source': 'overpass', 'ranking_policy': 'reported_access_name_distance_v1'}
        if 'price_pref' in data:
            context['price_pref'] = price
        response = jsonify(success=True, results=candidates[:10], search_context=context)
    response.headers['Cache-Control'] = 'no-store'
    return response


@search_bp.route('/parking-search', methods=['POST'])
def search_parking():
    """Search for parking near a destination using Overpass API (OSM)."""
    from voyagr.services.arrival_parking import search_near_destination, filter_candidates, PRICE_PREFS, PARKING_TYPES
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(success=False, error='Invalid parking search'), 400
    values = [data.get('lat'), data.get('lon')]
    from voyagr.services.arrival_map_evidence import point
    target = point(values)
    radius = data.get('radius', 800)
    price, kind = data.get('price_pref', 'any'), data.get('type', 'any')
    if (target is None or type(radius) is not int or not 1 <= radius <= 5000 or
            not isinstance(price, str) or price not in PRICE_PREFS or
            not isinstance(kind, str) or kind not in PARKING_TYPES):
        return jsonify(success=False, error='Invalid parking coordinates, radius or filters'), 400
    candidates = search_near_destination(*target, radius=radius)
    if candidates is None:
        response = jsonify(success=False, error='Parking search temporarily unavailable')
        response.status_code = 503
    else:
        rows = filter_candidates(candidates, price, kind)[:10]
        parking = [{**row, 'lat': float(row['lat']), 'lon': float(row['lon']),
                    'address': row['address']['road'] or 'Unknown'} for row in rows]
        response = jsonify(success=True, parking=parking)
    response.headers['Cache-Control'] = 'no-store'
    return response


def _tomtom_poi_search(lat: float, lon: float, poi_type: str, radius: int, *, budgeted=False) -> Any:
    """Search for POIs using TomTom Search API (primary source)."""
    tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')
    if not tomtom_api_key:
        return None

    tomtom_category_map = {
        'fuel': '7311',
        'food': '7315',
        'parking': '7369',
        'charging': '7309',
        'hospital': '7321',
        'pharmacy': '9361023',
        'atm': '7397',
        'supermarket': '7332',
        'groceries': '7332',
    }

    category_id = tomtom_category_map.get(poi_type)
    if not category_id:
        return None

    try:
        url = f"https://api.tomtom.com/search/2/categorySearch/{category_id}.json"
        params = {
            'key': tomtom_api_key,
            'lat': lat,
            'lon': lon,
            'radius': radius,
            'limit': 20,
            'language': 'en-GB',
        }
        resp = (route_transport.get if budgeted else requests.get)(url, params=params, timeout=5)
        if resp.status_code != 200:
            logger.warning(f"[POI-TomTom] API error: status={resp.status_code}")
            return None

        data = resp.json()
        results_list = data.get('results', [])
        if not results_list:
            return []

        poi_list = []
        for item in results_list[:200]:
            try:
                if budgeted and not isinstance(item, dict):
                    continue
                pos = item.get('position', {})
                if budgeted:
                    from voyagr.services.arrival_map_evidence import point
                    if not isinstance(pos,dict) or point([pos.get('lat'),pos.get('lon')]) is None:continue
                p_lat = float(pos.get('lat', 0))
                p_lon = float(pos.get('lon', 0))
                poi_info = item.get('poi', {})
                addr = item.get('address', {})
                distance_m = get_distance_between_points(lat, lon, p_lat, p_lon)

                poi_list.append({
                    'name': poi_info.get('name', f'{poi_type.title()}'),
                    'lat': p_lat,
                    'lon': p_lon,
                    'distance_m': round(distance_m, 0),
                    'type': poi_type,
                    'brand': poi_info.get('brands', [{}])[0].get('name', '') if poi_info.get('brands') else '',
                    'address': addr.get('freeformAddress', ''),
                    'opening_hours': '',
                    'phone': poi_info.get('phone', ''),
                    'url': poi_info.get('url', ''),
                    'amenity': poi_type,
                    'source': 'TomTom',
                })
            except (ValueError, KeyError, IndexError, TypeError, AttributeError) as e:
                logger.debug(f"[POI-TomTom] Error parsing result: {e}")
                continue

        poi_list.sort(key=lambda x: x['distance_m'])
        return poi_list[:20]

    except route_transport.RoutingDeadlineExceeded:
        raise
    except requests.exceptions.Timeout:
        logger.warning("[POI-TomTom] Request timed out")
        return None
    except Exception as e:
        logger.error(f"[POI-TomTom] Error: {e}")
        return None


def _candidate_poi_response(data, poi_type):
    """Nearby candidates share bounded admission, not category parsing."""
    from voyagr.services.arrival_map_evidence import point
    from voyagr.services import fuel_poi, food_poi, charging_poi, pharmacy_poi, hospital_poi, groceries_poi
    service = {'fuel': fuel_poi, 'food': food_poi, 'charging': charging_poi, 'pharmacy': pharmacy_poi, 'hospital': hospital_poi, 'groceries': groceries_poi}[poi_type]
    target = point([data.get('lat'), data.get('lon')])
    radius = data.get('radius', 2000)
    if target is None or type(radius) is not int or not 1 <= radius <= 5000:
        return jsonify(success=False, error=f'Invalid {poi_type} coordinates or radius'), 400
    parent = route_transport.current_budget()
    context = {
        'coordinates': target, 'radius_m': radius, 'coverage': 'CANDIDATES_ONLY',
        'distance_kind': 'STRAIGHT_LINE', 'opening_hours_verified': False, 'access_verified': False,
        **{
            'fuel': {'availability_verified': False},
            'food': {'dietary_suitability_verified': False},
            'charging': {'availability_verified': False, 'connector_compatibility_verified': False, 'charging_power_verified': False},
            'pharmacy': {'services_verified': False, 'stock_verified': False},
            'hospital': {'services_verified': False, 'emergency_services_verified': False},
            'groceries': {'stock_verified': False},
        }[poi_type],
    }

    def result(rows, source):
        response = jsonify(success=True, type=poi_type, results=rows, source=source, search_context=context)
        response.headers['Cache-Control'] = 'no-store'
        return response

    def unavailable():
        response = jsonify(success=False, type=poi_type, error=f'{poi_type.title()} search temporarily unavailable',
                           search_context={**context, 'coverage': 'UNKNOWN'})
        response.status_code = 503
        response.headers['Cache-Control'] = 'no-store'
        return response

    try:
        with route_transport.use_budget(route_transport.WorkBudget(18, parent=parent)) as budget:
            budget.check()
            rows = service.normalize_rows(_tomtom_poi_search(*target, poi_type, radius, budgeted=True),
                                          *target, radius, 'TomTom')
            budget.check()
            if rows:
                return result(rows, 'TomTom')
            rows = service.search_osm(*target, radius, context)
            budget.check()
            if rows is not None:
                return result(rows, 'Overpass')
            # Keep the last-resort provider without treating its empty response
            # as complete coverage after map acquisition failed.
            fallback = _nominatim_poi_fallback(*target, poi_type, radius, budgeted=True).get_json()
            budget.check()
            rows = service.normalize_rows(fallback.get('results') if fallback.get('success') is True else [],
                                          *target, radius, 'nominatim')
            if rows:
                return result(rows, 'nominatim')
            return unavailable()
    except route_transport.RoutingDeadlineExceeded:
        if parent is not None:
            parent.check()
        return unavailable()


@search_bp.route('/poi-search', methods=['POST'])
def search_poi():
    """Search for points of interest. Tries TomTom first, falls back to Overpass/Nominatim."""
    try:
        data = request.get_json(silent=True)
        if isinstance(data, dict) and data.get('type', 'fuel') in ('fuel', 'food', 'charging', 'pharmacy', 'hospital', 'groceries'):
            return _candidate_poi_response(data, data.get('type', 'fuel'))
        data = data or {}
        lat = float(data.get('lat', 0))
        lon = float(data.get('lon', 0))
        poi_type = data.get('type', 'fuel')
        radius = int(data.get('radius', 2000))
        if not 1<=radius<=5000: return jsonify(success=False,error='Radius must be between 1 and 5000 metres'),400

        if poi_type != 'parking' and (lat == 0 or lon == 0):
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        if poi_type == 'parking':
            # Parking POI uses the same mapped fee/access evidence as arrival search.
            from voyagr.services.arrival_map_evidence import point
            from voyagr.services.arrival_parking import search_near_destination, filter_candidates, PRICE_PREFS
            target = point([data.get('lat'), data.get('lon')])
            price = data.get('price_pref', 'any')
            if target is None or type(data.get('radius', 2000)) is not int or not isinstance(price, str) or price not in PRICE_PREFS:
                return jsonify(success=False, error='Invalid parking coordinates, radius or price filter'), 400
            metadata = {}
            candidates = search_near_destination(*target, radius=radius, metadata=metadata)
            if candidates is None:
                response = jsonify(success=False, error='Parking map search temporarily unavailable', source='Overpass')
                response.status_code = 503
            else:
                rows = filter_candidates(candidates, price)[:15]
                results = [{**row, 'lat': float(row['lat']), 'lon': float(row['lon']),
                            'address': row['address']['road']} for row in rows]
                response = jsonify(success=True, results=results, type='parking', source='Overpass',
                                   search_context={'coordinates': target, 'radius_m': radius, 'price_pref': price,
                                                   'coverage': 'CANDIDATES_ONLY', **metadata})
            response.headers['Cache-Control'] = 'no-store'
            return response

        # Try TomTom first (faster, richer data)
        tomtom_results = _tomtom_poi_search(lat, lon, poi_type, radius)
        if tomtom_results is not None:
            logger.info(f"[POI] TomTom returned {len(tomtom_results)} {poi_type} results")
            return jsonify({'success': True, 'results': tomtom_results[:15], 'type': poi_type, 'source': 'TomTom'})

        # Fallback to Overpass/Nominatim — OSM: many stores use shop=*, not amenity=*
        poi_amenity_tags = {
            'fuel': ['fuel'],
            'food': ['restaurant', 'fast_food', 'cafe'],
            'charging': ['charging_station'],
            'hospital': ['hospital', 'clinic'],
            'pharmacy': ['pharmacy'],
            'atm': ['atm', 'bank'],
            'parking': ['parking'],
            'supermarket': [],
            'groceries': [],
        }
        poi_shop_tags = {
            'supermarket': ['supermarket'],
            'groceries': ['supermarket', 'greengrocer', 'convenience'],
        }

        amenities = poi_amenity_tags.get(poi_type)
        if amenities is None:
            amenities = ['fuel']
        shops = list(poi_shop_tags.get(poi_type, []))

        from overpass_helper import query_overpass, build_poi_query
        query = build_poi_query(lat, lon, radius, amenities, shops)
        result = query_overpass(query, cache_ttl=300)
        if not result.get('success'):
            return _nominatim_poi_fallback(lat, lon, poi_type, radius)
        results = result['elements']
        cached = result.get('cached', False)

        if not results:
            return jsonify({'success': True, 'results': [], 'message': f'No {poi_type} found nearby'})

        poi_list = []
        for element in results:
            try:
                p_lat = float(element.get('lat', 0))
                p_lon = float(element.get('lon', 0))
                tags = element.get('tags', {})
                distance_m = get_distance_between_points(lat, lon, p_lat, p_lon)

                poi_list.append({
                    'name': tags.get('name', f'{poi_type.title()} Station'),
                    'lat': p_lat,
                    'lon': p_lon,
                    'distance_m': round(distance_m, 0),
                    'type': poi_type,
                    'brand': tags.get('brand', ''),
                    'address': tags.get('addr:street', '') + ' ' + tags.get('addr:city', ''),
                    'opening_hours': tags.get('opening_hours', ''),
                    'amenity': tags.get('amenity', poi_type)
                })
            except (ValueError, KeyError) as e:
                logger.debug(f"[POI] Error processing result: {e}")
                continue

        poi_list.sort(key=lambda x: x['distance_m'])
        logger.info(f"[POI] Found {len(poi_list)} {poi_type} locations (Overpass)")
        return jsonify({'success': True, 'results': poi_list[:15], 'type': poi_type, 'cached': cached, 'source': 'Overpass'})

    except route_transport.RoutingDeadlineExceeded:
        raise
    except Exception as e:
        logger.error(f"[POI] Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})


@search_bp.route('/poi-along-route', methods=['POST'])
def search_poi_along_route():
    """Search for POIs along a route by sampling points along the route polyline."""
    try:
        data = request.json
        route_points = data.get('route_points', [])
        poi_type = data.get('type', 'fuel')
        radius = int(data.get('radius', 1000))

        if not route_points or len(route_points) < 2:
            return jsonify({'success': False, 'error': 'Route points required'})

        total_pts = len(route_points)
        sample_indices = set()
        sample_indices.add(0)
        sample_indices.add(total_pts - 1)
        step = max(1, total_pts // 5)
        for i in range(step, total_pts - 1, step):
            sample_indices.add(i)
            if len(sample_indices) >= 6:
                break

        all_pois = {}
        for idx in sorted(sample_indices):
            pt = route_points[idx]
            pt_lat = float(pt[0]) if isinstance(pt, (list, tuple)) else float(pt.get('lat', 0))
            pt_lon = float(pt[1]) if isinstance(pt, (list, tuple)) else float(pt.get('lon', 0))

            tomtom_results = _tomtom_poi_search(pt_lat, pt_lon, poi_type, radius)
            if tomtom_results:
                for poi in tomtom_results:
                    key = f"{poi['lat']:.5f},{poi['lon']:.5f}"
                    if key not in all_pois:
                        all_pois[key] = poi

        poi_list = list(all_pois.values())

        if not poi_list:
            for idx in sorted(sample_indices)[:3]:
                pt = route_points[idx]
                pt_lat = float(pt[0]) if isinstance(pt, (list, tuple)) else float(pt.get('lat', 0))
                pt_lon = float(pt[1]) if isinstance(pt, (list, tuple)) else float(pt.get('lon', 0))
                fallback = _nominatim_poi_fallback(pt_lat, pt_lon, poi_type, radius)
                if fallback:
                    fb_data = fallback.get_json()
                    if fb_data.get('results'):
                        for poi in fb_data['results']:
                            key = f"{poi['lat']:.5f},{poi['lon']:.5f}"
                            if key not in all_pois:
                                all_pois[key] = poi
            poi_list = list(all_pois.values())

        logger.info(f"[POI-AlongRoute] Found {len(poi_list)} {poi_type} along route")
        return jsonify({'success': True, 'results': poi_list[:20], 'type': poi_type, 'source': 'TomTom+route'})

    except Exception as e:
        logger.error(f"[POI-AlongRoute] Error: {e}")
        return jsonify({'success': False, 'error': str(e)})


@search_bp.route('/search-history', methods=['GET', 'POST', 'DELETE'])
@require_private_user
def manage_search_history(_jwt_claims: Any = None):
    """Get, add, or clear search history."""
    conn = None
    try:
        user_id = (_jwt_claims or {}).get("sub") if isinstance(_jwt_claims, dict) else None
        if not user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute(
                'SELECT query, result_name, lat, lon FROM search_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20',
                (user_id,)
            )
            history = []
            for row in cursor.fetchall():
                history.append({
                    'query': row[0],
                    'result_name': row[1],
                    'lat': row[2],
                    'lon': row[3]
                })
            return jsonify({'success': True, 'history': history})

        elif request.method == 'POST':
            data = request.json
            query = sanitize_string(data.get('query', '').strip(), max_length=200)
            result_name = sanitize_string(data.get('result_name', ''), max_length=200) or ''
            lat = data.get('lat')
            lon = data.get('lon')

            if not query:
                return jsonify({'success': False, 'error': 'Query required'})

            cursor.execute(
                'INSERT INTO search_history (user_id, query, result_name, lat, lon) VALUES (?, ?, ?, ?, ?)',
                (user_id, query, result_name, lat, lon)
            )
            cursor.execute(
                'DELETE FROM search_history WHERE user_id = ? AND id NOT IN (SELECT id FROM search_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50)',
                (user_id, user_id)
            )
            conn.commit()
            return jsonify({'success': True, 'message': 'Search added to history'})

        elif request.method == 'DELETE':
            cursor.execute('DELETE FROM search_history WHERE user_id = ?', (user_id,))
            conn.commit()
            return jsonify({'success': True, 'message': 'Search history cleared'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@search_bp.route('/favorites', methods=['GET', 'POST', 'PUT', 'DELETE'])
@require_private_user
def manage_favorites(_jwt_claims: Any = None):
    """Get, add, update, or remove favorite locations."""
    conn = None
    try:
        user_id = (_jwt_claims or {}).get("sub") if isinstance(_jwt_claims, dict) else None
        if not user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute(
                'SELECT id, name, address, lat, lon, category FROM favorite_locations WHERE user_id = ? ORDER BY timestamp DESC',
                (user_id,)
            )
            favorites = []
            for row in cursor.fetchall():
                favorites.append({
                    'id': row[0],
                    'name': row[1],
                    'address': row[2],
                    'lat': row[3],
                    'lon': row[4],
                    'category': row[5]
                })
            return jsonify({'success': True, 'favorites': favorites})

        elif request.method == 'POST':
            data = request.json
            name = sanitize_string(data.get('name', '').strip(), max_length=100)
            address = sanitize_string(data.get('address', '').strip(), max_length=200) or ''
            lat = float(data.get('lat', 0))
            lon = float(data.get('lon', 0))
            category = sanitize_string(data.get('category', 'location').strip(), max_length=50) or 'location'

            if not name or lat == 0 or lon == 0:
                return jsonify({'success': False, 'error': 'Name and coordinates required'})

            cursor.execute(
                'INSERT INTO favorite_locations (user_id, name, address, lat, lon, category) VALUES (?, ?, ?, ?, ?, ?)',
                (user_id, name, address, lat, lon, category)
            )
            fav_id = cursor.lastrowid
            conn.commit()
            return jsonify({'success': True, 'favorite_id': fav_id, 'message': f'Added {name} to favorites'})

        elif request.method == 'PUT':
            data = request.json
            fav_id = data.get('id')
            name = sanitize_string(data.get('name', '').strip(), max_length=100)
            address = sanitize_string(data.get('address', '').strip(), max_length=200) or ''
            category = sanitize_string(data.get('category', 'location').strip(), max_length=50) or 'location'

            if not fav_id or not name:
                return jsonify({'success': False, 'error': 'ID and name required'})

            cursor.execute(
                'UPDATE favorite_locations SET name = ?, address = ?, category = ? WHERE id = ? AND user_id = ?',
                (name, address, category, fav_id, user_id)
            )
            conn.commit()
            return jsonify({'success': True, 'message': f'Updated {name}'})

        elif request.method == 'DELETE':
            data = request.json
            fav_id = data.get('id')

            if not fav_id:
                return jsonify({'success': False, 'error': 'Favorite ID required'})

            cursor.execute('DELETE FROM favorite_locations WHERE id = ? AND user_id = ?', (fav_id, user_id))
            conn.commit()
            return jsonify({'success': True, 'message': 'Favorite removed'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)

