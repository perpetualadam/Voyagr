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
from typing import Any
from flask import Blueprint, jsonify, request

from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils import sanitize_string, require_private_user
from voyagr.utils.geometry import get_distance_between_points

logger = logging.getLogger(__name__)

search_bp = Blueprint('search', __name__)

NOMINATIM_BASE_URL = os.getenv('NOMINATIM_URL', 'https://nominatim.openstreetmap.org').strip().rstrip('/')
NOMINATIM_COUNTRYCODES = os.getenv('NOMINATIM_COUNTRYCODES', '').strip()
NOMINATIM_LANGUAGE = os.getenv('NOMINATIM_LANGUAGE', 'en').strip()
OVERPASS_API_URL = os.getenv('OVERPASS_API_URL', 'https://overpass-api.de/api/interpreter').strip()


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


def _has_house_number(query: str) -> bool:
    """Check if query likely contains a street number."""
    return bool(re.match(r'^\d+[\s,]', query.strip()))


def _tomtom_geocode(query: str, limit: int) -> list:
    """Use TomTom Fuzzy Search API for geocoding (better house-number matching)."""
    api_key = os.getenv('TOMTOM_API_KEY', '')
    if not api_key:
        return []
    try:
        url = f"https://api.tomtom.com/search/2/search/{requests.utils.quote(query)}.json"
        params = {'key': api_key, 'limit': limit, 'language': NOMINATIM_LANGUAGE}
        if NOMINATIM_COUNTRYCODES:
            params['countrySet'] = NOMINATIM_COUNTRYCODES.upper()
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
            freeform = addr.get('freeformAddress', '')
            name_parts = []
            if house_num:
                name_parts.append(house_num)
            if street:
                name_parts.append(street)
            name = ' '.join(name_parts) if name_parts else freeform or r.get('poi', {}).get('name', 'Location')
            address_obj = {}
            if house_num:
                address_obj['house_number'] = house_num
            if street:
                address_obj['road'] = street
            if city:
                address_obj['city'] = city
            if country:
                address_obj['country'] = country
            results.append({
                'lat': str(pos['lat']),
                'lon': str(pos['lon']),
                'display_name': freeform or f"{name}, {city}, {country}",
                'name': name,
                'type': r.get('type', 'address').lower(),
                'address': address_obj,
            })
        return results
    except Exception as e:
        logger.debug(f"[Geocode] TomTom fallback error: {e}")
        return []


