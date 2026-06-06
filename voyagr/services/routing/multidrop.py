"""
Multi-drop route optimization for Voyagr.

Provides TSP-style optimization for routes with multiple stops using:
- Nearest-neighbor heuristic for initial solution
- 2-opt improvement for local optimization
- Optional round-trip (return to origin)
- Time window constraints per stop
- Traffic-aware distance matrix via routing engine
"""

import logging
import math
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from voyagr.config import VALHALLA_URL, OSRM_URL, GRAPHHOPPER_URL, USE_GRAPHHOPPER_CAMERA_AVOIDANCE, GRAPHHOPPER_TIMEOUT
from voyagr.services.routing.costing import build_auto_costing_options

logger = logging.getLogger('voyagr_web')


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _valhalla_matrix(locations: List[Dict[str, float]]) -> Optional[List[List[float]]]:
    """
    Get a time-distance matrix from Valhalla's sources_to_targets endpoint.
    Returns matrix of durations in seconds, or None on failure.
    """
    try:
        url = f"{VALHALLA_URL}/sources_to_targets"
        sources = [{"lat": loc["lat"], "lon": loc["lon"]} for loc in locations]
        payload = {
            "sources": sources,
            "targets": sources,
            "costing": "auto",
        }
        resp = requests.post(url, json=payload, timeout=15,
                             headers={"Content-Type": "application/json",
                                      "User-Agent": "Voyagr-PWA/1.0"})
        if resp.status_code == 200:
            data = resp.json()
            matrix = []
            for row in data.get("sources_to_targets", []):
                matrix.append([cell.get("time", 999999) for cell in row])
            return matrix
    except Exception as e:
        logger.warning(f"[MULTIDROP] Valhalla matrix failed: {e}")
    return None


def _haversine_matrix(locations: List[Dict[str, float]]) -> List[List[float]]:
    """Fallback distance matrix using haversine (returns estimated seconds)."""
    n = len(locations)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                dist_km = haversine_km(
                    locations[i]["lat"], locations[i]["lon"],
                    locations[j]["lat"], locations[j]["lon"]
                )
                matrix[i][j] = dist_km / 50.0 * 3600  # ~50 km/h average
    return matrix


def _nearest_neighbor(matrix: List[List[float]], start_idx: int = 0,
                      fixed_end: Optional[int] = None) -> List[int]:
    """
    Nearest-neighbor heuristic for TSP.
    Returns ordered list of indices to visit.
    """
    n = len(matrix)
    unvisited = set(range(n))
    unvisited.discard(start_idx)
    if fixed_end is not None:
        unvisited.discard(fixed_end)

    tour = [start_idx]
    current = start_idx

    while unvisited:
        nearest = min(unvisited, key=lambda j: matrix[current][j])
        tour.append(nearest)
        unvisited.discard(nearest)
        current = nearest

    if fixed_end is not None:
        tour.append(fixed_end)

    return tour


def _two_opt_improve(tour: List[int], matrix: List[List[float]],
                     fixed_start: bool = True, fixed_end: bool = False,
                     max_iterations: int = 500) -> List[int]:
    """
    2-opt local search improvement.
    Keeps first element fixed (start). Optionally keeps last element fixed (end/round-trip).
    """
    best = tour[:]
    best_cost = _tour_cost(best, matrix)
    improved = True
    iterations = 0

    lo = 1  # don't swap the start
    hi = len(best) - (1 if fixed_end else 0)  # don't swap the end if fixed

    while improved and iterations < max_iterations:
        improved = False
        iterations += 1
        for i in range(lo, hi - 1):
            for j in range(i + 1, hi):
                new_tour = best[:i] + best[i:j + 1][::-1] + best[j + 1:]
                new_cost = _tour_cost(new_tour, matrix)
                if new_cost < best_cost - 0.01:
                    best = new_tour
                    best_cost = new_cost
                    improved = True

    return best


def _tour_cost(tour: List[int], matrix: List[List[float]]) -> float:
    """Total travel time for a tour given the matrix."""
    return sum(matrix[tour[i]][tour[i + 1]] for i in range(len(tour) - 1))


