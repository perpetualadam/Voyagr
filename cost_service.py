"""
Cost calculation service layer.
Consolidates all cost-related business logic into a single service.
Eliminates duplicate code and improves maintainability.
"""

from typing import Dict, Tuple
import sqlite3


class CostService:
    """Service for calculating route costs."""
    
    # UK toll rates (approximate)
    TOLL_RATES = {
        'motorway': 0.15,  # £0.15 per km
        'a_road': 0.05,    # £0.05 per km
        'local': 0.0       # No toll
    }
    
    # UK CAZ rates (daily charge)
    CAZ_RATES = {
        'petrol_diesel': 8.0,
        'electric': 0.0,
        'hybrid': 4.0
    }
    
    @staticmethod
    def calculate_fuel_cost(distance_km: float, fuel_efficiency: float, 
                           fuel_price: float) -> float:
        """Calculate fuel cost for a route.
        
        Args:
            distance_km: Distance in kilometers
            fuel_efficiency: Fuel efficiency in L/100km
            fuel_price: Fuel price in GBP per liter
            
        Returns:
            Fuel cost in GBP
        """
        fuel_needed = (distance_km / 100) * fuel_efficiency
        return fuel_needed * fuel_price
    
    @staticmethod
    def calculate_energy_cost(distance_km: float, energy_efficiency: float,
                             electricity_price: float) -> float:
        """Calculate energy cost for EV.
        
        Args:
            distance_km: Distance in kilometers
            energy_efficiency: Energy efficiency in kWh/100km
            electricity_price: Electricity price in GBP per kWh
            
        Returns:
            Energy cost in GBP
        """
        energy_needed = (distance_km / 100) * energy_efficiency
        return energy_needed * electricity_price
    
    @staticmethod
    def calculate_toll_cost(distance_km: float, route_type: str = 'motorway') -> float:
        """Calculate toll cost based on distance and route type.
        
        Args:
            distance_km: Distance in kilometers
            route_type: Type of route (motorway, a_road, local)
            
        Returns:
            Toll cost in GBP
        """
        rate = CostService.TOLL_RATES.get(route_type, 0.05)
        return distance_km * rate
    
    @staticmethod
    def calculate_caz_cost(distance_km: float, vehicle_type: str = 'petrol_diesel',
                          is_exempt: bool = False) -> float:
        """Calculate Congestion Charge Zone cost.
        
        Args:
            distance_km: Distance in kilometers
            vehicle_type: Type of vehicle (petrol_diesel, electric, hybrid)
            is_exempt: Whether vehicle is CAZ exempt
            
        Returns:
            CAZ cost in GBP
        """
        if is_exempt:
            return 0.0
        
        # Assume 1 CAZ entry per 50km
        caz_entries = max(1, int(distance_km / 50))
        rate = CostService.CAZ_RATES.get(vehicle_type, 8.0)
        return caz_entries * rate
    
    @staticmethod
    def calculate_all_costs(distance_km: float, vehicle_type: str,
                           fuel_efficiency: float, fuel_price: float,
                           energy_efficiency: float, electricity_price: float,
                           include_tolls: bool, include_caz: bool,
                           caz_exempt: bool) -> Dict[str, float]:
        """Calculate all costs for a route.
        
        Args:
            distance_km: Distance in kilometers
            vehicle_type: Type of vehicle (petrol_diesel, electric, hybrid)
            fuel_efficiency: Fuel efficiency in L/100km
            fuel_price: Fuel price in GBP per liter
            energy_efficiency: Energy efficiency in kWh/100km
            electricity_price: Electricity price in GBP per kWh
            include_tolls: Whether to include toll costs
            include_caz: Whether to include CAZ costs
            caz_exempt: Whether vehicle is CAZ exempt
            
        Returns:
            Dict with fuel_cost, toll_cost, caz_cost, total_cost
        """
        # Calculate fuel/energy cost
        if vehicle_type == 'electric':
            fuel_cost = CostService.calculate_energy_cost(distance_km, energy_efficiency, electricity_price)
        else:
            fuel_cost = CostService.calculate_fuel_cost(distance_km, fuel_efficiency, fuel_price)
        
        # Calculate toll cost
        toll_cost = CostService.calculate_toll_cost(distance_km, 'motorway') if include_tolls else 0.0
        
        # Calculate CAZ cost
        caz_cost = CostService.calculate_caz_cost(distance_km, vehicle_type, caz_exempt) if include_caz else 0.0
        
        return {
            'fuel_cost': round(fuel_cost, 2),
            'toll_cost': round(toll_cost, 2),
            'caz_cost': round(caz_cost, 2),
            'total_cost': round(fuel_cost + toll_cost + caz_cost, 2)
        }
    
    @staticmethod
    def calculate_cost_breakdown(distance_km: float, duration_minutes: float,
                                vehicle_type: str, fuel_efficiency: float,
                                fuel_price: float, energy_efficiency: float,
                                electricity_price: float, include_tolls: bool,
                                include_caz: bool, caz_exempt: bool) -> Dict:
        """Calculate detailed cost breakdown with per-unit costs.
        
        Args:
            distance_km: Distance in kilometers
            duration_minutes: Duration in minutes
            vehicle_type: Type of vehicle
            fuel_efficiency: Fuel efficiency
            fuel_price: Fuel price
            energy_efficiency: Energy efficiency
            electricity_price: Electricity price
            include_tolls: Whether to include tolls
            include_caz: Whether to include CAZ
            caz_exempt: Whether CAZ exempt
            
        Returns:
            Detailed cost breakdown dict
        """
        costs = CostService.calculate_all_costs(
            distance_km, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt
        )
        
        # Calculate per-unit costs
        cost_per_km = costs['total_cost'] / distance_km if distance_km > 0 else 0
        cost_per_minute = costs['total_cost'] / duration_minutes if duration_minutes > 0 else 0
        
        # Calculate fuel efficiency metrics
        if vehicle_type == 'electric':
            fuel_efficiency_actual = energy_efficiency
            fuel_unit = 'kWh/100km'
        else:
            fuel_efficiency_actual = fuel_efficiency
            fuel_unit = 'L/100km'
        
        return {
            **costs,
            'breakdown': {
                'fuel_cost': costs['fuel_cost'],
                'toll_cost': costs['toll_cost'],
                'caz_cost': costs['caz_cost']
            },
            'per_unit': {
                'cost_per_km': round(cost_per_km, 3),
                'cost_per_minute': round(cost_per_minute, 3),
                'fuel_efficiency': fuel_efficiency_actual,
                'fuel_unit': fuel_unit
            },
            'metrics': {
                'distance_km': round(distance_km, 2),
                'duration_minutes': round(duration_minutes, 0),
                'avg_speed_kmh': round((distance_km / (duration_minutes / 60)) if duration_minutes > 0 else 0, 1)
            }
        }


# Global instance
cost_service = CostService()

