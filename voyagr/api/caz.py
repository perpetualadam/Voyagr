"""
CAZ (Clean Air Zone) blueprint for Voyagr.

Contains:
- CAZ zones listing
- CAZ pass types
- CAZ route checking
- Charging stations
"""

import logging
import requests
from flask import Blueprint, jsonify, request

from voyagr.config import CAZ_ZONES_DATA, CAZ_PASS_TYPES
from voyagr.services import check_route_in_caz

logger = logging.getLogger(__name__)

caz_bp = Blueprint('caz', __name__)


@caz_bp.route('/caz-zones', methods=['GET'])
def get_caz_zones():
    """Get all CAZ zones with their details, pricing, passes, and exemptions."""
    try:
        zones = []
        for zone_id, zone_data in CAZ_ZONES_DATA.items():
            zones.append({
                'id': zone_id,
                'name': zone_data['name'],
                'city': zone_data['city'],
                'type': zone_data['type'],
                'daily_charge': zone_data['daily_charge'],
                'currency': zone_data['currency'],
                'operating_hours': zone_data.get('operating_hours', '00:00-23:59'),
                'operating_days': zone_data.get('operating_days', 'Daily'),
                'passes': zone_data.get('passes', {}),
                'exemptions': zone_data.get('exemptions', []),
                'vehicle_requirements': zone_data.get('vehicle_requirements', {}),
                'purchase_url': zone_data.get('purchase_url', '')
            })
        return jsonify({'success': True, 'zones': zones, 'count': len(zones)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@caz_bp.route('/caz-pass-types', methods=['GET'])
def get_caz_pass_types():
    """Get all available CAZ pass and exemption types."""
    try:
        return jsonify({'success': True, 'pass_types': CAZ_PASS_TYPES})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@caz_bp.route('/caz-check', methods=['POST'])
def check_caz_for_route():
    """Check if a route passes through CAZ zones and calculate charges."""
    try:
        data = request.get_json()
        route_coords = data.get('route_coords', [])
        vehicle_caz_pass = data.get('vehicle_caz_pass', 'none')
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')

        if not route_coords:
            return jsonify({'success': True, 'caz_result': {
                'zones_crossed': [],
                'total_charge': 0.0,
                'is_exempt': False,
                'pass_covers': False,
                'zone_details': []
            }})

        caz_result = check_route_in_caz(route_coords, vehicle_caz_pass)

        if vehicle_type == 'electric':
            caz_result['is_exempt'] = True
            caz_result['total_charge'] = 0.0

        return jsonify({'success': True, 'caz_result': caz_result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@caz_bp.route('/charging-stations', methods=['GET'])
def get_charging_stations():
    """Get nearby charging stations using OpenChargeMap API."""
    try:
        try:
            lat = float(request.args.get('lat', 51.5074))
            lon = float(request.args.get('lon', -0.1278))
            radius_km = float(request.args.get('radius', 5))

            if lat < -90 or lat > 90 or lon < -180 or lon > 180:
                return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400

            if radius_km < 0.1 or radius_km > 100:
                return jsonify({'success': False, 'error': 'Radius must be between 0.1 and 100 km'}), 400
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Invalid numeric parameters'}), 400

        ocm_url = "https://api.openchargemap.io/v3/poi/"
        params = {
            'output': 'json',
            'latitude': lat,
            'longitude': lon,
            'distance': radius_km,
            'distanceunit': 'km',
            'maxresults': 50,
            'compact': 'true',
            'verbose': 'false'
        }

        try:
            response = requests.get(ocm_url, params=params, timeout=10)
            if response.status_code == 200:
                ocm_data = response.json()
                stations = []

                for poi in ocm_data:
                    addr = poi.get('AddressInfo', {})
                    connections = poi.get('Connections', [])

                    connector_type = 'Unknown'
                    power_kw = 0
                    for conn in connections:
                        conn_type = conn.get('ConnectionType', {})
                        if conn_type:
                            connector_type = conn_type.get('Title', 'Unknown')
                        if conn.get('PowerKW'):
                            power_kw = max(power_kw, conn.get('PowerKW', 0))

                    status_type = poi.get('StatusType', {})
                    is_operational = status_type.get('IsOperational', True) if status_type else True
                    availability = 'available' if is_operational else 'unavailable'

                    operator = poi.get('OperatorInfo', {})
                    operator_name = operator.get('Title', '') if operator else ''

                    station_name = addr.get('Title', 'Charging Station')
                    if operator_name and operator_name not in station_name:
                        station_name = f"{operator_name} - {station_name}"

                    stations.append({
                        'id': poi.get('ID', 0),
                        'name': station_name[:100],
                        'lat': addr.get('Latitude', lat),
                        'lon': addr.get('Longitude', lon),
                        'connector': connector_type,
                        'power_kw': power_kw or 7,
                        'cost_per_kwh': 0.35,
                        'availability': availability,
                        'address': addr.get('AddressLine1', ''),
                        'town': addr.get('Town', ''),
                        'postcode': addr.get('Postcode', ''),
                        'distance_km': addr.get('Distance', 0),
                        'num_points': len(connections)
                    })

                logger.info(f"[CHARGING] Found {len(stations)} stations near ({lat},{lon}) within {radius_km}km")
                return jsonify({'success': True, 'stations': stations, 'source': 'openchargemap'})
            else:
                logger.warning(f"[CHARGING] OpenChargeMap API returned {response.status_code}")
                raise requests.exceptions.RequestException("API error")

        except requests.exceptions.RequestException as api_error:
            logger.warning(f"[CHARGING] OpenChargeMap API failed: {api_error}, using fallback data")
            stations = [
                {'id': 1, 'name': 'Tesla Supercharger', 'lat': lat + 0.01, 'lon': lon + 0.01,
                 'connector': 'Tesla', 'power_kw': 150, 'cost_per_kwh': 0.35, 'availability': 'available'},
                {'id': 2, 'name': 'BP Pulse', 'lat': lat - 0.01, 'lon': lon - 0.01,
                 'connector': 'CCS', 'power_kw': 50, 'cost_per_kwh': 0.40, 'availability': 'available'},
                {'id': 3, 'name': 'Pod Point', 'lat': lat + 0.02, 'lon': lon - 0.02,
                 'connector': 'Type 2', 'power_kw': 22, 'cost_per_kwh': 0.30, 'availability': 'busy'}
            ]
            return jsonify({'success': True, 'stations': stations, 'source': 'fallback'})

    except Exception as e:
        logger.error(f"[CHARGING] Error: {e}")
        return jsonify({'success': False, 'error': str(e)})

