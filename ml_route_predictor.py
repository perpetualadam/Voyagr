"""
Machine Learning Route Prediction Module for Voyagr
Predicts optimal routes based on user preferences and historical data.
"""

import json
import time
import numpy as np
from datetime import datetime, timedelta
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
import sqlite3


class MLRoutePredictor:
    """ML-based route prediction and personalization."""
    
    def __init__(self, db_path='satnav.db'):
        """Initialize the route predictor."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.scaler = StandardScaler()
        self.route_clusters = None
        self.preference_model = None
        self.min_samples = 10  # Minimum samples for model training
        
    def extract_route_features(self, trip_data):
        """Extract features from trip data for clustering."""
        try:
            features = []
            for trip in trip_data:
                start_lat, start_lon, end_lat, end_lon, distance, duration, mode, cost = trip
                
                # Calculate route characteristics
                lat_diff = abs(end_lat - start_lat)
                lon_diff = abs(end_lon - start_lon)
                speed = distance / (duration / 3600) if duration > 0 else 0
                cost_per_km = cost / distance if distance > 0 else 0
                
                features.append([
                    lat_diff, lon_diff, distance, duration, speed, cost_per_km
                ])
            
            return np.array(features)
        except Exception as e:
            print(f"[FAIL] Feature extraction error: {e}")
            return None
    
    def train_route_clusters(self, num_clusters=3):
        """Train clustering model on historical routes."""
        try:
            # Get trip history
            self.cursor.execute("""
                SELECT start_lat, start_lon, end_lat, end_lon, 
                       distance_km, duration_seconds, routing_mode, total_cost
                FROM trip_history ORDER BY timestamp_start DESC LIMIT 100
            """)
            trips = self.cursor.fetchall()
            
            if len(trips) < self.min_samples:
                print(f"[OK] Insufficient data for route clustering ({len(trips)} trips)")
                return False
            
            features = self.extract_route_features(trips)
            if features is None or len(features) < self.min_samples:
                return False
            
            # Scale features
            scaled_features = self.scaler.fit_transform(features)
            
            # Train K-means clustering
            self.route_clusters = KMeans(n_clusters=num_clusters, random_state=42)
            self.route_clusters.fit(scaled_features)
            
            print(f"[OK] Route clustering trained on {len(trips)} trips")
            return True
        except Exception as e:
            print(f"[FAIL] Route clustering error: {e}")
            return False
    
    def predict_user_preference(self, distance_km, time_minutes):
        """Predict user's cost vs time preference."""
        try:
            # Get user's historical cost-time tradeoffs
            self.cursor.execute("""
                SELECT distance_km, duration_seconds, total_cost
                FROM trip_history ORDER BY timestamp_start DESC LIMIT 50
            """)
            trips = self.cursor.fetchall()
            
            if len(trips) < self.min_samples:
                return {'preference': 'balanced', 'confidence': 0.0}
            
            # Calculate cost per minute for each trip
            cost_per_minute = []
            for dist, duration, cost in trips:
                if duration > 0:
                    cost_per_minute.append(cost / (duration / 60))
            
            if not cost_per_minute:
                return {'preference': 'balanced', 'confidence': 0.0}
            
            avg_cost_per_minute = np.mean(cost_per_minute)
            std_cost_per_minute = np.std(cost_per_minute)
            
            # Classify preference
            if avg_cost_per_minute < std_cost_per_minute:
                preference = 'cost_conscious'
            elif avg_cost_per_minute > std_cost_per_minute * 2:
                preference = 'time_conscious'
            else:
                preference = 'balanced'
            
            confidence = min(len(trips) / 50, 1.0)
            
            return {
                'preference': preference,
                'confidence': confidence,
                'avg_cost_per_minute': avg_cost_per_minute
            }
        except Exception as e:
            print(f"[FAIL] Preference prediction error: {e}")
            return {'preference': 'balanced', 'confidence': 0.0}
    
    def detect_seasonal_patterns(self):
        """Detect seasonal traffic patterns."""
        try:
            # Get trips by month
            self.cursor.execute("""
                SELECT strftime('%m', datetime(timestamp_start, 'unixepoch')) as month,
                       AVG(duration_seconds) as avg_duration,
                       COUNT(*) as trip_count
                FROM trip_history
                GROUP BY month
                ORDER BY month
            """)
            monthly_data = self.cursor.fetchall()
            
            if len(monthly_data) < 3:
                return {'seasonal_pattern': 'insufficient_data'}
            
            # Analyze duration trends
            durations = [row[1] for row in monthly_data if row[1]]
            if not durations:
                return {'seasonal_pattern': 'no_pattern'}
            
            avg_duration = np.mean(durations)
            max_duration = max(durations)
            min_duration = min(durations)
            
            # Identify peak months
            peak_months = [row[0] for row in monthly_data if row[1] and row[1] > avg_duration * 1.2]
            
            return {
                'seasonal_pattern': 'detected' if peak_months else 'none',
                'peak_months': peak_months,
                'avg_duration': avg_duration,
                'variation': (max_duration - min_duration) / avg_duration if avg_duration > 0 else 0
            }
        except Exception as e:
            print(f"[FAIL] Seasonal pattern detection error: {e}")
            return {'seasonal_pattern': 'error'}
    
    def recommend_route(self, start_lat, start_lon, end_lat, end_lon, available_routes):
        """Recommend best route based on user preferences."""
        try:
            if not available_routes:
                return None
            
            # Get user preference
            pref = self.predict_user_preference(0, 0)
            
            # Score routes based on preference
            scored_routes = []
            for route in available_routes:
                distance = route.get('distance_km', 0)
                duration = route.get('duration_minutes', 0)
                cost = route.get('total_cost', 0)
                
                if pref['preference'] == 'cost_conscious':
                    score = -cost + (duration * 0.1)
                elif pref['preference'] == 'time_conscious':
                    score = -duration + (cost * 0.1)
                else:  # balanced
                    score = -(cost + duration * 0.5)
                
                scored_routes.append((score, route))
            
            # Return highest scored route
            best_route = max(scored_routes, key=lambda x: x[0])[1]
            best_route['recommendation_reason'] = pref['preference']
            best_route['confidence'] = pref['confidence']
            
            return best_route
        except Exception as e:
            print(f"[FAIL] Route recommendation error: {e}")
            return None
    
    def save_prediction(self, prediction_type, input_data, result, confidence):
        """Save prediction to database for model evaluation."""
        try:
            timestamp = int(time.time())
            self.cursor.execute("""
                INSERT INTO ml_predictions
                (prediction_type, input_data, prediction_result, confidence_score, timestamp)
                VALUES (?, ?, ?, ?, ?)
            """, (prediction_type, json.dumps(input_data), json.dumps(result), confidence, timestamp))
            self.conn.commit()
        except Exception as e:
            print(f"[FAIL] Prediction save error: {e}")
    
    def close(self):
        """Close database connection."""
        try:
            self.conn.close()
        except:
            pass

