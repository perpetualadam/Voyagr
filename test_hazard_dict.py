#!/usr/bin/env python3
"""Test if empty hazard dict is truthy"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


# This is what the code does
hazards = {
    'speed_camera': [],
    'traffic_light_camera': [],
    'police': [],
    'roadworks': [],
    'accident': [],
    'railway_crossing': [],
    'pothole': [],
    'debris': []
}

print("Empty hazards dict:")
print(f"  hazards = {hazards}")
print(f"  bool(hazards) = {bool(hazards)}")
print(f"  if hazards: {True if hazards else False}")
print()

# The condition in the code
enable_hazard_avoidance = True
if enable_hazard_avoidance and hazards:
    print("✓ Condition is TRUE - hazards will be scored")
else:
    print("✗ Condition is FALSE - hazards will NOT be scored")

print()
print("The issue: Empty dict is still truthy!")
print("We need to check if ANY hazard list has items")
print()

# Better check
has_hazards = any(len(v) > 0 for v in hazards.values())
print(f"Better check - has_hazards = {has_hazards}")
if enable_hazard_avoidance and has_hazards:
    print("✓ With better check: hazards will be scored")
else:
    print("✗ With better check: hazards will NOT be scored")

