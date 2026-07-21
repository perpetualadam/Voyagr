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


def should_refuse_graphhopper_unfiltered_fallback(
    custom_model: Optional[Dict[str, Any]],
    *,
    custom_model_applied: bool,
) -> bool:
    """
    When POST with avoidance areas failed, refuse GET/POST-without-model so the
    caller can fall back to Valhalla exclude_locations instead of a silent no-avoidance route.
    """
    if custom_model_applied or not custom_model:
        return False
    return graphhopper_model_has_avoidance_areas(custom_model)
