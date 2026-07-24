"""Pure helpers for GraphHopper HTTP fallback policy (POST custom model → GET)."""

from __future__ import annotations

from typing import Any, Dict, Optional


def graphhopper_model_has_avoidance_areas(custom_model: Optional[Dict[str, Any]]) -> bool:
    """
    True when the custom model includes hazard/camera/CAZ polygon areas.

    Costing-only models (priority rules without areas) may safely fall back to GET.
    """
    if not custom_model:
        return False
    areas = custom_model.get('areas')
    if not areas:
        return False
    features = areas.get('features') if isinstance(areas, dict) else None
    return bool(features)


def graphhopper_model_has_hazard_blocks(custom_model: Optional[Dict[str, Any]]) -> bool:
    """
    True when the custom model hard/soft-blocks cameras or inline hazards.

    Production UK camera models often have no ``areas`` payload — only
    ``in_camera_area_N`` priority rules — so areas-only checks miss them.
    """
    if not custom_model:
        return False
    for rule in custom_model.get('priority') or []:
        condition = str((rule or {}).get('if') or '')
        if 'in_camera_area_' in condition or 'in_hazard_' in condition:
            return True
    return False


_HARD_COSTING_CONDITION_MARKERS = (
    'road_class == MOTORWAY',
    'toll ==',
    'road_environment == FERRY',
    'road_class == TRACK',
    'road_class == PATH',
)


def graphhopper_model_has_hard_costing_avoids(custom_model: Optional[Dict[str, Any]]) -> bool:
    """
    True when the model encodes hard route-preference avoids (motorways, tolls, ferries).

    These use very low multiply_by values in build_graphhopper_costing_preference_model.
    Falling back to unfiltered GET would silently ignore the user's avoid toggles.
    """
    if not custom_model:
        return False
    for rule in custom_model.get('priority') or []:
        condition = str((rule or {}).get('if') or '')
        if 'in_camera_area_' in condition or 'in_hazard_' in condition or 'in_caz_' in condition:
            continue
        multiply_raw = (rule or {}).get('multiply_by')
        try:
            multiply = float(multiply_raw)
        except (TypeError, ValueError):
            continue
        if multiply > 0.05:
            continue
        if any(marker in condition for marker in _HARD_COSTING_CONDITION_MARKERS):
            return True
    return False


def should_refuse_graphhopper_unfiltered_fallback(
    custom_model: Optional[Dict[str, Any]],
    *,
    custom_model_applied: bool,
) -> bool:
    """
    When POST with camera/hazard avoidance failed, refuse GET/POST-without-model so the
    caller can fall back to Valhalla exclude_locations instead of a silent no-avoidance route.
    """
    if custom_model_applied or not custom_model:
        return False
    return (
        graphhopper_model_has_hazard_blocks(custom_model)
        or graphhopper_model_has_avoidance_areas(custom_model)
        or graphhopper_model_has_hard_costing_avoids(custom_model)
    )
