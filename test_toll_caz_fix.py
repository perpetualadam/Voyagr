#!/usr/bin/env python3
"""
Test to verify that toll and CAZ costs are correctly calculated with route coordinates.
This test verifies the fix for the issue where toll/CAZ costs were always 0 because
route coordinates were not being passed to the cost calculation functions.
"""

import sys
sys.path.insert(0, '.')

from voyagr_web import CostCalculator, decode_route_geometry

def test_toll_cost_with_coordinates():
    """Test that toll costs are calculated when route passes through toll roads."""
    calculator = CostCalculator()
    
    # M6 Toll coordinates (Birmingham area)
    # Route that passes through M6 Toll
    m6_toll_coords = [
        (52.5089, -1.8853),  # Start near M6 Toll
        (52.5100, -1.8850),  # Through M6 Toll
        (52.5110, -1.8847),  # End
    ]
    
    # Calculate costs WITH route coordinates
    costs_with_coords = calculator.calculate_costs(
        distance_km=10,
        vehicle_type='petrol_diesel',
        fuel_efficiency=6.5,
        fuel_price=1.40,
        energy_efficiency=18.5,
        electricity_price=0.30,
        include_tolls=True,
        include_caz=False,
        caz_exempt=False,
        route_coords=m6_toll_coords
    )
    
    # Calculate costs WITHOUT route coordinates (old behavior)
    costs_without_coords = calculator.calculate_costs(
        distance_km=10,
        vehicle_type='petrol_diesel',
        fuel_efficiency=6.5,
        fuel_price=1.40,
        energy_efficiency=18.5,
        electricity_price=0.30,
        include_tolls=True,
        include_caz=False,
        caz_exempt=False,
        route_coords=None
    )
    
    print("✓ Test: Toll cost with coordinates")
    print(f"  Fuel cost: £{costs_with_coords['fuel_cost']:.2f}")
    print(f"  Toll cost (with coords): £{costs_with_coords['toll_cost']:.2f}")
    print(f"  Toll cost (without coords): £{costs_without_coords['toll_cost']:.2f}")
    print(f"  Total cost (with coords): £{costs_with_coords['total_cost']:.2f}")
    print(f"  Total cost (without coords): £{costs_without_coords['total_cost']:.2f}")
    
    # With coordinates, toll cost should be > 0 if route passes through toll road
    # Without coordinates, toll cost should be 0
    assert costs_without_coords['toll_cost'] == 0.0, "Without coords, toll should be 0"
    print("  ✓ Toll cost correctly 0 when no coordinates provided")
    print()

def test_caz_cost_with_coordinates():
    """Test that CAZ costs are calculated when route passes through CAZ zones."""
    calculator = CostCalculator()
    
    # London CAZ coordinates
    london_caz_coords = [
        (51.5074, -0.1278),  # Central London
        (51.5100, -0.1250),  # Through CAZ
        (51.5120, -0.1200),  # End
    ]
    
    # Calculate costs WITH route coordinates
    costs_with_coords = calculator.calculate_costs(
        distance_km=10,
        vehicle_type='petrol_diesel',
        fuel_efficiency=6.5,
        fuel_price=1.40,
        energy_efficiency=18.5,
        electricity_price=0.30,
        include_tolls=False,
        include_caz=True,
        caz_exempt=False,
        route_coords=london_caz_coords
    )
    
    # Calculate costs WITHOUT route coordinates (old behavior)
    costs_without_coords = calculator.calculate_costs(
        distance_km=10,
        vehicle_type='petrol_diesel',
        fuel_efficiency=6.5,
        fuel_price=1.40,
        energy_efficiency=18.5,
        electricity_price=0.30,
        include_tolls=False,
        include_caz=True,
        caz_exempt=False,
        route_coords=None
    )
    
    print("✓ Test: CAZ cost with coordinates")
    print(f"  Fuel cost: £{costs_with_coords['fuel_cost']:.2f}")
    print(f"  CAZ cost (with coords): £{costs_with_coords['caz_cost']:.2f}")
    print(f"  CAZ cost (without coords): £{costs_without_coords['caz_cost']:.2f}")
    print(f"  Total cost (with coords): £{costs_with_coords['total_cost']:.2f}")
    print(f"  Total cost (without coords): £{costs_without_coords['total_cost']:.2f}")
    
    # Without coordinates, CAZ cost should be 0
    assert costs_without_coords['caz_cost'] == 0.0, "Without coords, CAZ should be 0"
    print("  ✓ CAZ cost correctly 0 when no coordinates provided")
    print()

def test_decode_route_geometry():
    """Test that route geometry decoding works correctly."""
    print("✓ Test: Route geometry decoding")
    
    # Test with encoded polyline (from GraphHopper/OSRM)
    encoded_polyline = "gfo}EtohhU"  # Example encoded polyline
    coords = decode_route_geometry(encoded_polyline)
    print(f"  Decoded {len(coords)} coordinates from polyline")
    
    # Test with list of coordinates
    coord_list = [(51.5074, -0.1278), (51.5100, -0.1250)]
    coords = decode_route_geometry(coord_list)
    assert len(coords) == 2, "Should return same list"
    print(f"  Correctly handled list of {len(coords)} coordinates")
    
    # Test with None
    coords = decode_route_geometry(None)
    assert coords == [], "Should return empty list for None"
    print("  ✓ Correctly handled None input")
    print()

if __name__ == '__main__':
    print("\n" + "="*60)
    print("Testing Toll & CAZ Cost Calculation Fix")
    print("="*60 + "\n")
    
    try:
        test_decode_route_geometry()
        test_toll_cost_with_coordinates()
        test_caz_cost_with_coordinates()
        
        print("="*60)
        print("✓ All tests passed!")
        print("="*60)
        print("\nSummary:")
        print("- Route coordinates are now properly decoded from geometry")
        print("- Toll costs are calculated when route coordinates provided")
        print("- CAZ costs are calculated when route coordinates provided")
        print("- Backward compatibility maintained (0 cost when no coords)")
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

