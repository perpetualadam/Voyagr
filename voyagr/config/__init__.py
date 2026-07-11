"""
Configuration module for Voyagr web application.

Contains:
- Environment settings
- Rate configurations (tolls, CAZ)
- CAZ zone definitions
- API configurations
"""

from voyagr.config.settings import (
    VALHALLA_URL,
    GRAPHHOPPER_URL,
    OSRM_URL,
    USE_OSRM,
    USE_GRAPHHOPPER_CAMERA_AVOIDANCE,
    GRAPHHOPPER_CAMERA_AREAS_COUNT,
    GRAPHHOPPER_TIMEOUT,
    DB_FILE,
    CAMERA_HAZARD_BUCKETS,
    VALID_API_KEYS,
    ALLOWED_ORIGINS,
)

from voyagr.config.rates import (
    TOLL_RATES,
    CAZ_RATES,
    CAZ_ENTRY_FREQUENCY_KM,
    FUEL_PRICE_PETROL_GBP,
    FUEL_PRICE_DIESEL_GBP,
    ELECTRICITY_PRICE_GBP,
    DEFAULT_FUEL_EFFICIENCY_L_PER_100KM,
    DEFAULT_ENERGY_EFFICIENCY_KWH_PER_100KM,
    fuel_price_for_vehicle_type,
    resolve_route_cost_params,
)

from voyagr.config.caz_zones import (
    CAZ_ZONES_DATA,
    CAZ_PASS_TYPES,
)

__all__ = [
    'VALHALLA_URL',
    'GRAPHHOPPER_URL',
    'OSRM_URL',
    'USE_OSRM',
    'USE_GRAPHHOPPER_CAMERA_AVOIDANCE',
    'GRAPHHOPPER_CAMERA_AREAS_COUNT',
    'GRAPHHOPPER_TIMEOUT',
    'DB_FILE',
    'CAMERA_HAZARD_BUCKETS',
    'VALID_API_KEYS',
    'ALLOWED_ORIGINS',
    'TOLL_RATES',
    'CAZ_RATES',
    'CAZ_ENTRY_FREQUENCY_KM',
    'FUEL_PRICE_PETROL_GBP',
    'FUEL_PRICE_DIESEL_GBP',
    'ELECTRICITY_PRICE_GBP',
    'DEFAULT_FUEL_EFFICIENCY_L_PER_100KM',
    'DEFAULT_ENERGY_EFFICIENCY_KWH_PER_100KM',
    'fuel_price_for_vehicle_type',
    'resolve_route_cost_params',
    'CAZ_ZONES_DATA',
    'CAZ_PASS_TYPES',
]

