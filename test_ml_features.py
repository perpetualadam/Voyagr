"""
Comprehensive tests for Machine Learning features in Voyagr.
Tests ML route prediction, efficiency prediction, traffic prediction, and cost prediction.
"""

import unittest
import sqlite3
import time
import json
import os
from ml_route_predictor import MLRoutePredictor
from ml_efficiency_predictor import MLEfficiencyPredictor
from ml_traffic_predictor import MLTrafficPredictor
from ml_cost_predictor import MLCostPredictor


class TestMLRoutePredictor(unittest.TestCase):
    """Test ML route prediction functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.db_path = 'test_ml.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
        self.predictor = MLRoutePredictor(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database with sample data."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_history
                              (id INTEGER PRIMARY KEY, start_lat REAL, start_lon REAL,
                               end_lat REAL, end_lon REAL, distance_km REAL,
                               duration_seconds INTEGER, routing_mode TEXT, total_cost REAL,
                               timestamp_start INTEGER)''')
        
        # Insert sample trips
        for i in range(15):
            self.cursor.execute("""
                INSERT INTO trip_history
                (start_lat, start_lon, end_lat, end_lon, distance_km, duration_seconds,
                 routing_mode, total_cost, timestamp_start)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (51.5 + i*0.01, -0.1 + i*0.01, 52.5 + i*0.01, -1.8 + i*0.01,
                  50 + i*5, 3600 + i*300, 'auto', 15 + i*2, int(time.time()) - i*86400))
        
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS ml_predictions
                              (id INTEGER PRIMARY KEY, prediction_type TEXT,
                               input_data TEXT, prediction_result TEXT,
                               confidence_score REAL, timestamp INTEGER)''')
        self.conn.commit()
    
    def test_extract_route_features(self):
        """Test route feature extraction."""
        trips = [(51.5, -0.1, 52.5, -1.8, 100, 7200, 'auto', 25)]
        features = self.predictor.extract_route_features(trips)
        self.assertIsNotNone(features)
        self.assertEqual(len(features), 1)
        print("[OK] Route feature extraction works")
    
    def test_train_route_clusters(self):
        """Test route clustering training."""
        result = self.predictor.train_route_clusters(num_clusters=2)
        self.assertTrue(result)
        print("[OK] Route clustering training works")
    
    def test_predict_user_preference(self):
        """Test user preference prediction."""
        pref = self.predictor.predict_user_preference(100, 120)
        self.assertIn('preference', pref)
        self.assertIn('confidence', pref)
        print(f"[OK] User preference prediction: {pref['preference']}")
    
    def test_detect_seasonal_patterns(self):
        """Test seasonal pattern detection."""
        patterns = self.predictor.detect_seasonal_patterns()
        self.assertIn('seasonal_pattern', patterns)
        print(f"[OK] Seasonal pattern detection: {patterns['seasonal_pattern']}")
    
    def test_recommend_route(self):
        """Test route recommendation."""
        routes = [
            {'distance_km': 100, 'duration_minutes': 120, 'total_cost': 25},
            {'distance_km': 95, 'duration_minutes': 140, 'total_cost': 20}
        ]
        recommendation = self.predictor.recommend_route(51.5, -0.1, 52.5, -1.8, routes)
        self.assertIsNotNone(recommendation)
        print("[OK] Route recommendation works")
    
    def tearDown(self):
        """Clean up test database."""
        self.predictor.close()
        self.conn.close()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)


class TestMLEfficiencyPredictor(unittest.TestCase):
    """Test ML efficiency prediction functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.db_path = 'test_efficiency.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
        self.predictor = MLEfficiencyPredictor(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_history
                              (id INTEGER PRIMARY KEY, distance_km REAL,
                               duration_seconds INTEGER, total_cost REAL,
                               fuel_cost REAL, vehicle_type TEXT,
                               timestamp_start INTEGER)''')
        
        # Insert sample trips
        for i in range(15):
            self.cursor.execute("""
                INSERT INTO trip_history
                (distance_km, duration_seconds, total_cost, fuel_cost, vehicle_type, timestamp_start)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (50 + i*5, 3600 + i*300, 15 + i*2, 10 + i*1.5, 'petrol_diesel',
                  int(time.time()) - i*86400))
        
        self.conn.commit()
    
    def test_train_efficiency_model(self):
        """Test efficiency model training."""
        result = self.predictor.train_efficiency_model()
        self.assertTrue(result)
        print("[OK] Efficiency model training works")
    
    def test_train_ev_battery_model(self):
        """Test EV battery model training."""
        result = self.predictor.train_ev_battery_model()
        self.assertTrue(result)
        print("[OK] EV battery model training works")
    
    def test_predict_efficiency(self):
        """Test efficiency prediction."""
        prediction = self.predictor.predict_efficiency(100, 50, 'petrol_diesel')
        self.assertIn('efficiency', prediction)
        self.assertIn('confidence', prediction)
        print(f"[OK] Efficiency prediction: {prediction['efficiency']}")
    
    def test_predict_trip_cost(self):
        """Test trip cost prediction."""
        cost = self.predictor.predict_trip_cost(100, 120, 'petrol_diesel')
        self.assertIn('predicted_cost', cost)
        print(f"[OK] Trip cost prediction: £{cost['predicted_cost']}")
    
    def test_detect_efficiency_degradation(self):
        """Test efficiency degradation detection."""
        degradation = self.predictor.detect_efficiency_degradation()
        self.assertIn('degradation', degradation)
        print(f"[OK] Degradation detection: {degradation['degradation']}")
    
    def tearDown(self):
        """Clean up test database."""
        self.predictor.close()
        self.conn.close()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)


class TestMLTrafficPredictor(unittest.TestCase):
    """Test ML traffic prediction functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.db_path = 'test_traffic.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
        self.predictor = MLTrafficPredictor(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS traffic_cache
                              (id INTEGER PRIMARY KEY, timestamp INTEGER,
                               lat REAL, lon REAL, traffic_data TEXT)''')

        self.cursor.execute('''CREATE TABLE IF NOT EXISTS traffic_incidents
                              (id INTEGER PRIMARY KEY, lat REAL, lon REAL,
                               incident_type TEXT, timestamp INTEGER)''')

        # Insert sample traffic data (need at least 20 for training)
        for i in range(30):
            traffic_data = json.dumps({
                'average_speed': 40 + (i % 10)*2,
                'flow_speed': 45 + (i % 10)*2
            })
            self.cursor.execute("""
                INSERT INTO traffic_cache
                (timestamp, lat, lon, traffic_data)
                VALUES (?, ?, ?, ?)
            """, (int(time.time()) - i*3600, 51.5 + (i % 10)*0.01, -0.1 + (i % 10)*0.01, traffic_data))

        self.conn.commit()
    
    def test_train_anomaly_detector(self):
        """Test anomaly detector training."""
        result = self.predictor.train_anomaly_detector()
        self.assertTrue(result)
        print("[OK] Anomaly detector training works")
    
    def test_train_traffic_model(self):
        """Test traffic model training."""
        result = self.predictor.train_traffic_model()
        self.assertTrue(result)
        print("[OK] Traffic model training works")
    
    def test_predict_traffic_conditions(self):
        """Test traffic prediction."""
        prediction = self.predictor.predict_traffic_conditions(51.5, -0.1, hours_ahead=1)
        self.assertIn('prediction', prediction)
        print(f"[OK] Traffic prediction: {prediction['prediction']}")
    
    def test_detect_anomalies(self):
        """Test anomaly detection."""
        anomaly = self.predictor.detect_anomalies(51.5, -0.1, 40, 45)
        self.assertIn('anomaly', anomaly)
        print(f"[OK] Anomaly detection: {anomaly['anomaly']}")
    
    def test_recommend_departure_time(self):
        """Test departure time recommendation."""
        recommendation = self.predictor.recommend_departure_time(51.5, -0.1)
        self.assertIn('recommendation', recommendation)
        print(f"[OK] Departure time recommendation: {recommendation['recommendation']}")
    
    def test_get_incident_hotspots(self):
        """Test incident hotspot detection."""
        hotspots = self.predictor.get_incident_hotspots()
        self.assertIn('hotspots', hotspots)
        print(f"[OK] Incident hotspots: {hotspots['count']} found")
    
    def tearDown(self):
        """Clean up test database."""
        self.predictor.close()
        self.conn.close()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)


class TestMLCostPredictor(unittest.TestCase):
    """Test ML cost prediction functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.db_path = 'test_cost.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
        self.predictor = MLCostPredictor(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_history
                              (id INTEGER PRIMARY KEY, distance_km REAL,
                               duration_seconds INTEGER, total_cost REAL,
                               fuel_cost REAL, toll_cost REAL, caz_cost REAL,
                               timestamp_start INTEGER)''')
        
        # Insert sample trips
        for i in range(20):
            self.cursor.execute("""
                INSERT INTO trip_history
                (distance_km, duration_seconds, total_cost, fuel_cost, toll_cost, caz_cost, timestamp_start)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (50 + i*5, 3600 + i*300, 15 + i*2, 10 + i*1.5, 2 + i*0.5, 1 + i*0.2,
                  int(time.time()) - i*86400))
        
        self.conn.commit()
    
    def test_train_cost_model(self):
        """Test cost model training."""
        result = self.predictor.train_cost_model()
        self.assertTrue(result)
        print("[OK] Cost model training works")
    
    def test_predict_weekly_cost(self):
        """Test weekly cost prediction."""
        cost = self.predictor.predict_weekly_cost()
        self.assertIn('weekly_cost', cost)
        print(f"[OK] Weekly cost prediction: £{cost['weekly_cost']}")
    
    def test_predict_monthly_cost(self):
        """Test monthly cost prediction."""
        cost = self.predictor.predict_monthly_cost()
        self.assertIn('monthly_cost', cost)
        print(f"[OK] Monthly cost prediction: £{cost['monthly_cost']}")
    
    def test_identify_savings_opportunities(self):
        """Test savings opportunity identification."""
        opportunities = self.predictor.identify_savings_opportunities()
        self.assertIn('opportunities', opportunities)
        print(f"[OK] Savings opportunities: {opportunities['count']} found")
    
    def test_predict_fuel_price_impact(self):
        """Test fuel price impact prediction."""
        impact = self.predictor.predict_fuel_price_impact(10)
        self.assertIn('impact_percentage', impact)
        print(f"[OK] Fuel price impact: {impact['impact_percentage']:.1f}%")
    
    def test_get_budget_status(self):
        """Test budget status."""
        status = self.predictor.get_budget_status(500)
        self.assertIn('budget', status)
        print(f"[OK] Budget status: £{status['spent']}/£{status['budget']}")
    
    def tearDown(self):
        """Clean up test database."""
        self.predictor.close()
        self.conn.close()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)


if __name__ == '__main__':
    unittest.main(verbosity=2)

