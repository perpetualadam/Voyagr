"""Parse and normalize a POST /api/route request body.

Extracted verbatim from ``voyagr_web.calculate_route`` so the (pure) request
parsing — defaults, clamping, avoid-point validation, cost-param resolution and
coordinate parsing — can be unit-tested offline and reused by the multi-stop
handler. No network or DB access; behaviour matches the previous inline block.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from voyagr.config.rates import resolve_route_cost_params
from voyagr.services.routing.costing import VALID_ROUTE_OPTIMIZATIONS
from voyagr.utils.validation import validate_coordinates


@dataclass
class RouteRequestParams:
    """Normalized /api/route parameters (parsed from the raw request JSON)."""

    start: str
    end: str
    routing_mode: str
    valhalla_costing: str
    vehicle_type: str
    fuel_efficiency: float
    fuel_price: float
    energy_efficiency: float
    electricity_price: float
    include_tolls: bool
    include_caz: bool
    caz_exempt: bool
    avoid_caz: bool
    enable_hazard_avoidance: bool
    avoid_traffic_lights: bool
    avoid_railway_crossings: bool
    avoid_cameras: bool
    apply_caz_routing_avoidance: bool
    avoid_tolls: bool
    avoid_motorways: bool
    avoid_ferries: bool
    prefer_scenic: bool
    prefer_quiet: bool
    avoid_unpaved: bool
    route_optimization: str
    max_detour: int
    avoid_points: List[Dict[str, float]]
    via_points: List[Any]
    stops: List[Any]
    optimize_stop_order: bool
    round_trip: bool
    departure_time: Optional[Any]
    time_windows: Optional[Any]
    total_stop_time: float
    start_coords: Tuple[float, float]
    end_coords: Tuple[float, float]
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float


def parse_route_request(data: Dict[str, Any]) -> RouteRequestParams:
    """
    Parse a validated /api/route request body into normalized parameters.

    Assumes ``validate_route_request(data)`` already passed (start/end present and
    valid coordinates). Mirrors the previous inline logic exactly, including the
    ``enable_hazard_avoidance`` promotion when explicit avoid_points are supplied.
    """
    start = data.get('start', '').strip()
    end = data.get('end', '').strip()
    routing_mode = data.get('routing_mode', 'auto')
    # Valhalla costing: must be auto, pedestrian, or bicycle for correct routes/ETAs
    valhalla_costing = routing_mode if routing_mode in ('auto', 'pedestrian', 'bicycle') else 'auto'
    vehicle_type = data.get('vehicle_type', 'petrol_diesel')
    cost_params = resolve_route_cost_params(data)
    fuel_efficiency = cost_params['fuel_efficiency']
    fuel_price = cost_params['fuel_price']
    energy_efficiency = cost_params['energy_efficiency']
    electricity_price = cost_params['electricity_price']
    include_tolls = data.get('include_tolls', True)
    include_caz = data.get('include_caz', True)
    caz_exempt = data.get('caz_exempt', False)
    avoid_caz = data.get('avoid_caz', True)
    enable_hazard_avoidance = data.get('enable_hazard_avoidance', False)
    avoid_traffic_lights = data.get('avoid_traffic_lights', True)
    avoid_railway_crossings = data.get('avoid_railway_crossings', True)
    avoid_cameras = data.get('avoid_cameras', True)

    # Align with calculate_caz_cost: no routing penalties when exempt or fully electric
    apply_caz_routing_avoidance = bool(
        avoid_caz and not caz_exempt and vehicle_type != 'electric'
    )

    # Route avoidance preferences (Valhalla costing options)
    avoid_tolls = data.get('avoid_tolls', False)
    avoid_motorways = data.get('avoid_motorways', False)
    avoid_ferries = data.get('avoid_ferries', False)

    # Additional Route Preferences (translated into Valhalla auto costing options).
    # All are optional and default to 'off'/'fastest' — preserving previous behaviour
    # for clients that don't send them.
    prefer_scenic = bool(data.get('prefer_scenic', False))
    prefer_quiet = bool(data.get('prefer_quiet', False))
    avoid_unpaved = bool(data.get('avoid_unpaved', False))
    route_optimization = str(data.get('route_optimization', 'fastest') or 'fastest').lower()
    if route_optimization not in VALID_ROUTE_OPTIMIZATIONS:
        route_optimization = 'fastest'
    try:
        max_detour = int(data.get('max_detour', 20))
    except (TypeError, ValueError):
        max_detour = 20
    max_detour = max(0, min(100, max_detour))

    # Explicit avoid points: lat/lon of congested or closed segments detected during
    # navigation (Lever A traffic reroute). They are fed into the same exclude_locations
    # pipeline as live incidents so Valhalla routes around them. Capped to keep within
    # Valhalla's 50-avoid limit and validated to ignore garbage.
    raw_avoid_points = data.get('avoid_points', []) or []
    avoid_points: List[Dict[str, float]] = []
    if isinstance(raw_avoid_points, list):
        for ap in raw_avoid_points[:10]:
            try:
                alat = float(ap.get('lat'))
                alon = float(ap.get('lon'))
            except (TypeError, ValueError, AttributeError):
                continue
            if -90.0 <= alat <= 90.0 and -180.0 <= alon <= 180.0:
                avoid_points.append({'lat': alat, 'lon': alon})
    if avoid_points:
        # An explicit avoid request only makes sense with the exclusion path active.
        enable_hazard_avoidance = True

    # VIA-POINTS AND STOPS
    via_points = data.get('via_points', [])  # [{lat, lon, name, type: 'via'}]
    stops = data.get('stops', [])  # [{lat, lon, name, type: 'stop', duration: 15}]

    # Multi-drop settings from frontend
    optimize_stop_order = data.get('optimize_stop_order', False)
    round_trip = data.get('round_trip', False)
    departure_time = data.get('departure_time')
    time_windows = data.get('time_windows')

    # Calculate total stop time
    total_stop_time = sum(s.get('duration', 15) for s in stops)

    # Parse coordinates (validate_route_request already guaranteed these are valid)
    start_coords = validate_coordinates(start)
    end_coords = validate_coordinates(end)
    start_lat, start_lon = start_coords
    end_lat, end_lon = end_coords

    return RouteRequestParams(
        start=start,
        end=end,
        routing_mode=routing_mode,
        valhalla_costing=valhalla_costing,
        vehicle_type=vehicle_type,
        fuel_efficiency=fuel_efficiency,
        fuel_price=fuel_price,
        energy_efficiency=energy_efficiency,
        electricity_price=electricity_price,
        include_tolls=include_tolls,
        include_caz=include_caz,
        caz_exempt=caz_exempt,
        avoid_caz=avoid_caz,
        enable_hazard_avoidance=enable_hazard_avoidance,
        avoid_traffic_lights=avoid_traffic_lights,
        avoid_railway_crossings=avoid_railway_crossings,
        avoid_cameras=avoid_cameras,
        apply_caz_routing_avoidance=apply_caz_routing_avoidance,
        avoid_tolls=avoid_tolls,
        avoid_motorways=avoid_motorways,
        avoid_ferries=avoid_ferries,
        prefer_scenic=prefer_scenic,
        prefer_quiet=prefer_quiet,
        avoid_unpaved=avoid_unpaved,
        route_optimization=route_optimization,
        max_detour=max_detour,
        avoid_points=avoid_points,
        via_points=via_points,
        stops=stops,
        optimize_stop_order=optimize_stop_order,
        round_trip=round_trip,
        departure_time=departure_time,
        time_windows=time_windows,
        total_stop_time=total_stop_time,
        start_coords=start_coords,
        end_coords=end_coords,
        start_lat=start_lat,
        start_lon=start_lon,
        end_lat=end_lat,
        end_lon=end_lon,
    )
