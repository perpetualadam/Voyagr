"""
Post-process /api/route option lists for meaningful variety.

Valhalla ``alternates`` often return near-identical paths (especially with heavy
``exclude_locations``). This module deduplicates those copies, decides when to
fetch genuinely distinct costing modes (📏 Shortest), and applies the user's
``max_detour`` preference to secondary options.
"""

from __future__ import annotations

from typing import Any, Dict, List

from voyagr.services.routing.optimised_route import (
    SHORTEST_ROUTE_NAME,
    is_primary_optimised_route,
    routes_are_distinct,
)


def count_distinct_routes(routes: List[Dict[str, Any]]) -> int:
    """Count routes that are pairwise distinct against earlier entries."""
    if not routes:
        return 0
    kept: List[Dict[str, Any]] = []
    for route in routes:
        if all(routes_are_distinct(route, existing) for existing in kept):
            kept.append(route)
    return len(kept)


def has_named_route(routes: List[Dict[str, Any]], name: str) -> bool:
    """True when any route name matches exactly (trimmed)."""
    target = (name or '').strip()
    return any((r.get('name') or '').strip() == target for r in routes)


def should_append_distinct_valhalla_route_types(
    routes: List[Dict[str, Any]],
    *,
    valhalla_costing: str,
    enable_hazard_avoidance: bool,
    min_distinct: int = 3,
) -> bool:
    """
    Whether to run the discovery block (📏 Shortest + ⚡ Optimised Discovery).

    Runs when auto hazard avoidance is on and we still lack a true Shortest
    option or fewer than ``min_distinct`` geometrically distinct paths — even
    if Valhalla already returned three near-copy alternates.
    """
    if valhalla_costing != 'auto' or not enable_hazard_avoidance:
        return False
    distinct = count_distinct_routes(routes)
    has_shortest = has_named_route(routes, SHORTEST_ROUTE_NAME)
    if distinct >= min_distinct and has_shortest:
        return False
    if not has_shortest:
        return True
    return distinct < min_distinct


def dedupe_similar_routes(routes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Drop secondary routes that are too similar to an already-kept option.

    The first route (Fastest / primary) and any ⚡ Optimised options are always
    retained — Optimised is the primary camera-avoidance product route.
    """
    if len(routes) <= 1:
        return routes
    kept: List[Dict[str, Any]] = [routes[0]]
    for route in routes[1:]:
        if is_primary_optimised_route(route):
            kept.append(route)
            continue
        if all(routes_are_distinct(route, existing) for existing in kept):
            kept.append(route)
    for idx, route in enumerate(kept):
        route['id'] = idx + 1
    return kept


def filter_routes_by_max_detour(
    routes: List[Dict[str, Any]],
    max_detour_percent: int,
) -> List[Dict[str, Any]]:
    """
    Drop alternates whose duration exceeds the primary route by more than
    ``max_detour_percent``. The primary route is always kept.
    """
    if not routes or max_detour_percent >= 100:
        return routes
    baseline_min = _duration_minutes(routes[0])
    if baseline_min <= 0:
        return routes

    kept: List[Dict[str, Any]] = [routes[0]]
    for route in routes[1:]:
        if is_primary_optimised_route(route):
            kept.append(route)
            continue
        dur = _duration_minutes(route)
        if dur <= 0:
            kept.append(route)
            continue
        detour_pct = ((dur - baseline_min) / baseline_min) * 100.0
        if detour_pct <= max_detour_percent:
            kept.append(route)

    for idx, route in enumerate(kept):
        route['id'] = idx + 1
    return kept


def pin_optimised_route_first(routes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Move ⚡ Optimised (GraphHopper/Valhalla) to the top of the option list."""
    if not routes:
        return routes
    optimised_idx = next(
        (i for i, r in enumerate(routes) if is_primary_optimised_route(r)),
        None,
    )
    if optimised_idx is None or optimised_idx == 0:
        return routes
    ordered = [routes[optimised_idx]] + [
        r for i, r in enumerate(routes) if i != optimised_idx
    ]
    for idx, route in enumerate(ordered):
        route['id'] = idx + 1
    return ordered


def finalize_route_variety(
    routes: List[Dict[str, Any]],
    *,
    max_detour_percent: int,
) -> List[Dict[str, Any]]:
    """Last-pass dedupe + max-detour filter before returning to the client."""
    routes = dedupe_similar_routes(routes)
    routes = filter_routes_by_max_detour(routes, max_detour_percent)
    return routes


def _duration_minutes(route: Dict[str, Any]) -> float:
    try:
        return float(route.get('duration_minutes') or 0)
    except (TypeError, ValueError):
        return 0.0
