"""
Map SCDB / DB / legacy camera type strings to stable hazard_preferences keys (camera_*).
Used by routing, API responses, and marker display types.
"""

from __future__ import annotations

from typing import Optional


def normalize_camera_hazard_bucket(raw_type: Optional[str]) -> str:
    """Map cameras.type (SCDB labels, legacy values) to a hazard_preferences key."""
    if not raw_type:
        return "camera_speed"
    t = str(raw_type).strip().lower()
    # Legacy keys still seen in DB and older caches
    if t == "speed_camera":
        return "camera_speed"
    if t in ("traffic_light_camera", "traffic-light-camera"):
        return "camera_red_light"
    if t in ("camera", "speed", "fixed", "gatso", "truvelo"):
        return "camera_speed"
    if any(x in t for x in ("red_light", "red-light", "traffic_light", "traffic light", "rlc", "tlc")):
        return "camera_red_light"
    if any(x in t for x in ("spec", "average", "avg", "vec")):
        return "camera_average_speed"
    if "bus" in t:
        return "camera_bus_lane"
    if "mobile" in t:
        return "camera_mobile"
    if t.startswith("camera_"):
        return t if t in (
            "camera_speed",
            "camera_red_light",
            "camera_average_speed",
            "camera_bus_lane",
            "camera_mobile",
            "camera_other",
        ) else "camera_other"
    return "camera_other"
