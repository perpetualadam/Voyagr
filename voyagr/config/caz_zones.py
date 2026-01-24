"""
UK Clean Air Zones (CAZ) data with polygon boundaries.
"""

from typing import Dict, Any, List

# ============================================================================
# CAZ ZONES DATA - Comprehensive UK Clean Air Zones with Polygon Boundaries
# ============================================================================
CAZ_ZONES_DATA: Dict[str, Dict[str, Any]] = {
    'london_ulez': {
        'name': 'London ULEZ',
        'city': 'London',
        'type': 'ULEZ',
        'daily_charge': 12.50,
        'currency': 'GBP',
        'polygon': [
            (51.5874, -0.2270), (51.5890, -0.1650), (51.5850, -0.1050), (51.5750, -0.0450),
            (51.5550, -0.0150), (51.5250, -0.0050), (51.4950, 0.0050), (51.4650, -0.0150),
            (51.4450, -0.0450), (51.4350, -0.0850), (51.4350, -0.1350), (51.4450, -0.1850),
            (51.4650, -0.2250), (51.4950, -0.2450), (51.5250, -0.2550), (51.5550, -0.2450),
            (51.5874, -0.2270)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 12.50, 'available': True},
            'weekly': {'price': None, 'available': False},
            'monthly': {'price': None, 'available': False},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 12.50, 'available': True, 'note': 'Auto Pay with 10% discount'}
        },
        'exemptions': [
            'Electric vehicles (100% battery electric)',
            'Vehicles meeting Euro 6 diesel or Euro 4 petrol standards',
            'Disabled tax class vehicles',
            'Historic vehicles (40+ years old)',
            'Military vehicles',
            'NHS vehicles with exemption'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later (approx. 2006+)',
            'diesel': 'Euro 6 or later (approx. 2015+)',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://tfl.gov.uk/modes/driving/ultra-low-emission-zone'
    },
    'london_cc': {
        'name': 'London Congestion Charge',
        'city': 'London',
        'type': 'CC',
        'daily_charge': 15.00,
        'currency': 'GBP',
        'polygon': [
            (51.5250, -0.1550), (51.5300, -0.1350), (51.5280, -0.1150), (51.5200, -0.0950),
            (51.5100, -0.0850), (51.5000, -0.0850), (51.4900, -0.0950), (51.4850, -0.1150),
            (51.4870, -0.1350), (51.4950, -0.1550), (51.5050, -0.1650), (51.5150, -0.1650),
            (51.5250, -0.1550)
        ],
        'operating_hours': '07:00-18:00',
        'operating_days': 'Mon-Fri (excl. bank holidays)',
        'passes': {
            'daily': {'price': 15.00, 'available': True},
            'weekly': {'price': None, 'available': False},
            'monthly': {'price': 331.50, 'available': True, 'note': 'Fleet discount'},
            'annual': {'price': 3315.00, 'available': True, 'note': 'Fleet discount'},
            'auto_pay': {'price': 15.00, 'available': True}
        },
        'exemptions': [
            'Electric vehicles (100% battery electric)',
            'Disabled Blue Badge holders',
            'NHS exemption holders',
            'Residents (90% discount)',
            'Licensed taxis',
            'Motorcycles, mopeds, bicycles'
        ],
        'vehicle_requirements': {
            'petrol': 'All subject to charge',
            'diesel': 'All subject to charge',
            'hybrid': 'Subject to charge unless registered for Cleaner Vehicle Discount',
            'electric': 'Exempt (Cleaner Vehicle Discount)'
        },
        'purchase_url': 'https://tfl.gov.uk/modes/driving/congestion-charge'
    },
    'birmingham': {
        'name': 'Birmingham CAZ',
        'city': 'Birmingham',
        'type': 'CAZ',
        'daily_charge': 8.00,
        'currency': 'GBP',
        'polygon': [
            (52.4950, -1.9200), (52.4980, -1.8900), (52.4900, -1.8650), (52.4800, -1.8550),
            (52.4650, -1.8600), (52.4550, -1.8750), (52.4520, -1.9000), (52.4580, -1.9250),
            (52.4700, -1.9350), (52.4850, -1.9300), (52.4950, -1.9200)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 8.00, 'available': True},
            'weekly': {'price': 48.00, 'available': True},
            'monthly': {'price': 168.00, 'available': True},
            'annual': {'price': 1680.00, 'available': True},
            'auto_pay': {'price': 8.00, 'available': False}
        },
        'exemptions': [
            'Electric vehicles',
            'Euro 6 diesel vehicles',
            'Euro 4 petrol vehicles',
            'Disabled tax class vehicles',
            'Historic vehicles (40+ years old)',
            'Military vehicles'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later',
            'diesel': 'Euro 6 or later',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://www.brumbreathes.co.uk/'
    },
    'bath': {
        'name': 'Bath CAZ',
        'city': 'Bath',
        'type': 'CAZ',
        'daily_charge': 9.00,
        'currency': 'GBP',
        'polygon': [
            (51.3950, -2.3800), (51.3970, -2.3550), (51.3900, -2.3400), (51.3800, -2.3450),
            (51.3720, -2.3600), (51.3750, -2.3800), (51.3850, -2.3900), (51.3950, -2.3800)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 9.00, 'available': True},
            'weekly': {'price': 45.00, 'available': True},
            'monthly': {'price': 162.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 9.00, 'available': False}
        },
        'exemptions': ['Electric vehicles', 'Euro 6 diesel vehicles', 'Euro 4 petrol vehicles', 'Disabled tax class vehicles', 'Historic vehicles'],
        'vehicle_requirements': {'petrol': 'Euro 4 or later', 'diesel': 'Euro 6 or later', 'hybrid': 'Must meet petrol/diesel standard', 'electric': 'Exempt'},
        'purchase_url': 'https://www.bathnes.gov.uk/bath-clean-air-zone'
    },
    'bristol': {
        'name': 'Bristol CAZ',
        'city': 'Bristol',
        'type': 'CAZ',
        'daily_charge': 9.00,
        'currency': 'GBP',
        'polygon': [
            (51.4650, -2.6100), (51.4680, -2.5850), (51.4600, -2.5650), (51.4500, -2.5600),
            (51.4400, -2.5700), (51.4350, -2.5900), (51.4400, -2.6100), (51.4500, -2.6200),
            (51.4600, -2.6200), (51.4650, -2.6100)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 9.00, 'available': True},
            'weekly': {'price': 45.00, 'available': True},
            'monthly': {'price': 162.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 9.00, 'available': False}
        },
        'exemptions': ['Electric vehicles', 'Euro 6 diesel vehicles', 'Euro 4 petrol vehicles', 'Disabled tax class vehicles', 'Historic vehicles'],
        'vehicle_requirements': {'petrol': 'Euro 4 or later', 'diesel': 'Euro 6 or later', 'hybrid': 'Must meet petrol/diesel standard', 'electric': 'Exempt'},
        'purchase_url': 'https://www.bristol.gov.uk/bristol-clean-air-zone'
    },
    'portsmouth': {
        'name': 'Portsmouth CAZ',
        'city': 'Portsmouth',
        'type': 'CAZ',
        'daily_charge': 10.00,
        'currency': 'GBP',
        'polygon': [
            (50.8050, -1.1000), (50.8100, -1.0850), (50.8050, -1.0700), (50.7950, -1.0700),
            (50.7900, -1.0850), (50.7950, -1.1000), (50.8050, -1.1000)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 10.00, 'available': True},
            'weekly': {'price': 50.00, 'available': True},
            'monthly': {'price': 180.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 10.00, 'available': False}
        },
        'exemptions': ['Electric vehicles', 'Euro 6 diesel vehicles', 'Euro 4 petrol vehicles', 'Disabled tax class vehicles'],
        'vehicle_requirements': {'petrol': 'Euro 4 or later', 'diesel': 'Euro 6 or later', 'hybrid': 'Must meet petrol/diesel standard', 'electric': 'Exempt'},
        'purchase_url': 'https://www.portsmouth.gov.uk/cleanairzone'
    },
    'sheffield': {
        'name': 'Sheffield CAZ',
        'city': 'Sheffield',
        'type': 'CAZ',
        'daily_charge': 10.00,
        'currency': 'GBP',
        'polygon': [
            (53.3900, -1.4800), (53.3920, -1.4600), (53.3850, -1.4450), (53.3750, -1.4500),
            (53.3700, -1.4650), (53.3750, -1.4850), (53.3850, -1.4900), (53.3900, -1.4800)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 10.00, 'available': True},
            'weekly': {'price': 50.00, 'available': True},
            'monthly': {'price': 180.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 10.00, 'available': False}
        },
        'exemptions': ['Electric vehicles', 'Euro 6 diesel vehicles', 'Euro 4 petrol vehicles', 'Disabled tax class vehicles'],
        'vehicle_requirements': {'petrol': 'Euro 4 or later', 'diesel': 'Euro 6 or later', 'hybrid': 'Must meet petrol/diesel standard', 'electric': 'Exempt'},
        'purchase_url': 'https://www.sheffield.gov.uk/cleanairzone'
    },
    'newcastle': {
        'name': 'Newcastle CAZ',
        'city': 'Newcastle',
        'type': 'CAZ',
        'daily_charge': 12.50,
        'currency': 'GBP',
        'polygon': [
            (54.9800, -1.6300), (54.9820, -1.6050), (54.9750, -1.5850), (54.9650, -1.5900),
            (54.9600, -1.6100), (54.9650, -1.6350), (54.9750, -1.6400), (54.9800, -1.6300)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 12.50, 'available': True},
            'weekly': {'price': 62.50, 'available': True},
            'monthly': {'price': 225.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 12.50, 'available': False}
        },
        'exemptions': ['Electric vehicles', 'Euro 6 diesel vehicles', 'Euro 4 petrol vehicles', 'Disabled tax class vehicles'],
        'vehicle_requirements': {'petrol': 'Euro 4 or later', 'diesel': 'Euro 6 or later', 'hybrid': 'Must meet petrol/diesel standard', 'electric': 'Exempt'},
        'purchase_url': 'https://www.newcastle.gov.uk/cleanairzone'
    }
}

