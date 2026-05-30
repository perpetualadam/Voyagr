"""
Cost rates configuration for tolls, CAZ zones, and fuel/energy defaults.
"""

import os
from typing import Any, Dict

# ============================================================================
# CONFIGURABLE RATES (Environment Variables)
# ============================================================================

# Toll rates (£ per km) - configurable via environment variables
TOLL_RATES = {
    'motorway': float(os.getenv('TOLL_RATE_MOTORWAY', '0.15')),
    'a_road': float(os.getenv('TOLL_RATE_A_ROAD', '0.05')),
    'local': float(os.getenv('TOLL_RATE_LOCAL', '0.0'))
}

# CAZ rates (£ per entry) - configurable via environment variables
CAZ_RATES = {
    'petrol_diesel': float(os.getenv('CAZ_RATE_PETROL_DIESEL', '8.0')),
    'electric': float(os.getenv('CAZ_RATE_ELECTRIC', '0.0')),
    'hybrid': float(os.getenv('CAZ_RATE_HYBRID', '4.0'))
}

# CAZ entry frequency (km between entries) - configurable
CAZ_ENTRY_FREQUENCY_KM = float(os.getenv('CAZ_ENTRY_FREQUENCY_KM', '50.0'))

# UK retail fuel/energy defaults (May 2026 averages, rounded for estimates)
# Petrol ~159.6p/L, diesel ~184.9p/L, home/public EV ~32p/kWh
FUEL_PRICE_PETROL_GBP = float(os.getenv('FUEL_PRICE_PETROL_GBP', '1.60'))
FUEL_PRICE_DIESEL_GBP = float(os.getenv('FUEL_PRICE_DIESEL_GBP', '1.85'))
ELECTRICITY_PRICE_GBP = float(os.getenv('ELECTRICITY_PRICE_GBP', '0.32'))
DEFAULT_FUEL_EFFICIENCY_L_PER_100KM = float(os.getenv('DEFAULT_FUEL_EFFICIENCY', '6.5'))
DEFAULT_ENERGY_EFFICIENCY_KWH_PER_100KM = float(os.getenv('DEFAULT_ENERGY_EFFICIENCY', '18.5'))


def fuel_price_for_vehicle_type(vehicle_type: str) -> float:
    """Return the default fuel price (£/L) for a vehicle type."""
    vt = (vehicle_type or 'petrol_diesel').lower()
    if vt in ('van', 'truck', 'diesel', 'hgv'):
        return FUEL_PRICE_DIESEL_GBP
    return FUEL_PRICE_PETROL_GBP


def resolve_route_cost_params(data: Dict[str, Any]) -> Dict[str, float]:
    """Resolve fuel/energy parameters from a route request, applying UK defaults."""
    vehicle_type = data.get('vehicle_type', 'petrol_diesel')
    return {
        'fuel_efficiency': float(
            data.get('fuel_efficiency', DEFAULT_FUEL_EFFICIENCY_L_PER_100KM)
        ),
        'fuel_price': float(
            data.get('fuel_price', fuel_price_for_vehicle_type(vehicle_type))
        ),
        'energy_efficiency': float(
            data.get('energy_efficiency', DEFAULT_ENERGY_EFFICIENCY_KWH_PER_100KM)
        ),
        'electricity_price': float(
            data.get('electricity_price', ELECTRICITY_PRICE_GBP)
        ),
    }

