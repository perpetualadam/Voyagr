"""
Machine Learning Cost Prediction Module for Voyagr
Predicts travel costs and identifies savings opportunities.
"""

import json
import time
import numpy as np
from datetime import datetime, timedelta
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
import sqlite3


class MLCostPredictor:
    """ML-based cost prediction and budgeting."""
    
    def __init__(self, db_path='satnav.db'):
        """Initialize the cost predictor."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.cost_model = None
        self.min_samples = 15
        
    def train_cost_model(self):
        """Train cost prediction model."""
        try:
            # Get trip history
            self.cursor.execute("""
                SELECT distance_km, duration_seconds, total_cost, fuel_cost, toll_cost, caz_cost
                FROM trip_history
                ORDER BY timestamp_start DESC LIMIT 150
            """)
            trips = self.cursor.fetchall()
            
            if len(trips) < self.min_samples:
                print(f"[OK] Insufficient cost data ({len(trips)} trips)")
                return False
            
            # Prepare features
            X = []
            y = []
            for distance, duration, total_cost, fuel_cost, toll_cost, caz_cost in trips:
                if distance > 0 and duration > 0:
                    speed = distance / (duration / 3600)
                    X.append([distance, speed, duration / 3600])
                    y.append(total_cost)
            
            if len(X) < self.min_samples:
                return False
            
            # Train Random Forest model
            self.cost_model = RandomForestRegressor(
                n_estimators=15, max_depth=8, random_state=42
            )
            self.cost_model.fit(X, y)
            
            score = self.cost_model.score(X, y)
            print(f"[OK] Cost model trained (R²={score:.3f}, {len(X)} trips)")
            return True
        except Exception as e:
            print(f"[FAIL] Cost model training error: {e}")
            return False
    
    def predict_weekly_cost(self):
        """Forecast weekly travel costs."""
        try:
            # Get last week's trips
            week_ago = int(time.time()) - (7 * 86400)
            self.cursor.execute("""
                SELECT SUM(total_cost), COUNT(*), AVG(distance_km)
                FROM trip_history
                WHERE timestamp_start >= ?
            """, (week_ago,))
            result = self.cursor.fetchone()
            
            if not result or result[0] is None:
                return {'weekly_cost': 0, 'confidence': 0.0}
            
            total_cost, trip_count, avg_distance = result
            
            # Project to next week
            if trip_count > 0:
                cost_per_trip = total_cost / trip_count
                projected_cost = cost_per_trip * trip_count
            else:
                projected_cost = 0
            
            confidence = min(trip_count / 10, 1.0)
            
            return {
                'weekly_cost': projected_cost,
                'trip_count': trip_count,
                'avg_distance': avg_distance,
                'confidence': confidence
            }
        except Exception as e:
            print(f"[FAIL] Weekly cost prediction error: {e}")
            return {'weekly_cost': 0, 'confidence': 0.0}
    
    def predict_monthly_cost(self):
        """Forecast monthly travel costs."""
        try:
            # Get last month's trips
            month_ago = int(time.time()) - (30 * 86400)
            self.cursor.execute("""
                SELECT SUM(total_cost), COUNT(*), AVG(distance_km)
                FROM trip_history
                WHERE timestamp_start >= ?
            """, (month_ago,))
            result = self.cursor.fetchone()
            
            if not result or result[0] is None:
                return {'monthly_cost': 0, 'confidence': 0.0}
            
            total_cost, trip_count, avg_distance = result
            
            # Project to next month
            if trip_count > 0:
                cost_per_trip = total_cost / trip_count
                projected_cost = cost_per_trip * trip_count
            else:
                projected_cost = 0
            
            confidence = min(trip_count / 30, 1.0)
            
            return {
                'monthly_cost': projected_cost,
                'trip_count': trip_count,
                'avg_distance': avg_distance,
                'confidence': confidence
            }
        except Exception as e:
            print(f"[FAIL] Monthly cost prediction error: {e}")
            return {'monthly_cost': 0, 'confidence': 0.0}
    
    def identify_savings_opportunities(self):
        """Identify routes/times that save money."""
        try:
            # Analyze cost by routing mode
            self.cursor.execute("""
                SELECT routing_mode, AVG(total_cost / distance_km) as cost_per_km, COUNT(*) as count
                FROM trip_history
                WHERE distance_km > 0
                GROUP BY routing_mode
                ORDER BY cost_per_km ASC
            """)
            mode_costs = self.cursor.fetchall()
            
            opportunities = []
            if len(mode_costs) > 1:
                cheapest_mode = mode_costs[0]
                for mode_cost in mode_costs[1:]:
                    savings_pct = ((mode_cost[1] - cheapest_mode[1]) / cheapest_mode[1] * 100)
                    if savings_pct > 5:
                        opportunities.append({
                            'type': 'routing_mode',
                            'current': mode_cost[0],
                            'recommended': cheapest_mode[0],
                            'savings_percentage': savings_pct
                        })
            
            # Analyze cost by time of day
            self.cursor.execute("""
                SELECT strftime('%H', datetime(timestamp_start, 'unixepoch')) as hour,
                       AVG(total_cost / distance_km) as cost_per_km, COUNT(*) as count
                FROM trip_history
                WHERE distance_km > 0
                GROUP BY hour
                ORDER BY cost_per_km ASC
                LIMIT 5
            """)
            time_costs = self.cursor.fetchall()
            
            if time_costs:
                cheapest_hour = time_costs[0]
                opportunities.append({
                    'type': 'time_of_day',
                    'best_hour': cheapest_hour[0],
                    'cost_per_km': cheapest_hour[1]
                })
            
            return {
                'opportunities': opportunities,
                'count': len(opportunities)
            }
        except Exception as e:
            print(f"[FAIL] Savings opportunity detection error: {e}")
            return {'opportunities': [], 'count': 0}
    
    def predict_fuel_price_impact(self, price_increase_pct):
        """Predict cost impact of fuel price changes."""
        try:
            # Get fuel cost breakdown
            self.cursor.execute("""
                SELECT SUM(fuel_cost), SUM(total_cost), COUNT(*)
                FROM trip_history
                WHERE fuel_cost > 0
            """)
            result = self.cursor.fetchone()
            
            if not result or result[0] is None:
                return {'impact': 0, 'confidence': 0.0}
            
            total_fuel_cost, total_cost, trip_count = result
            
            if total_cost == 0:
                return {'impact': 0, 'confidence': 0.0}
            
            fuel_percentage = (total_fuel_cost / total_cost) * 100
            impact_percentage = (fuel_percentage / 100) * price_increase_pct
            
            return {
                'impact_percentage': impact_percentage,
                'fuel_percentage_of_total': fuel_percentage,
                'confidence': min(trip_count / 30, 1.0)
            }
        except Exception as e:
            print(f"[FAIL] Fuel price impact prediction error: {e}")
            return {'impact': 0, 'confidence': 0.0}
    
    def get_budget_status(self, monthly_budget):
        """Get current budget status."""
        try:
            # Get current month's spending
            month_ago = int(time.time()) - (30 * 86400)
            self.cursor.execute("""
                SELECT SUM(total_cost), COUNT(*)
                FROM trip_history
                WHERE timestamp_start >= ?
            """, (month_ago,))
            result = self.cursor.fetchone()
            
            current_spending = result[0] if result and result[0] else 0
            trip_count = result[1] if result and result[1] else 0
            
            remaining = monthly_budget - current_spending
            percentage_used = (current_spending / monthly_budget * 100) if monthly_budget > 0 else 0
            
            # Predict if will exceed budget
            if trip_count > 0:
                avg_cost_per_trip = current_spending / trip_count
                projected_total = avg_cost_per_trip * (trip_count + 5)
                will_exceed = projected_total > monthly_budget
            else:
                will_exceed = False
            
            return {
                'budget': monthly_budget,
                'spent': current_spending,
                'remaining': max(remaining, 0),
                'percentage_used': percentage_used,
                'will_exceed': will_exceed,
                'trips_this_month': trip_count
            }
        except Exception as e:
            print(f"[FAIL] Budget status error: {e}")
            return {'budget': monthly_budget, 'spent': 0, 'remaining': monthly_budget}
    
    def close(self):
        """Close database connection."""
        try:
            self.conn.close()
        except:
            pass