# CAZ Pass Types - used for vehicle profile selection
CAZ_PASS_TYPES: List[Dict[str, str]] = [
    {'id': 'none', 'name': 'No Pass', 'description': 'No CAZ pass - will be charged at each zone'},
    {'id': 'exempt_electric', 'name': 'Electric Vehicle Exempt', 'description': 'Electric vehicles are exempt from all UK CAZ charges'},
    {'id': 'exempt_euro6', 'name': 'Euro 6/4 Compliant', 'description': 'Vehicle meets Euro 6 diesel or Euro 4 petrol standards'},
    {'id': 'exempt_disabled', 'name': 'Disabled Tax Class', 'description': 'Vehicle registered in disabled tax class'},
    {'id': 'exempt_historic', 'name': 'Historic Vehicle', 'description': 'Vehicle is 40+ years old (historic classification)'},
    {'id': 'exempt_military', 'name': 'Military Vehicle', 'description': 'Military vehicle exemption'},
    {'id': 'pass_daily', 'name': 'Daily Pass', 'description': 'Valid daily pass purchased for specific zones'},
    {'id': 'pass_weekly', 'name': 'Weekly Pass', 'description': 'Valid weekly pass for specific zones'},
    {'id': 'pass_monthly', 'name': 'Monthly Pass', 'description': 'Valid monthly pass for specific zones'},
    {'id': 'pass_annual', 'name': 'Annual Pass', 'description': 'Valid annual pass for specific zones'},
    {'id': 'auto_pay', 'name': 'Auto Pay Registered', 'description': 'Registered for automatic payment (TfL Auto Pay, etc.)'}
]

