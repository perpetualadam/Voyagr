"""
Cost rates configuration for tolls and CAZ zones.
"""

import os

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

