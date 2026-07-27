"""
Post-process /api/route option lists for meaningful variety.

Valhalla ``alternates`` often return near-identical paths (especially with heavy
``exclude_locations``). This module deduplicates those copies, decides when to
fetch genuinely distinct costing modes (🌿 Scenic / 🛤️ Quiet), and applies the user's
``max_detour`` preference to secondary options.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from voyagr.services.routing.optimised_route import (
    QUIET_ROUTE_NAME,
    SCENIC_ROUTE_NAME,
    is_primary_optimised_route,
    routes_are_distinct,
)

# 🌿 Scenic / 🛤️ Quiet down-weight motorways on purpose, so they cost more time than
# the user's plain "Max Detour Allowed" slider intends for incidental alternates.
PREFERENCE_ROUTE_DETOUR_MULTIPLIER = 2.0

# The route preview is a chooser: collapsing it to one option removes the point.
MIN_PREVIEW_ROUTE_OPTIONS = 2


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
    Whether to run the discovery block (🌿 Scenic / 🛤️ Quiet + ⚡ Optimised Discovery).

    Runs when auto hazard avoidance is on and we still lack Scenic or Quiet
    options or fewer than ``min_distinct`` geometrically distinct paths — even
    if Valhalla already returned three near-copy alternates.
    """
    if valhalla_costing != 'auto' or not enable_hazard_avoidance:
        return False
    distinct = count_distinct_routes(routes)
    has_scenic = has_named_route(routes, SCENIC_ROUTE_NAME)
    has_quiet = has_named_route(routes, QUIET_ROUTE_NAME)
    if distinct >= min_distinct and has_scenic and has_quiet:
        return False
    if not has_scenic or not has_quiet:
        return True
    return distinct < min_distinct


def dedupe_similar_routes(routes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Drop secondary routes that are too similar to an already-kept option.

    The first route (Fastest / primary) and any ⚡ Optimised options are always
    retained — Optimised is the primary camera-avoidance product route.

    Similarity is judged only against non-Optimised peers so a geometrically
    similar Fastest is not dropped when Optimised is already first (e.g. after
    GraphHopper merge or ``pin_optimised_route_first``).
    """
    if len(routes) <= 1:
        return routes
    kept: List[Dict[str, Any]] = [routes[0]]
    for route in routes[1:]:
        if is_primary_optimised_route(route):
            kept.append(route)
            continue
        peers = [existing for existing in kept if not is_primary_optimised_route(existing)]
        if not peers or all(routes_are_distinct(route, existing) for existing in peers):
            kept.append(route)
    for idx, route in enumerate(kept):
        route['id'] = idx + 1
    return kept


def _is_fastest_route(route: Dict[str, Any]) -> bool:
    return (route.get('name') or '').strip() == 'Fastest'


def _is_preference_variety_route(route: Dict[str, Any]) -> bool:
    """True for the named costing-preference options (🌿 Scenic / 🛤️ Quiet)."""
    return (route.get('name') or '').strip() in (SCENIC_ROUTE_NAME, QUIET_ROUTE_NAME)


def _detour_allowance_percent(route: Dict[str, Any], max_detour_percent: int) -> float:
    """
    Detour allowance for one option.

    🌿 Scenic and 🛤️ Quiet are fetched with costing that down-weights motorways, so
    they are slower than Fastest by design — at the default 20% cap they were culled
    immediately after being requested and never reached the preview. They get
    ``PREFERENCE_ROUTE_DETOUR_MULTIPLIER`` times the user's allowance so the option
    is attainable, while a 0% cap still means "no detour at all".
    """
    if _is_preference_variety_route(route):
        return max_detour_percent * PREFERENCE_ROUTE_DETOUR_MULTIPLIER
    return float(max_detour_percent)


def _max_detour_baseline_minutes(routes: List[Dict[str, Any]]) -> float:
    """
    Duration baseline for max-detour filtering.

    Use Fastest (or the quickest non-Optimised option) — never ⚡ Optimised.
    Optimised is often ``routes[0]`` after GraphHopper merge / hazard reorder, but
    it is a camera-avoidance product pin, not the ETA reference. Measuring Fastest
    against Optimised collapses the preview to a single option whenever Optimised
    is modestly quicker.
    """
    fastest = next((r for r in routes if _is_fastest_route(r)), None)
    if fastest is not None:
        baseline = _duration_minutes(fastest)
        if baseline > 0:
            return baseline

    non_optimised = [
        _duration_minutes(r)
        for r in routes
        if not is_primary_optimised_route(r) and _duration_minutes(r) > 0
    ]
    if non_optimised:
        return min(non_optimised)

    return _duration_minutes(routes[0]) if routes else 0.0


def filter_routes_by_max_detour(
    routes: List[Dict[str, Any]],
    max_detour_percent: int,
) -> List[Dict[str, Any]]:
    """
    Drop alternates whose duration exceeds the Fastest (time) baseline by more
    than their detour allowance. Fastest and ⚡ Optimised are always kept, and
    🌿 Scenic / 🛤️ Quiet get the wider preference allowance.

    When filtering would leave a single option, the closest-to-baseline dropped
    route is restored so the preview always offers a choice between the distinct
    paths the router actually found.
    """
    if not routes or max_detour_percent >= 100:
        return routes
    baseline_min = _max_detour_baseline_minutes(routes)
    if baseline_min <= 0:
        return routes

    kept: List[Dict[str, Any]] = [routes[0]]
    dropped: List[Tuple[float, Dict[str, Any]]] = []
    for route in routes[1:]:
        if is_primary_optimised_route(route) or _is_fastest_route(route):
            kept.append(route)
            continue
        dur = _duration_minutes(route)
        if dur <= 0:
            kept.append(route)
            continue
        detour_pct = ((dur - baseline_min) / baseline_min) * 100.0
        if detour_pct <= _detour_allowance_percent(route, max_detour_percent):
            kept.append(route)
        else:
            dropped.append((detour_pct, route))

    if len(kept) < MIN_PREVIEW_ROUTE_OPTIONS and dropped:
        closest = min(dropped, key=lambda pair: pair[0])
        kept.append(closest[1])

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
    """
    Last-pass dedupe + max-detour filter, then pin ⚡ Optimised first.

    Pin runs after filters so Optimised-as-primary cannot collapse a similar
    Fastest during dedupe; max-detour uses Fastest (not Optimised) as the ETA
    baseline so a camera-safer Optimised pin cannot cull the time option, and
    gives 🌿 Scenic / 🛤️ Quiet the wider preference allowance so those options
    survive the default cap. The client still sees Optimised as the top option.
    """
    routes = dedupe_similar_routes(routes)
    routes = filter_routes_by_max_detour(routes, max_detour_percent)
    routes = pin_optimised_route_first(routes)
    return routes


def _duration_minutes(route: Dict[str, Any]) -> float:
    try:
        return float(route.get('duration_minutes') or 0)
    except (TypeError, ValueError):
        return 0.0
