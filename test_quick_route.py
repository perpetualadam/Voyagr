"""
Quick route test - just test routing without full graph load
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import time
from custom_router_service import initialize_router

print("Initializing router (this will take ~20 minutes)...")
print("Press Ctrl+C to cancel")

try:
    service = initialize_router(use_ch=False)
    print("✓ Router ready")
    
    # Test one route
    print("\nTesting London-Oxford route...")
    route = service.calculate_route(51.5074, -0.1278, 51.752, -1.2577)
    
    if route and 'error' not in route:
        print(f"✓ Route found: {route.get('distance_m', 0) / 1000:.1f}km")
    else:
        print(f"✗ Route failed: {route}")
        
except KeyboardInterrupt:
    print("\nCancelled")

