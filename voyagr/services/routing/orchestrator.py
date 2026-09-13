"""
Valhalla routing orchestration helpers.

Extracts the pure Valhalla `/route` request-payload builders (primary, retry and
baseline) and response error-classification from ``voyagr_web.calculate_route``.
The HTTP call and route-assembly remain in the monolith for now (they are
return/jsonify-heavy and require live-engine verification to move safely).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:  # pragma: no cover - requests always present server-side
    requests = None

from voyagr.services.routing.costing import build_auto_costing_options

logger = logging.getLogger('voyagr_web')

# Stock Valhalla (and gis-ops docker images) default service_limits.max_alternates
# to 2. Requesting 3 is a 400 ("Exceeded max alternates") and used to take down
# every auto /api/route when GraphHopper/OSRM were also unavailable.
VALHALLA_MAX_ALTERNATES = 2
VALHALLA_MAX_EXCLUDE_LOCATIONS = 50
VALHALLA_DATETIME_FMT = '%Y-%m-%dT%H:%M'

_VALHALLA_ISO_LOCAL_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})')
_VALHALLA_HM_RE = re.compile(r'^(\d{1,2}):(\d{2})$')


@dataclass
class ValhallaPostOutcome:
    """Result of a Valhalla ``/route`` POST attempt (no Flask coupling)."""

    response: Optional[Any]
    error: Optional[str]
    timed_out: bool


def post_valhalla_route(url: str, payload: Dict[str, Any], headers: Dict[str, str], timeout: int) -> ValhallaPostOutcome:
    """
    POST a Valhalla ``/route`` request and classify transport-level failures.

    Mirrors the previous inline try/except in ``calculate_route``:
      - success/HTTP response  -> (response, None, False)
      - request timeout        -> (None, None, True)   [caller sets valhalla_error and falls back]
      - other request failure  -> (None, "Routing service unreachable: <e>", False)

    HTTP status handling and JSON parsing stay in the caller.
    """
    try:
        resp = requests.post(url, json=payload, timeout=timeout, headers=headers)
        return ValhallaPostOutcome(resp, None, False)
    except requests.exceptions.Timeout:
        return ValhallaPostOutcome(None, None, True)
    except requests.exceptions.RequestException as e:
        return ValhallaPostOutcome(None, f"Routing service unreachable: {str(e)}", False)


def valhalla_alternates_count(costing: str, has_waypoints: bool = False) -> int:
    """How many Valhalla alternates to request without exceeding service_limits."""
    return VALHALLA_MAX_ALTERNATES if (costing == 'auto' and not has_waypoints) else 0


def normalize_valhalla_datetime(value: Optional[Any], *, now: Optional[datetime] = None) -> Optional[str]:
    """
    Coerce a client departure time into Valhalla's ``YYYY-MM-DDTHH:MM``.

    ``datetime-local`` can include seconds; leftover ``HH:MM`` prefs and ISO
    strings with a timezone are also common. Sending any of those unparsed is
    HTTP 400 (invalid date_time). Unusable values return None so callers can fall
    back to "now" instead of forwarding the bad string.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    iso = _VALHALLA_ISO_LOCAL_RE.match(s)
    if iso:
        return f'{iso.group(1)}T{iso.group(2)}'
    hm = _VALHALLA_HM_RE.match(s)
    if hm:
        hour, minute = int(hm.group(1)), int(hm.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            base = now or datetime.now()
            return base.replace(hour=hour, minute=minute, second=0, microsecond=0).strftime(
                VALHALLA_DATETIME_FMT
            )
    try:
        parsed = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return parsed.strftime(VALHALLA_DATETIME_FMT)
    except ValueError:
        return None


def sanitize_valhalla_exclude_locations(
    exclude_locations: Optional[List[Dict[str, Any]]],
    max_locations: int = VALHALLA_MAX_EXCLUDE_LOCATIONS,
) -> List[Dict[str, float]]:
    """Keep only numeric lat/lon pairs, capped at Valhalla's exclude_locations limit (error 157)."""
    out: List[Dict[str, float]] = []
    for loc in exclude_locations or []:
        try:
            lat = float(loc['lat'])
            lon = float(loc['lon'])
        except (KeyError, TypeError, ValueError):
            continue
        if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
            out.append({'lat': lat, 'lon': lon})
        if len(out) >= max_locations:
            break
    return out


def describe_valhalla_http_error(response: Any) -> str:
    """Turn a non-200 Valhalla response into the valhalla_error string shown to the client."""
    status = getattr(response, 'status_code', None) or 'unknown'
    try:
        body = response.json()
        err = body.get('error')
        if err:
            return f'HTTP {status}: {err}'
    except Exception:
        pass
    text = (getattr(response, 'text', None) or '').strip()
    if text:
        return f'HTTP {status}: {text[:180]}'
    return f'HTTP {status}'


def attach_valhalla_datetime(
    payload: Dict[str, Any],
    departure_time: Optional[Any],
    now_str: Optional[str] = None,
) -> None:
    """Attach a Valhalla-legal date_time, falling back to now when the client value is unusable."""
    dt_value = normalize_valhalla_datetime(departure_time)
    if not dt_value:
        dt_value = now_str or datetime.now().strftime(VALHALLA_DATETIME_FMT)
    payload['date_time'] = {'type': 1, 'value': dt_value}


def apply_valhalla_mode_costing_options(
    payload: Dict[str, Any],
    valhalla_costing: str,
    *,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    avoid_unpaved: bool = False,
    route_optimization: str = 'fastest',
    log_auto: bool = False,
) -> None:
    """Attach mode-specific costing_options. Bicycle omits unknown keys (they 400 some builds)."""
    if valhalla_costing == 'pedestrian':
        payload['costing_options'] = {
            'pedestrian': {'walking_speed': 5.1, 'use_ferry': not avoid_ferries}
        }
    elif valhalla_costing == 'bicycle':
        payload['costing_options'] = {
            'bicycle': {'cycling_speed': 18, 'use_ferry': not avoid_ferries}
        }
    elif valhalla_costing in ('auto', 'auto_shorter'):
        auto_opts = build_auto_costing_options(
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            prefer_scenic=prefer_scenic,
            prefer_quiet=prefer_quiet,
            avoid_unpaved=avoid_unpaved,
            route_optimization=route_optimization,
        )
        if auto_opts:
            payload['costing_options'] = {valhalla_costing: auto_opts}
            if log_auto:
                logger.info(
                    f"[VALHALLA] auto costing opts: tolls={avoid_tolls} motorways={avoid_motorways} "
                    f"ferries={avoid_ferries} scenic={prefer_scenic} quiet={prefer_quiet} "
                    f"unpaved={avoid_unpaved} opt={route_optimization} → {auto_opts}"
                )


def build_valhalla_route_payload(
    *,
    route_locations: List[Dict[str, float]],
    has_waypoints: bool,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    valhalla_costing: str,
    avoid_tolls: bool,
    avoid_motorways: bool,
    avoid_ferries: bool,
    prefer_scenic: bool,
    prefer_quiet: bool,
    avoid_unpaved: bool,
    route_optimization: str,
    departure_time: Optional[Any],
    exclude_locations: Optional[List[Dict[str, float]]],
    now_str: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the Valhalla ``/route`` request payload (standard 2-point or waypoint routing).

    Mirrors the previous inline logic exactly: costing options per mode, time-dependent
    routing for auto, and exclude_locations. ``now_str`` is injected only for tests; when
    omitted the current time is used (auto mode, no explicit departure_time).
    """
    payload: Dict[str, Any] = {
        "locations": route_locations if has_waypoints else [
            {"lat": start_lat, "lon": start_lon},
            {"lat": end_lat, "lon": end_lon},
        ],
        "costing": valhalla_costing,
        "alternates": valhalla_alternates_count(valhalla_costing, has_waypoints),
        # Valhalla API: units/language at top level affect narration (turn-by-turn API reference)
        "units": "kilometers",
        "language": "en-GB",
        "generalize": 0,
    }

    apply_valhalla_mode_costing_options(
        payload,
        valhalla_costing,
        avoid_tolls=avoid_tolls,
        avoid_motorways=avoid_motorways,
        avoid_ferries=avoid_ferries,
        prefer_scenic=prefer_scenic,
        prefer_quiet=prefer_quiet,
        avoid_unpaved=avoid_unpaved,
        route_optimization=route_optimization,
        log_auto=True,
    )

    # Traffic-aware routing: use departure time for time-dependent routing (auto only)
    if valhalla_costing == 'auto':
        attach_valhalla_datetime(payload, departure_time, now_str=now_str)
        logger.info(f"[VALHALLA] Time-dependent routing with {payload['date_time']['value']}")

    cleaned = sanitize_valhalla_exclude_locations(exclude_locations)
    if cleaned:
        payload["exclude_locations"] = cleaned
        logger.debug(f"[VALHALLA] Added {len(cleaned)} exclude_locations to request")

    return payload


def build_valhalla_retry_payload(
    *,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    valhalla_costing: str,
    exclude_locations: List[Dict[str, float]],
    avoid_tolls: bool,
    avoid_motorways: bool,
    avoid_ferries: bool,
    prefer_scenic: bool,
    prefer_quiet: bool,
    avoid_unpaved: bool,
    route_optimization: str,
) -> Dict[str, Any]:
    """
    Build the reduced-exclusion retry payload for the "route not found" fallback.

    Mirrors the previous inline retry logic exactly: a simple 2-point request with
    the reduced exclude_locations and the same costing options as the primary
    request, but WITHOUT time-dependent routing (the retry omits ``date_time``).
    """
    payload: Dict[str, Any] = {
        "locations": [
            {"lat": start_lat, "lon": start_lon},
            {"lat": end_lat, "lon": end_lon},
        ],
        "costing": valhalla_costing,
        "alternates": valhalla_alternates_count(valhalla_costing),
        "units": "kilometers",
        "language": "en-GB",
        "generalize": 0,
    }
    cleaned = sanitize_valhalla_exclude_locations(exclude_locations)
    if cleaned:
        payload["exclude_locations"] = cleaned
    apply_valhalla_mode_costing_options(
        payload,
        valhalla_costing,
        avoid_tolls=avoid_tolls,
        avoid_motorways=avoid_motorways,
        avoid_ferries=avoid_ferries,
        prefer_scenic=prefer_scenic,
        prefer_quiet=prefer_quiet,
        avoid_unpaved=avoid_unpaved,
        route_optimization=route_optimization,
    )
    return payload


def build_valhalla_baseline_request_payload(
    *,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    route_locations: List[Dict[str, Any]],
    has_waypoints: bool,
    valhalla_costing: str,
    avoid_tolls: bool,
    avoid_motorways: bool,
    avoid_ferries: bool,
    departure_time: Optional[str],
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    avoid_unpaved: bool = False,
    route_optimization: str = 'fastest',
) -> Dict[str, Any]:
    """
    Valhalla /route JSON without exclude_locations — used when hazard-heavy requests fail (e.g. HTTP 400)
    but we still want Valhalla fastest + alternates alongside GraphHopper.
    """
    payload: Dict[str, Any] = {
        "locations": route_locations if has_waypoints else [
            {"lat": start_lat, "lon": start_lon},
            {"lat": end_lat, "lon": end_lon},
        ],
        "costing": valhalla_costing,
        "alternates": valhalla_alternates_count(valhalla_costing, has_waypoints),
        "units": "kilometers",
        "language": "en-GB",
        "generalize": 0,
    }
    apply_valhalla_mode_costing_options(
        payload,
        valhalla_costing,
        avoid_tolls=avoid_tolls,
        avoid_motorways=avoid_motorways,
        avoid_ferries=avoid_ferries,
        prefer_scenic=prefer_scenic,
        prefer_quiet=prefer_quiet,
        avoid_unpaved=avoid_unpaved,
        route_optimization=route_optimization,
    )

    if valhalla_costing == 'auto':
        attach_valhalla_datetime(payload, departure_time)
    return payload


def build_valhalla_minimal_request_payload(
    *,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    route_locations: Optional[List[Dict[str, Any]]] = None,
    has_waypoints: bool = False,
    valhalla_costing: str = 'auto',
) -> Dict[str, Any]:
    """
    Last-ditch Valhalla /route JSON: locations + costing only.

    Used when a richer payload is rejected (HTTP 400 from unknown language,
    missing timezone tiles on date_time, alternates over the service limit, etc.).
    Omitting date_time/language/alternates still returns a usable path.
    """
    return {
        "locations": route_locations if has_waypoints and route_locations else [
            {"lat": start_lat, "lon": start_lon},
            {"lat": end_lat, "lon": end_lon},
        ],
        "costing": valhalla_costing,
        "units": "kilometers",
    }


def classify_valhalla_route_data(route_data: Dict[str, Any]) -> Optional[str]:
    """
    Classify a parsed Valhalla HTTP-200 ``/route`` JSON body.

    Returns a ``valhalla_error`` string when the response is unusable (Valhalla
    reported an error, or there is no ``trip``), or ``None`` when the body looks
    usable. Pure — mirrors the previous inline checks in ``calculate_route`` so
    control flow in the caller is unchanged.
    """
    if 'error' in route_data:
        return f"Valhalla returned error: {route_data['error']}"
    if 'trip' not in route_data:
        return "Valhalla response missing 'trip' key"
    return None


def find_baseline_cameras_on_route(
    baseline_coords: List[Any],
    candidate_hazards: List[Dict[str, float]],
    max_candidates: int = 30,
    sample_step: int = 10,
    proximity_deg: float = 0.001,
) -> List[Dict[str, float]]:
    """
    Return the subset of ``candidate_hazards`` (Valhalla exclude_locations) that lie
    on/near the baseline route. Mirrors the previous inline Optimised-Discovery scan:
    the top ``max_candidates`` are checked against every ``sample_step``-th baseline
    coordinate, and kept when within ``proximity_deg`` (~100 m) of the route.
    """
    on_route: List[Dict[str, float]] = []
    for hazard in (candidate_hazards or [])[:max_candidates]:
        for coord in (baseline_coords or [])[::sample_step]:
            dist = ((hazard['lat'] - coord[0]) ** 2 + (hazard['lon'] - coord[1]) ** 2) ** 0.5
            if dist < proximity_deg:
                on_route.append(hazard)
                break
    return on_route


def build_valhalla_discovery_payload(
    *,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    exclude_locations: List[Dict[str, float]],
) -> Dict[str, Any]:
    """
    Build the Optimised-Discovery Valhalla payload: a plain 2-point auto request
    that aggressively excludes the baseline route's cameras. Mirrors the previous
    inline dict exactly (exclude_locations capped to 50 by the caller).
    """
    return {
        "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
        "costing": "auto",
        "exclude_locations": exclude_locations,
        "directions_options": {"generalize": 0},
    }


def build_route_success_response(
    routes: List[Dict[str, Any]],
    *,
    source: str,
    camera_avoidance_engine: str,
    total_stop_time: float,
    via_points_count: int,
    stops_count: int,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> Dict[str, Any]:
    """
    Build the /api/route success envelope from an ordered ``routes`` list.

    Single shared shape for the primary, retry and recovery paths (previously three
    drifted inline dicts). Top-level preview fields mirror ``routes[0]``; multi-drop
    totals, ``caz_details`` and the top-level hazard summary are always included so
    every success path returns a consistent body.
    """
    primary = routes[0] if routes else {}
    total_duration_with_stops = primary.get('duration_minutes', 0) + total_stop_time
    return {
        'success': True,
        'routes': routes,
        'source': source,
        'distance': f'{primary["distance_km"]:.2f} km',
        'time': f'{primary["duration_minutes"]:.0f} minutes',
        'total_time_with_stops': f'{total_duration_with_stops:.0f} minutes',
        'total_stop_time': total_stop_time,
        'via_points_count': via_points_count,
        'stops_count': stops_count,
        'geometry': primary['geometry'],
        'geometry_precision': primary.get('geometry_precision', 6),
        'fuel_cost': primary['fuel_cost'],
        'fuel_litres': primary.get('fuel_litres', 0),
        'toll_cost': primary['toll_cost'],
        'caz_cost': primary['caz_cost'],
        'caz_details': primary.get('caz_details', {}),
        'maneuvers': primary.get('maneuvers', []),
        'cached': False,
        'hazard_count': primary.get('hazard_count', 0),
        'hazard_penalty_seconds': primary.get('hazard_penalty_seconds', 0),
        'hazards': primary.get('hazards', []),
        'camera_avoidance_engine': camera_avoidance_engine,
        'start_lat': start_lat,
        'start_lon': start_lon,
        'end_lat': end_lat,
        'end_lon': end_lon,
    }