def optimize_stop_order(
    stops: List[Dict[str, Any]],
    start: Dict[str, float],
    end: Optional[Dict[str, float]] = None,
    round_trip: bool = False,
    use_routing_matrix: bool = True,
    time_windows: Optional[Dict[int, Dict[str, str]]] = None,
    departure_time: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Optimize the order of stops for a multi-drop route.

    Args:
        stops: List of stop dicts with lat, lon, name, duration, etc.
        start: Start location {lat, lon}
        end: End location {lat, lon}. If None and not round_trip, last stop is destination.
        round_trip: If True, return to start after all stops.
        use_routing_matrix: Use Valhalla matrix API for accurate times.
        time_windows: Optional {stop_index: {earliest: "HH:MM", latest: "HH:MM"}}
        departure_time: ISO departure time for ETA calculations.

    Returns:
        Dict with optimized_stops, estimated_total_time, per_leg ETAs, etc.
    """
    t0 = time.time()

    if not stops:
        return {"optimized_stops": [], "total_time_seconds": 0, "legs": []}

    locations = [{"lat": start["lat"], "lon": start["lon"]}]
    for s in stops:
        locations.append({"lat": float(s["lat"]), "lon": float(s["lon"])})

    has_distinct_end = end and not round_trip
    if has_distinct_end:
        locations.append({"lat": end["lat"], "lon": end["lon"]})

    matrix = None
    if use_routing_matrix:
        matrix = _valhalla_matrix(locations)

    if matrix is None:
        matrix = _haversine_matrix(locations)
        logger.info("[MULTIDROP] Using haversine fallback matrix")

    start_idx = 0
    fixed_end_idx = len(locations) - 1 if has_distinct_end else None

    if round_trip:
        dup_idx = len(locations)
        for row in matrix:
            row.append(row[0])
        matrix.append(list(matrix[0]))
        fixed_end_idx = dup_idx

    tour = _nearest_neighbor(matrix, start_idx, fixed_end_idx)
    tour = _two_opt_improve(tour, matrix, fixed_start=True,
                            fixed_end=(fixed_end_idx is not None))

    optimized_stops = []
    legs = []
    cumulative_seconds = 0
    dep_dt = None
    if departure_time:
        try:
            dep_dt = datetime.fromisoformat(departure_time)
        except (ValueError, TypeError):
            dep_dt = datetime.now()
    else:
        dep_dt = datetime.now()

    for step in range(len(tour) - 1):
        from_idx = tour[step]
        to_idx = tour[step + 1]
        leg_seconds = matrix[from_idx][to_idx]
        cumulative_seconds += leg_seconds

        real_to_idx = to_idx
        if round_trip and to_idx == len(locations):
            real_to_idx = 0  # mapped back to start

        is_stop = 1 <= real_to_idx <= len(stops)
        stop_data = None
        stop_duration = 0
        if is_stop:
            stop_data = stops[real_to_idx - 1]
            stop_duration = stop_data.get("duration", 0) * 60

        arrival_dt = dep_dt + timedelta(seconds=cumulative_seconds) if dep_dt else None

        tw_ok = True
        if time_windows and is_stop:
            original_idx = real_to_idx - 1
            tw = time_windows.get(original_idx)
            if tw and arrival_dt:
                earliest = tw.get("earliest")
                latest = tw.get("latest")
                if earliest:
                    eh, em = map(int, earliest.split(":"))
                    earliest_dt = arrival_dt.replace(hour=eh, minute=em, second=0)
                    if arrival_dt < earliest_dt:
                        wait = (earliest_dt - arrival_dt).total_seconds()
                        cumulative_seconds += wait
                        arrival_dt = earliest_dt
                if latest:
                    lh, lm = map(int, latest.split(":"))
                    latest_dt = arrival_dt.replace(hour=lh, minute=lm, second=0)
                    if arrival_dt > latest_dt:
                        tw_ok = False

        leg_info = {
            "from_index": from_idx,
            "to_index": real_to_idx,
            "travel_seconds": round(leg_seconds),
            "cumulative_seconds": round(cumulative_seconds),
            "eta": arrival_dt.isoformat() if arrival_dt else None,
            "time_window_ok": tw_ok,
        }

        if is_stop and stop_data:
            optimized_stops.append({
                **stop_data,
                "original_index": real_to_idx - 1,
                "sequence": len(optimized_stops) + 1,
                "eta": arrival_dt.isoformat() if arrival_dt else None,
                "time_window_ok": tw_ok,
            })
            leg_info["stop_name"] = stop_data.get("name", f"Stop {len(optimized_stops)}")
            leg_info["stop_duration_seconds"] = stop_duration
            cumulative_seconds += stop_duration
        elif round_trip and real_to_idx == 0:
            leg_info["stop_name"] = "Return to Start"
        elif has_distinct_end and real_to_idx == len(stops) + 1:
            leg_info["stop_name"] = "Destination"

        legs.append(leg_info)

    elapsed_ms = (time.time() - t0) * 1000
    logger.info(f"[MULTIDROP] Optimized {len(stops)} stops in {elapsed_ms:.0f}ms, "
                f"total time: {cumulative_seconds / 60:.0f}min")

    return {
        "optimized_stops": optimized_stops,
        "total_time_seconds": round(cumulative_seconds),
        "total_travel_seconds": round(cumulative_seconds - sum(
            s.get("duration", 0) * 60 for s in stops)),
        "total_stop_seconds": sum(s.get("duration", 0) * 60 for s in stops),
        "legs": legs,
        "stop_count": len(optimized_stops),
        "round_trip": round_trip,
        "optimization_time_ms": round(elapsed_ms),
        "tour_indices": tour,
    }


def build_multidrop_route(
    start: Dict[str, float],
    end: Optional[Dict[str, float]],
    stops: List[Dict[str, Any]],
    optimize_order: bool = True,
    round_trip: bool = False,
    routing_mode: str = "auto",
    enable_hazard_avoidance: bool = False,
    departure_time: Optional[str] = None,
    time_windows: Optional[Dict[int, Dict[str, str]]] = None,
    exclude_locations: Optional[List] = None,
    use_graphhopper_avoidance: bool = False,
    route_bbox: Optional[Dict[str, float]] = None,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    avoid_unpaved: bool = False,
    route_optimization: str = 'fastest',
    traffic_light_hazards: Optional[List[Dict[str, Any]]] = None,
    railway_crossing_hazards: Optional[List[Dict[str, Any]]] = None,
    avoid_caz_zones: bool = False,
) -> Dict[str, Any]:
    """
    Build a complete multi-drop route with per-leg geometry, instructions, and costs.
    When use_graphhopper_avoidance is True, each leg tries GraphHopper with camera
    avoidance (and optional OSM traffic lights / level crossings) before falling back to Valhalla.

    Returns full route data with per-leg breakdown suitable for frontend rendering.
    """
    if not stops:
        return {"success": False, "error": "No stops provided"}

    if optimize_order and len(stops) > 1:
        opt_result = optimize_stop_order(
            stops=stops,
            start=start,
            end=end,
            round_trip=round_trip,
            time_windows=time_windows,
            departure_time=departure_time,
        )
        ordered_stops = opt_result["optimized_stops"]
    else:
        ordered_stops = []
        for i, s in enumerate(stops):
            ordered_stops.append({
                **s,
                "original_index": i,
                "sequence": i + 1,
            })
        opt_result = None

    waypoints = [start]
    for s in ordered_stops:
        waypoints.append({"lat": float(s["lat"]), "lon": float(s["lon"])})
    if end and not round_trip:
        waypoints.append({"lat": end["lat"], "lon": end["lon"]})
    elif round_trip:
        waypoints.append({"lat": start["lat"], "lon": start["lon"]})

    valhalla_costing = routing_mode if routing_mode in ("auto", "pedestrian", "bicycle") else "auto"

    legs = []
    total_distance_km = 0
    total_duration_seconds = 0
    all_geometry = []
    all_maneuvers = []

    for i in range(len(waypoints) - 1):
        leg_data = _route_leg(
            waypoints[i], waypoints[i + 1],
            valhalla_costing, exclude_locations, departure_time,
            use_graphhopper=use_graphhopper_avoidance,
            route_bbox=route_bbox,
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            prefer_scenic=prefer_scenic,
            prefer_quiet=prefer_quiet,
            avoid_unpaved=avoid_unpaved,
            route_optimization=route_optimization,
            traffic_light_hazards=traffic_light_hazards,
            railway_crossing_hazards=railway_crossing_hazards,
            avoid_caz_zones=avoid_caz_zones,
        )

        stop_info = None
        if i < len(ordered_stops):
            stop_info = ordered_stops[i]

        leg_distance = leg_data.get("distance_km", 0)
        leg_duration = leg_data.get("duration_seconds", 0)
        stop_duration = (stop_info.get("duration", 0) * 60) if stop_info else 0

        total_distance_km += leg_distance
        total_duration_seconds += leg_duration + stop_duration

        dep_dt = None
        if departure_time:
            try:
                dep_dt = datetime.fromisoformat(departure_time)
            except (ValueError, TypeError):
                dep_dt = datetime.now()
        else:
            dep_dt = datetime.now()

        arrival_dt = dep_dt + timedelta(seconds=total_duration_seconds - stop_duration)

        leg_info = {
            "leg_index": i,
            "from": waypoints[i],
            "to": waypoints[i + 1],
            "distance_km": round(leg_distance, 2),
            "duration_seconds": round(leg_duration),
            "duration_minutes": round(leg_duration / 60, 1),
            "geometry": leg_data.get("geometry"),
            "geometry_precision": leg_data.get("geometry_precision", 6),
            "maneuvers": leg_data.get("maneuvers", []),
            "source": leg_data.get("source", "Unknown"),
            "eta": arrival_dt.isoformat() if arrival_dt else None,
        }

        if stop_info:
            leg_info["stop"] = {
                "name": stop_info.get("name", f"Stop {i + 1}"),
                "duration_minutes": stop_info.get("duration", 0),
                "sequence": stop_info.get("sequence", i + 1),
                "original_index": stop_info.get("original_index", i),
                "time_window_ok": stop_info.get("time_window_ok", True),
            }

        legs.append(leg_info)

        if leg_data.get("geometry"):
            all_geometry.append(leg_data["geometry"])
        if leg_data.get("maneuvers"):
            all_maneuvers.extend(leg_data["maneuvers"])

    return {
        "success": True,
        "legs": legs,
        "total_distance_km": round(total_distance_km, 2),
        "total_duration_seconds": round(total_duration_seconds),
        "total_duration_minutes": round(total_duration_seconds / 60, 1),
        "total_stop_time_minutes": sum(s.get("duration", 0) for s in ordered_stops),
        "stop_count": len(ordered_stops),
        "optimized": optimize_order and len(stops) > 1,
        "round_trip": round_trip,
        "ordered_stops": ordered_stops,
        "all_geometry": all_geometry,
        "all_maneuvers": all_maneuvers,
        "optimization": opt_result if opt_result else None,
    }


def _route_leg(
    from_loc: Dict[str, float],
    to_loc: Dict[str, float],
    costing: str = "auto",
    exclude_locations: Optional[List] = None,
    departure_time: Optional[str] = None,
    use_graphhopper: bool = False,
    route_bbox: Optional[Dict[str, float]] = None,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    avoid_unpaved: bool = False,
    route_optimization: str = 'fastest',
    traffic_light_hazards: Optional[List[Dict[str, Any]]] = None,
    railway_crossing_hazards: Optional[List[Dict[str, Any]]] = None,
    avoid_caz_zones: bool = False,
) -> Dict[str, Any]:
    """Route a single leg. Tries GraphHopper (if enabled), then Valhalla, then OSRM."""
    if use_graphhopper and costing == "auto" and USE_GRAPHHOPPER_CAMERA_AVOIDANCE:
        gh_result = _graphhopper_leg(
            from_loc, to_loc, route_bbox,
            traffic_light_hazards=traffic_light_hazards,
            railway_crossing_hazards=railway_crossing_hazards,
            avoid_caz_zones=avoid_caz_zones,
        )
        if gh_result:
            return gh_result

    result = _valhalla_leg(
        from_loc, to_loc, costing, exclude_locations, departure_time,
        avoid_tolls=avoid_tolls, avoid_motorways=avoid_motorways, avoid_ferries=avoid_ferries,
        prefer_scenic=prefer_scenic, prefer_quiet=prefer_quiet, avoid_unpaved=avoid_unpaved,
        route_optimization=route_optimization,
    )
    if result:
        return result

    result = _osrm_leg(from_loc, to_loc, costing)
    if result:
        return result

    dist = haversine_km(from_loc["lat"], from_loc["lon"],
                        to_loc["lat"], to_loc["lon"])
    return {
        "distance_km": dist,
        "duration_seconds": dist / 50.0 * 3600,
        "geometry": None,
        "maneuvers": [],
        "source": "Haversine Estimate",
    }


def _graphhopper_leg(
    from_loc: Dict[str, float],
    to_loc: Dict[str, float],
    route_bbox: Optional[Dict[str, float]] = None,
    traffic_light_hazards: Optional[List[Dict[str, Any]]] = None,
    railway_crossing_hazards: Optional[List[Dict[str, Any]]] = None,
    avoid_caz_zones: bool = False,
) -> Optional[Dict[str, Any]]:
    """Route a single leg via GraphHopper with camera avoidance custom model."""
    try:
        from voyagr.services.hazards import (
            build_graphhopper_camera_avoidance_model,
            build_graphhopper_caz_avoidance_model,
            build_graphhopper_custom_model,
            merge_graphhopper_custom_model_parts,
        )

        url = f"{GRAPHHOPPER_URL}/route"
        payload: Dict[str, Any] = {
            "points": [[from_loc["lon"], from_loc["lat"]],
                        [to_loc["lon"], to_loc["lat"]]],
            "profile": "car",
            "locale": "en",
            "instructions": True,
            "points_encoded": True,
            "elevation": False,
        }

        cam_model = build_graphhopper_camera_avoidance_model(route_bbox) or None
        osm_dynamic: Dict[str, List[Dict[str, Any]]] = {}
        if traffic_light_hazards:
            osm_dynamic['traffic_light'] = traffic_light_hazards
        if railway_crossing_hazards:
            osm_dynamic['railway_crossing'] = railway_crossing_hazards
        tl_rx_model = None
        if osm_dynamic:
            tl_rx_model = build_graphhopper_custom_model(
                osm_dynamic,
                route_bbox=route_bbox,
                max_hazards=22,
            )
        caz_model = None
        if avoid_caz_zones:
            caz_model = build_graphhopper_caz_avoidance_model(route_bbox) or None
        custom_model = merge_graphhopper_custom_model_parts(
            cam_model, tl_rx_model if tl_rx_model else None, caz_model)
        if custom_model:
            payload["custom_model"] = custom_model

        headers = {"Content-Type": "application/json",
                   "User-Agent": "Voyagr-PWA/1.0"}

        if custom_model:
            resp = requests.post(url, params={"ch.disable": "true"},
                                 json=payload, timeout=GRAPHHOPPER_TIMEOUT, headers=headers)
        else:
            params = {
                "point": [f"{from_loc['lat']},{from_loc['lon']}",
                          f"{to_loc['lat']},{to_loc['lon']}"],
                "profile": "car", "locale": "en",
                "instructions": "true", "points_encoded": "true",
            }
            resp = requests.get(url, params=params, timeout=GRAPHHOPPER_TIMEOUT,
                                headers={"User-Agent": "Voyagr-PWA/1.0"})

        if resp.status_code == 200:
            data = resp.json()
            if "paths" in data and len(data["paths"]) > 0:
                path = data["paths"][0]
                return {
                    "distance_km": path.get("distance", 0) / 1000,
                    "duration_seconds": path.get("time", 0) / 1000,
                    "geometry": path.get("points", ""),
                    "geometry_precision": 5,
                    "maneuvers": [],
                    "source": "GraphHopper (Camera Avoidance)",
                }
    except Exception as e:
        logger.warning(f"[MULTIDROP] GraphHopper leg failed: {e}")
    return None


def _valhalla_leg(
    from_loc: Dict[str, float],
    to_loc: Dict[str, float],
    costing: str = "auto",
    exclude_locations: Optional[List] = None,
    departure_time: Optional[str] = None,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    avoid_unpaved: bool = False,
    route_optimization: str = 'fastest',
) -> Optional[Dict[str, Any]]:
    """Route a single leg via Valhalla."""
    try:
        url = f"{VALHALLA_URL}/route"
        payload: Dict[str, Any] = {
            "locations": [
                {"lat": from_loc["lat"], "lon": from_loc["lon"]},
                {"lat": to_loc["lat"], "lon": to_loc["lon"]},
            ],
            "costing": costing,
            "alternates": 0,
            "directions_options": {"generalize": 0},
        }

        if departure_time and costing == "auto":
            payload["date_time"] = {"type": 1, "value": departure_time}

        if exclude_locations:
            payload["exclude_locations"] = exclude_locations[:50]

        if costing == "pedestrian":
            payload["costing_options"] = {"pedestrian": {"walking_speed": 5.1, "use_ferry": not avoid_ferries}}
        elif costing == "bicycle":
            payload["costing_options"] = {"bicycle": {"cycling_speed": 18, "use_ferry": not avoid_ferries}}
        elif costing in ("auto", "auto_shorter"):
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
                payload["costing_options"] = {costing: auto_opts}

        resp = requests.post(url, json=payload, timeout=10,
                             headers={"Content-Type": "application/json",
                                      "User-Agent": "Voyagr-PWA/1.0"})

        if resp.status_code == 200:
            data = resp.json()
            if "trip" in data and "legs" in data["trip"]:
                summary = data["trip"]["summary"]
                leg = data["trip"]["legs"][0]

                maneuvers = []
                for m in leg.get("maneuvers", []):
                    mt = m.get("type", 0)
                    entry = {
                        "instruction": m.get("instruction", ""),
                        "type": mt,
                        "distance_km": round(m.get("length", 0), 2),
                        "time_seconds": m.get("time", 0),
                        "street_names": m.get("street_names", []),
                        "begin_shape_index": m.get("begin_shape_index", 0),
                    }
                    rc = m.get("roundabout_exit_count")
                    if rc is not None and mt in (26, 27):
                        try:
                            entry["roundabout_exit_count"] = int(rc)
                        except (TypeError, ValueError):
                            entry["roundabout_exit_count"] = 0
                    if m.get("lanes"):
                        entry["lanes"] = m.get("lanes")
                    maneuvers.append(entry)

                return {
                    "distance_km": summary.get("length", 0),
                    "duration_seconds": summary.get("time", 0),
                    "geometry": leg.get("shape"),
                    "geometry_precision": 6,
                    "maneuvers": maneuvers,
                    "source": "Valhalla",
                }
    except Exception as e:
        logger.warning(f"[MULTIDROP] Valhalla leg failed: {e}")
    return None


def _osrm_leg(
    from_loc: Dict[str, float],
    to_loc: Dict[str, float],
    costing: str = "auto",
) -> Optional[Dict[str, Any]]:
    """Route a single leg via OSRM."""
    try:
        profile = "driving"
        if costing == "pedestrian":
            profile = "foot"
        elif costing == "bicycle":
            profile = "bike"

        url = (f"{OSRM_URL}/{profile}/"
               f"{from_loc['lon']},{from_loc['lat']};"
               f"{to_loc['lon']},{to_loc['lat']}"
               f"?overview=full&steps=true")

        resp = requests.get(url, timeout=10,
                            headers={"User-Agent": "Voyagr-PWA/1.0"})

        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") == "Ok" and data.get("routes"):
                route = data["routes"][0]
                return {
                    "distance_km": route["distance"] / 1000,
                    "duration_seconds": route["duration"],
                    "geometry": route.get("geometry"),
                    "geometry_precision": 5,
                    "maneuvers": [],
                    "source": "OSRM",
                }
    except Exception as e:
        logger.warning(f"[MULTIDROP] OSRM leg failed: {e}")
    return None
