"""
Cost calculation for routes
Fuel, toll, and CAZ cost estimation
"""

from typing import Dict

class CostCalculator:
    """Calculate route costs."""
    
    # Toll rates (£/km)
    TOLL_RATES = {
        'motorway': 0.15,
        'trunk': 0.05,
        'primary': 0.02,
        'other': 0.0
    }
    
    # CAZ rates (£ per entry)
    CAZ_RATES = {
        'petrol_diesel': 8.0,
        'electric': 0.0,
        'hybrid': 4.0,
        'motorcycle': 0.0,
        'truck': 12.0,
        'van': 8.0
    }
    
    # Fuel efficiency (L/100km)
    FUEL_EFFICIENCY = {
        'petrol_diesel': 6.5,
        'electric': 18.5,  # kWh/100km
        'hybrid': 5.0,
        'motorcycle': 3.5,
        'truck': 8.0,
        'van': 7.0
    }
    
    # Default fuel prices (£/L or £/kWh)
    FUEL_PRICES = {
        'petrol_diesel': 1.40,
        'electric': 0.30,
        'hybrid': 1.40,
        'motorcycle': 1.40,
        'truck': 1.40,
        'van': 1.40
    }
    
    @staticmethod
    def calculate_fuel_cost(distance_km: float, vehicle_type: str = 'petrol_diesel',
                           fuel_efficiency: float = None, fuel_price: float = None) -> float:
        """Calculate fuel cost."""
        if fuel_efficiency is None:
            fuel_efficiency = CostCalculator.FUEL_EFFICIENCY.get(vehicle_type, 6.5)
        if fuel_price is None:
            fuel_price = CostCalculator.FUEL_PRICES.get(vehicle_type, 1.40)
        
        fuel_needed = (distance_km / 100) * fuel_efficiency
        return fuel_needed * fuel_price
    
    @staticmethod
    def calculate_toll_cost(distance_km: float, road_type: str = 'motorway',
                           include_tolls: bool = True) -> float:
        """Calculate toll cost."""
        if not include_tolls:
            return 0.0
        
        rate = CostCalculator.TOLL_RATES.get(road_type, 0.0)
        return distance_km * rate
    
    @staticmethod
    def calculate_caz_cost(distance_km: float, vehicle_type: str = 'petrol_diesel',
                          include_caz: bool = True, is_exempt: bool = False) -> float:
        """Calculate CAZ cost."""
        if not include_caz or is_exempt:
            return 0.0
        
        # Assume 1 CAZ entry per 50km
        caz_entries = max(1, int(distance_km / 50))
        rate = CostCalculator.CAZ_RATES.get(vehicle_type, 8.0)
        return caz_entries * rate
    
    @staticmethod
    def calculate_total_cost(distance_km: float, vehicle_type: str = 'petrol_diesel',
                            fuel_efficiency: float = None, fuel_price: float = None,
                            include_tolls: bool = True, include_caz: bool = True,
                            is_caz_exempt: bool = False, road_type: str = 'motorway') -> Dict:
        """Calculate total route cost."""
        fuel_cost = CostCalculator.calculate_fuel_cost(distance_km, vehicle_type, 
                                                       fuel_efficiency, fuel_price)
        toll_cost = CostCalculator.calculate_toll_cost(distance_km, road_type, include_tolls)
        caz_cost = CostCalculator.calculate_caz_cost(distance_km, vehicle_type, 
                                                     include_caz, is_caz_exempt)
        
        return {
            'fuel_cost': round(fuel_cost, 2),
            'toll_cost': round(toll_cost, 2),
            'caz_cost': round(caz_cost, 2),
            'total_cost': round(fuel_cost + toll_cost + caz_cost, 2)
        }

