"""
Machine Learning Efficiency Prediction Module for Voyagr
Predicts fuel/energy consumption and costs based on driving patterns.
"""

import json
import time
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.ensemble import RandomForestRegressor
import sqlite3


class MLEfficiencyPredictor:
    """ML-based fuel/energy efficiency prediction."""
    
    def __init__(self, db_path='satnav.db'):
        """Initialize the efficiency predictor."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.efficiency_model = None
        self.cost_model = None
        self.min_samples = 10
        
    def extract_efficiency_features(self, trip_data):
        """Extract features for efficiency prediction."""
        try:
            features = []
            targets = []

            for trip in trip_data:
                # Handle both 4 and 5 column formats
                if len(trip) >= 5:
                    distance, duration, cost, fuel_cost, vehicle_type = trip[:5]
                else:
                    distance, duration, cost, fuel_cost = trip[:4]

                if distance <= 0 or duration <= 0:
                    continue

                # Calculate features
                speed = distance / (duration / 3600)
                time_hours = duration / 3600
                cost_per_km = cost / distance if distance > 0 else 0

                features.append([distance, speed, time_hours])
                targets.append(cost_per_km)

            return np.array(features), np.array(targets)
        except Exception as e:
            print(f"[FAIL] Feature extraction error: {e}")
            return None, None
    
    def train_efficiency_model(self):
        """Train efficiency prediction model."""
        try:
            # Get trip history
            self.cursor.execute("""
                SELECT distance_km, duration_seconds, total_cost, fuel_cost
                FROM trip_history
                ORDER BY timestamp_start DESC LIMIT 100
            """)
            trips = self.cursor.fetchall()
            
            if len(trips) < self.min_samples:
                print(f"[OK] Insufficient efficiency data ({len(trips)} trips)")
                return False
            
            features, targets = self.extract_efficiency_features(trips)
            if features is None or len(features) < self.min_samples:
                return False
            
            # Train Random Forest model
            self.efficiency_model = RandomForestRegressor(
                n_estimators=10, max_depth=5, random_state=42
            )
            self.efficiency_model.fit(features, targets)
            
            # Calculate R² score
            score = self.efficiency_model.score(features, targets)
            print(f"[OK] Efficiency model trained (R²={score:.3f}, {len(trips)} trips)")
            return True
        except Exception as e:
            print(f"[FAIL] Efficiency model training error: {e}")
            return False
    
    def train_ev_battery_model(self):
        """Train EV battery drain prediction model."""
        try:
            # Get EV trip history
            self.cursor.execute("""
                SELECT distance_km, duration_seconds, total_cost, fuel_cost
                FROM trip_history
                ORDER BY timestamp_start DESC LIMIT 100
            """)
            trips = self.cursor.fetchall()
            
            if len(trips) < self.min_samples:
                print(f"[OK] Insufficient EV data ({len(trips)} trips)")
                return False
            
            features, targets = self.extract_efficiency_features(trips)
            if features is None or len(features) < self.min_samples:
                return False
            
            # Train model for EV
            self.cost_model = RandomForestRegressor(
                n_estimators=10, max_depth=5, random_state=42
            )
            self.cost_model.fit(features, targets)
            
            score = self.cost_model.score(features, targets)
            print(f"[OK] EV battery model trained (R²={score:.3f}, {len(trips)} trips)")
            return True
        except Exception as e:
            print(f"[FAIL] EV battery model training error: {e}")
            return False
    
    def predict_efficiency(self, distance_km, speed_kmh, vehicle_type='petrol_diesel'):
        """Predict fuel/energy efficiency for a trip."""
        try:
            if vehicle_type == 'petrol_diesel' and self.efficiency_model is None:
                return {'efficiency': None, 'confidence': 0.0}
            
            if vehicle_type == 'electric' and self.cost_model is None:
                return {'efficiency': None, 'confidence': 0.0}
            
            # Prepare features
            time_hours = distance_km / speed_kmh if speed_kmh > 0 else 1
            features = np.array([[distance_km, speed_kmh, time_hours]])
            
            # Make prediction
            model = self.efficiency_model if vehicle_type == 'petrol_diesel' else self.cost_model
            if model is None:
                return {'efficiency': None, 'confidence': 0.0}
            
            prediction = model.predict(features)[0]
            
            # Get historical average for confidence
            self.cursor.execute("""
                SELECT AVG(total_cost / distance_km) as avg_cost_per_km
                FROM trip_history WHERE distance_km > 0 LIMIT 50
            """)
            result = self.cursor.fetchone()
            avg_cost = result[0] if result and result[0] else 0
            
            # Calculate confidence based on prediction variance
            confidence = min(abs(prediction - avg_cost) / (avg_cost + 0.1), 1.0)
            
            return {
                'efficiency': max(prediction, 0),
                'confidence': confidence,
                'unit': 'cost_per_km'
            }
        except Exception as e:
            print(f"[FAIL] Efficiency prediction error: {e}")
            return {'efficiency': None, 'confidence': 0.0}
    
    def predict_trip_cost(self, distance_km, duration_minutes, vehicle_type='petrol_diesel'):
        """Predict total trip cost with confidence interval."""
        try:
            speed_kmh = (distance_km / duration_minutes * 60) if duration_minutes > 0 else 50
            
            efficiency = self.predict_efficiency(distance_km, speed_kmh, vehicle_type)
            if efficiency['efficiency'] is None:
                return {'predicted_cost': None, 'confidence': 0.0}
            
            predicted_cost = efficiency['efficiency'] * distance_km
            
            # Calculate confidence interval
            self.cursor.execute("""
                SELECT STDDEV(total_cost / distance_km) as std_cost
                FROM trip_history WHERE distance_km > 0 LIMIT 50
            """)
            result = self.cursor.fetchone()
            std_cost = result[0] if result and result[0] else 0
            
            confidence_interval = std_cost * distance_km * 1.96 if std_cost > 0 else 0
            
            return {
                'predicted_cost': max(predicted_cost, 0),
                'confidence': efficiency['confidence'],
                'lower_bound': max(predicted_cost - confidence_interval, 0),
                'upper_bound': predicted_cost + confidence_interval
            }
        except Exception as e:
            print(f"[FAIL] Trip cost prediction error: {e}")
            return {'predicted_cost': None, 'confidence': 0.0}
    
    def detect_efficiency_degradation(self):
        """Detect if vehicle efficiency is degrading over time."""
        try:
            # Get recent vs older trips
            self.cursor.execute("""
                SELECT total_cost / distance_km as cost_per_km, timestamp_start
                FROM trip_history WHERE distance_km > 0
                ORDER BY timestamp_start DESC LIMIT 100
            """)
            trips = self.cursor.fetchall()
            
            if len(trips) < 20:
                return {'degradation': 'insufficient_data'}
            
            # Split into recent and older
            recent = [t[0] for t in trips[:len(trips)//2]]
            older = [t[0] for t in trips[len(trips)//2:]]
            
            recent_avg = np.mean(recent)
            older_avg = np.mean(older)
            
            # Calculate degradation percentage
            degradation_pct = ((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0
            
            if degradation_pct > 10:
                return {
                    'degradation': 'detected',
                    'percentage': degradation_pct,
                    'recommendation': 'Schedule maintenance'
                }
            
            return {'degradation': 'none', 'percentage': degradation_pct}
        except Exception as e:
            print(f"[FAIL] Degradation detection error: {e}")
            return {'degradation': 'error'}
    
    def close(self):
        """Close database connection."""
        try:
            self.conn.close()
        except:
            pass

