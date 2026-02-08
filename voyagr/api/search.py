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


@search_bp.route('/geocode', methods=['GET'])
def geocode():
    """
    Server-side geocoding proxy (privacy): browser calls this endpoint, and the server queries Nominatim.

    Query params:
      - q: query string (required)
      - limit: number of results (default 8; max 10)
    Returns: Nominatim-style JSON array
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

        headers = {'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json', 'Accept-Language': NOMINATIM_LANGUAGE}
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        if resp.status_code != 200:
            return jsonify({'success': False, 'error': f'Geocode failed (HTTP {resp.status_code})'}), 502

        data = resp.json()
        # Quality fallback: if no results and query isn't obviously scoped, retry with UK suffix.
        if (not data) and (',' not in q) and (not NOMINATIM_COUNTRYCODES):
            retry_q = f"{q}, United Kingdom"
            params['q'] = retry_q
            resp2 = requests.get(url, params=params, headers=headers, timeout=10)
            if resp2.status_code == 200:
                data = resp2.json()

        out = jsonify(data)
        out.headers['Cache-Control'] = 'no-store'
        return out
    except Exception as e:
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
        headers = {'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json', 'Accept-Language': NOMINATIM_LANGUAGE}
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
            'pharmacy': 'pharmacy'
        }

        params = {
            'q': f'{search_terms.get(poi_type, poi_type)} near {lat},{lon}',
            'format': 'json',
            'limit': 15,
            'addressdetails': 1
        }

        headers = {'User-Agent': 'Voyagr-PWA/1.0'}
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
                    if price_pref == 'free' and fee_tag != 'no':
                        continue
                    elif price_pref == 'paid' and fee_tag != 'yes':
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


@search_bp.route('/poi-search', methods=['POST'])
def search_poi():
    """Search for points of interest (fuel stations, restaurants, etc.) near a location."""
    try:
        data = request.json
        lat = float(data.get('lat', 0))
        lon = float(data.get('lon', 0))
        poi_type = data.get('type', 'fuel')
        radius = int(data.get('radius', 2000))

        if lat == 0 or lon == 0:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        poi_mapping = {
            'fuel': ['fuel'],
            'food': ['restaurant', 'fast_food', 'cafe'],
            'charging': ['charging_station'],
            'hospital': ['hospital', 'clinic'],
            'pharmacy': ['pharmacy'],
            'atm': ['atm', 'bank'],
            'supermarket': ['supermarket']
        }

        amenities = poi_mapping.get(poi_type, ['fuel'])

        # Try to use overpass_helper if available
        try:
            from overpass_helper import query_overpass, build_poi_query
            OVERPASS_HELPER_AVAILABLE = True
        except ImportError:
            OVERPASS_HELPER_AVAILABLE = False

        if OVERPASS_HELPER_AVAILABLE:
            query = build_poi_query(lat, lon, radius, amenities)
            cache_key = f"poi_{poi_type}_{lat:.4f}_{lon:.4f}_{radius}"
            result = query_overpass(query, cache_key=cache_key, cache_ttl=300)

            if not result.get('success'):
                logger.warning(f"[POI] Overpass query failed: {result.get('error')}")
                return _nominatim_poi_fallback(lat, lon, poi_type, radius)

            results = result.get('elements', [])
            cached = result.get('cached', False)
        else:
            overpass_url = OVERPASS_API_URL
            amenity_queries = ''.join([
                f'node["amenity"="{a}"](around:{radius},{lat},{lon});' for a in amenities
            ])
            query = f'''
            [out:json][timeout:10];
            (
                {amenity_queries}
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
        logger.info(f"[POI] Found {len(poi_list)} {poi_type} locations")
        return jsonify({'success': True, 'results': poi_list[:15], 'type': poi_type, 'cached': cached})

    except Exception as e:
        logger.error(f"[POI] Error: {str(e)}")
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

