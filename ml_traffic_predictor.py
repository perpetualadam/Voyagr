"""
Machine Learning Traffic Prediction Module for Voyagr
Predicts traffic conditions and detects anomalies.
"""

import json
import time
import numpy as np
from datetime import datetime, timedelta
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
import sqlite3


class MLTrafficPredictor:
    """ML-based traffic prediction and anomaly detection."""
    
    def __init__(self, db_path='satnav.db'):
        """Initialize the traffic predictor."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.anomaly_detector = None
        self.traffic_model = None
        self.min_samples = 20
        
    def extract_traffic_features(self, traffic_data):
        """Extract features from traffic data."""
        try:
            features = []
            
            for data in traffic_data:
                timestamp, lat, lon, avg_speed, flow_speed = data
                
                # Extract time features
                dt = datetime.fromtimestamp(timestamp)
                hour = dt.hour
                day_of_week = dt.weekday()
                
                # Calculate speed metrics
                speed_ratio = flow_speed / avg_speed if avg_speed > 0 else 1
                
                features.append([
                    hour, day_of_week, avg_speed, flow_speed, speed_ratio
                ])
            
            return np.array(features)
        except Exception as e:
            print(f"[FAIL] Traffic feature extraction error: {e}")
            return None
    
    def train_anomaly_detector(self):
        """Train anomaly detection model on traffic data."""
        try:
            # Get traffic incidents
            self.cursor.execute("""
                SELECT timestamp, lat, lon, 
                       CAST(json_extract(traffic_data, '$.average_speed') AS REAL) as avg_speed,
                       CAST(json_extract(traffic_data, '$.flow_speed') AS REAL) as flow_speed
                FROM traffic_cache
                ORDER BY timestamp DESC LIMIT 200
            """)
            traffic_data = self.cursor.fetchall()
            
            if len(traffic_data) < self.min_samples:
                print(f"[OK] Insufficient traffic data ({len(traffic_data)} records)")
                return False
            
            features = self.extract_traffic_features(traffic_data)
            if features is None or len(features) < self.min_samples:
                return False
            
            # Train Isolation Forest
            self.anomaly_detector = IsolationForest(
                contamination=0.1, random_state=42, n_estimators=50
            )
            self.anomaly_detector.fit(features)
            
            print(f"[OK] Anomaly detector trained on {len(traffic_data)} records")
            return True
        except Exception as e:
            print(f"[FAIL] Anomaly detector training error: {e}")
            return False
    
    def train_traffic_model(self):
        """Train traffic prediction model."""
        try:
            # Get historical traffic data
            self.cursor.execute("""
                SELECT timestamp, traffic_data
                FROM traffic_cache
                WHERE traffic_data IS NOT NULL
                ORDER BY timestamp DESC LIMIT 200
            """)
            data = self.cursor.fetchall()

            if len(data) < self.min_samples:
                print(f"[OK] Insufficient data for traffic model ({len(data)} records)")
                return False

            # Prepare features (time-based)
            X = []
            y = []
            for i in range(len(data) - 1):
                timestamp = data[i][0]
                dt = datetime.fromtimestamp(timestamp)
                hour = dt.hour
                day_of_week = dt.weekday()

                try:
                    traffic_json = json.loads(data[i][1])
                    avg_speed = traffic_json.get('average_speed', 40)
                except:
                    avg_speed = 40

                X.append([hour, day_of_week])
                y.append(avg_speed)

            if len(X) < self.min_samples:
                return False
            
            # Train model
            if len(X) < 2:
                print(f"[OK] Insufficient data for traffic model ({len(X)} records)")
                return False

            self.traffic_model = LinearRegression()
            self.traffic_model.fit(X, y)

            score = self.traffic_model.score(X, y)
            print(f"[OK] Traffic model trained (R²={score:.3f}, {len(X)} records)")
            return True
        except Exception as e:
            print(f"[FAIL] Traffic model training error: {e}")
            return False
    
    def predict_traffic_conditions(self, lat, lon, hours_ahead=1):
        """Predict traffic conditions for a location."""
        try:
            if self.traffic_model is None:
                return {'prediction': None, 'confidence': 0.0}
            
            # Calculate future time
            future_time = datetime.now() + timedelta(hours=hours_ahead)
            hour = future_time.hour
            day_of_week = future_time.weekday()
            
            # Make prediction
            features = np.array([[hour, day_of_week]])
            predicted_speed = self.traffic_model.predict(features)[0]
            
            # Classify congestion level
            if predicted_speed < 20:
                congestion = 'heavy'
            elif predicted_speed < 40:
                congestion = 'moderate'
            else:
                congestion = 'light'
            
            return {
                'prediction': congestion,
                'predicted_speed': max(predicted_speed, 0),
                'confidence': 0.6,
                'hours_ahead': hours_ahead
            }
        except Exception as e:
            print(f"[FAIL] Traffic prediction error: {e}")
            return {'prediction': None, 'confidence': 0.0}
    
    def detect_anomalies(self, lat, lon, avg_speed, flow_speed):
        """Detect anomalous traffic patterns."""
        try:
            if self.anomaly_detector is None:
                return {'anomaly': False, 'confidence': 0.0}
            
            # Extract features
            dt = datetime.now()
            hour = dt.hour
            day_of_week = dt.weekday()
            speed_ratio = flow_speed / avg_speed if avg_speed > 0 else 1
            
            features = np.array([[hour, day_of_week, avg_speed, flow_speed, speed_ratio]])
            
            # Predict anomaly
            prediction = self.anomaly_detector.predict(features)[0]
            is_anomaly = prediction == -1
            
            # Get anomaly score
            score = -self.anomaly_detector.score_samples(features)[0]
            
            return {
                'anomaly': is_anomaly,
                'anomaly_score': score,
                'confidence': min(score, 1.0)
            }
        except Exception as e:
            print(f"[FAIL] Anomaly detection error: {e}")
            return {'anomaly': False, 'confidence': 0.0}
    
    def recommend_departure_time(self, lat, lon):
        """Recommend optimal departure time."""
        try:
            # Check traffic for next 24 hours
            best_time = None
            best_speed = 0
            
            for hours_ahead in range(0, 24, 2):
                prediction = self.predict_traffic_conditions(lat, lon, hours_ahead)
                if prediction['predicted_speed'] > best_speed:
                    best_speed = prediction['predicted_speed']
                    best_time = hours_ahead
            
            if best_time is None:
                return {'recommendation': 'now', 'confidence': 0.0}
            
            return {
                'recommendation': f'in {best_time} hours',
                'predicted_speed': best_speed,
                'confidence': 0.6
            }
        except Exception as e:
            print(f"[FAIL] Departure time recommendation error: {e}")
            return {'recommendation': 'now', 'confidence': 0.0}
    
    def get_incident_hotspots(self):
        """Identify high-risk areas for incidents."""
        try:
            # Get incident locations
            self.cursor.execute("""
                SELECT lat, lon, COUNT(*) as incident_count
                FROM traffic_incidents
                GROUP BY ROUND(lat, 2), ROUND(lon, 2)
                ORDER BY incident_count DESC LIMIT 10
            """)
            hotspots = self.cursor.fetchall()
            
            return {
                'hotspots': [
                    {'lat': h[0], 'lon': h[1], 'incidents': h[2]}
                    for h in hotspots
                ],
                'count': len(hotspots)
            }
        except Exception as e:
            print(f"[FAIL] Hotspot detection error: {e}")
            return {'hotspots': [], 'count': 0}
    
    def close(self):
        """Close database connection."""
        try:
            self.conn.close()
        except:
            pass