@search_bp.route('/geocode', methods=['GET'])
def geocode():
    """
    Server-side geocoding proxy: queries Nominatim, then TomTom when Nominatim
    is empty, fails HTTP, or throws; also merges TomTom for house-number queries
    with no Nominatim house match.

    Query params:
      - q: query string (required)
      - limit: number of results (default 8; max 10)
    Returns: Nominatim-style JSON array

    Nominatim search features not used here (could improve business/POI lookup):
      structured forward geocode (street/city/postcode/country params instead of q);
      viewbox + bounded=1 for map-biased search; dedupe=1; extratags=1; namedetails=1;
      polygon_geojson / polygon_kml; layer= / featuretype= filters; /lookup by osm ids;
      /details endpoint; email= for usage policy. Reverse uses addressdetails only.
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

        url = f"{NOMINATIM_BASE_URL}/search"
        params = {
            'q': q,
            'format': 'json',
            'limit': str(limit),
            'addressdetails': '1',
        }
        if NOMINATIM_COUNTRYCODES:
            params['countrycodes'] = NOMINATIM_COUNTRYCODES
        _nominatim_email_params(params)

        headers = _nominatim_headers()
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        data: list = []
        if resp.status_code == 200:
            raw = resp.json()
            data = raw if isinstance(raw, list) else []
        else:
            logger.warning(f"[Geocode] Nominatim HTTP {resp.status_code} for q={q[:80]!r}")

        if (not data) and (',' not in q) and (not NOMINATIM_COUNTRYCODES):
            retry_q = f"{q}, United Kingdom"
            params['q'] = retry_q
            _nominatim_email_params(params)
            resp2 = requests.get(url, params=params, headers=headers, timeout=10)
            if resp2.status_code == 200:
                raw2 = resp2.json()
                data = raw2 if isinstance(raw2, list) else []

        query_has_number = _has_house_number(q)
        nominatim_has_match = any(
            r.get('address', {}).get('house_number') for r in (data or [])
        )

        if query_has_number and not nominatim_has_match:
            tomtom_results = _tomtom_geocode(q, limit)
            if tomtom_results:
                seen = set()
                for r in (data or []):
                    key = (round(float(r.get('lat', 0)), 4), round(float(r.get('lon', 0)), 4))
                    seen.add(key)
                for tr in tomtom_results:
                    key = (round(float(tr['lat']), 4), round(float(tr['lon']), 4))
                    if key not in seen:
                        data.insert(0, tr)
                        seen.add(key)

        if not data:
            tomtom_fallback = _tomtom_geocode(q, limit)
            if tomtom_fallback:
                data = tomtom_fallback

        if not data and resp.status_code != 200:
            return jsonify({'success': False, 'error': f'Geocode failed (HTTP {resp.status_code})'}), 502

        out = jsonify(data[:limit] if data else [])
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


def _nominatim_poi_fallback(lat: float, lon: float, poi_type: str, radius: int) -> Any:
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
        response = requests.get(url, params=params, headers=headers, timeout=10)

        if response.status_code != 200:
            return jsonify({'success': False, 'error': 'POI search failed'})

        results = response.json()
        poi_list = []

        for result in results:
            try:
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
            except (ValueError, KeyError):
                continue

        poi_list.sort(key=lambda x: x['distance_m'])
        return jsonify({'success': True, 'results': poi_list[:15], 'type': poi_type, 'source': 'nominatim'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@search_bp.route('/parking-search', methods=['POST'])
def search_parking():
    """Search for parking near a destination using Overpass API (OSM)."""
    try:
        data = request.json
        lat = float(data.get('lat', 0))
        lon = float(data.get('lon', 0))
        radius = int(data.get('radius', 800))
        parking_type = data.get('type', 'any')
        price_pref = data.get('price', 'any')

        if lat == 0 or lon == 0:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        url = OVERPASS_API_URL
        overpass_query = f"""
        [out:json][timeout:5];
        (
          node["amenity"="parking"](around:{radius},{lat},{lon});
          way["amenity"="parking"](around:{radius},{lat},{lon});
        );
        out center tags {min(20, radius // 50)};
        """

        logger.info(f"[Parking] Querying Overpass API for parking near ({lat},{lon}) radius={radius}m")

        elements = []
        try:
            response = requests.post(url, data={'data': overpass_query}, timeout=10)
            if response.status_code == 429:
                time.sleep(2)
                response = requests.post(url, data={'data': overpass_query}, timeout=10)

            if response.status_code == 200:
                results = response.json()
                elements = results.get('elements', [])
                logger.info(f"[Parking] Overpass API returned {len(elements)} elements")
        except requests.exceptions.Timeout:
            logger.warning(f"[Parking] Overpass API timeout")
        except requests.exceptions.RequestException as e:
            logger.warning(f"[Parking] Overpass API request failed: {str(e)}")

        if not elements:
            return jsonify({'success': True, 'parking': []})

        parking_list = []
        for element in elements:
            try:
                tags = element.get('tags', {})
                if element.get('type') == 'node':
                    p_lat = float(element.get('lat', 0))
                    p_lon = float(element.get('lon', 0))
                elif element.get('type') == 'way' and 'center' in element:
                    p_lat = float(element['center'].get('lat', 0))
                    p_lon = float(element['center'].get('lon', 0))
                else:
                    continue

                distance_m = math.sqrt((p_lat - lat)**2 + (p_lon - lon)**2) * 111000
                if distance_m > radius:
                    continue

                # Filter by parking type if specified
                if parking_type != 'any':
                    parking_subtype = tags.get('parking', '').lower()
                    if parking_type == 'garage' and parking_subtype not in ['multi-storey', 'underground']:
                        continue
                    elif parking_type == 'street' and parking_subtype not in ['street_side', 'lane', 'on_street']:
                        continue
                    elif parking_type == 'lot' and parking_subtype not in ['surface', 'lot']:
                        continue

                # Filter by price preference
                if price_pref != 'any':
                    fee_tag = tags.get('fee', '').lower()
                    parking_subtype = tags.get('parking', '').lower()
                    if price_pref == 'free' and fee_tag != 'no':
                        continue
                    elif price_pref == 'paid' and fee_tag != 'yes':
                        continue
                    elif price_pref == 'free_street' and (
                        fee_tag != 'no'
                        or parking_subtype not in ['street_side', 'lane', 'on_street']
                    ):
                        continue

                name = tags.get('name', 'Parking')
                fee_tag = tags.get('fee', '')
                suffix_parts = []
                if fee_tag == 'no':
                    suffix_parts.append('Free')
                elif fee_tag == 'yes':
                    suffix_parts.append('Paid')
                if suffix_parts:
                    name += ' (' + ', '.join(suffix_parts) + ')'

                parking_list.append({
                    'name': name,
                    'lat': p_lat,
                    'lon': p_lon,
                    'distance_m': distance_m,
                    'address': tags.get('addr:street', '') or tags.get('operator', '') or 'Unknown',
                    'type': 'parking',
                    'fee': fee_tag,
                    'parking_type': tags.get('parking', 'unknown'),
                    'access': tags.get('access', ''),
                    'capacity': tags.get('capacity', '')
                })
            except (ValueError, KeyError) as e:
                logger.debug(f"[Parking] Error processing element: {e}")
                continue

        parking_list.sort(key=lambda x: x['distance_m'])
        logger.info(f"[Parking] Found {len(parking_list)} parking options")
        return jsonify({'success': True, 'parking': parking_list[:10]})

    except Exception as e:
        logger.error(f"[Parking] Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})


def _tomtom_poi_search(lat: float, lon: float, poi_type: str, radius: int) -> Any:
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
        resp = requests.get(url, params=params, timeout=5)
        if resp.status_code != 200:
            logger.warning(f"[POI-TomTom] API error: status={resp.status_code}")
            return None

        data = resp.json()
        results_list = data.get('results', [])
        if not results_list:
            return []

        poi_list = []
        for item in results_list:
            try:
                pos = item.get('position', {})
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
            except (ValueError, KeyError, IndexError) as e:
                logger.debug(f"[POI-TomTom] Error parsing result: {e}")
                continue

        poi_list.sort(key=lambda x: x['distance_m'])
        return poi_list[:20]

    except requests.exceptions.Timeout:
        logger.warning("[POI-TomTom] Request timed out")
        return None
    except Exception as e:
        logger.error(f"[POI-TomTom] Error: {e}")
        return None


@search_bp.route('/poi-search', methods=['POST'])
def search_poi():
    """Search for points of interest. Tries TomTom first, falls back to Overpass/Nominatim."""
    try:
        data = request.json
        lat = float(data.get('lat', 0))
        lon = float(data.get('lon', 0))
        poi_type = data.get('type', 'fuel')
        radius = int(data.get('radius', 2000))

        if lat == 0 or lon == 0:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

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

        try:
            from overpass_helper import query_overpass, build_poi_query
            OVERPASS_HELPER_AVAILABLE = True
        except ImportError:
            OVERPASS_HELPER_AVAILABLE = False

        if OVERPASS_HELPER_AVAILABLE:
            query = build_poi_query(lat, lon, radius, amenities, shops)
            cache_key = f"poi_{poi_type}_{lat:.4f}_{lon:.4f}_{radius}"
            result = query_overpass(query, cache_key=cache_key, cache_ttl=300)

            if not result.get('success'):
                return _nominatim_poi_fallback(lat, lon, poi_type, radius)

            results = result.get('elements', [])
            cached = result.get('cached', False)
        else:
            overpass_url = OVERPASS_API_URL
            amenity_queries = ''.join([
                f'node["amenity"="{a}"](around:{radius},{lat},{lon});' for a in amenities
            ])
            shop_queries = ''.join([
                f'node["shop"="{s}"](around:{radius},{lat},{lon});' for s in shops
            ])
            query = f'''
            [out:json][timeout:10];
            (
                {amenity_queries}{shop_queries}
            );
            out body;
            '''
            response = requests.post(overpass_url, data={'data': query}, timeout=15)
            if response.status_code != 200:
                return _nominatim_poi_fallback(lat, lon, poi_type, radius)
            results = response.json().get('elements', [])
            cached = False

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

