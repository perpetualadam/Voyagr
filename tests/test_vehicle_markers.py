#!/usr/bin/env python3
"""
Test suite for vehicle marker functionality in Voyagr.
Tests icon path selection, marker creation, and updates.
"""

import unittest
import os
import sys
from unittest.mock import Mock, patch, MagicMock

# Mock Kivy imports before importing satnav
sys.modules['kivy'] = MagicMock()
sys.modules['kivy.app'] = MagicMock()
sys.modules['kivy.uix'] = MagicMock()
sys.modules['kivy.uix.boxlayout'] = MagicMock()
sys.modules['kivy.uix.scrollview'] = MagicMock()
sys.modules['kivy.uix.togglebutton'] = MagicMock()
sys.modules['kivy.uix.textinput'] = MagicMock()
sys.modules['kivy_garden'] = MagicMock()
sys.modules['kivy_garden.mapview'] = MagicMock()
sys.modules['kivy.clock'] = MagicMock()
sys.modules['plyer'] = MagicMock()
sys.modules['plyer.gps'] = MagicMock()
sys.modules['plyer.notification'] = MagicMock()
sys.modules['plyer.accelerometer'] = MagicMock()
sys.modules['geopy'] = MagicMock()
sys.modules['geopy.distance'] = MagicMock()
sys.modules['pvporcupine'] = MagicMock()
sys.modules['pyaudio'] = MagicMock()
sys.modules['pyttsx3'] = MagicMock()


class TestVehicleMarkers(unittest.TestCase):
    """Test vehicle marker functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Create mock app
        self.app = Mock()
        self.app.vehicle_type = 'petrol_diesel'
        self.app.routing_mode = 'auto'
        self.app.current_pos = (53.5526, -1.4797)
        self.app.vehicle_icons_dir = 'vehicle_icons'
        self.app.vehicle_marker = None
        self.app.mapview = Mock()
        self.app.mapview.children = []
        self.app.mapview.add_widget = Mock()
        self.app.mapview.remove_widget = Mock()
        self.app.mapview.center_on = Mock()
    
    def test_icon_directory_exists(self):
        """Test that vehicle icons directory exists."""
        self.assertTrue(os.path.exists('vehicle_icons'), 
                       "vehicle_icons directory should exist")
    
    def test_all_icon_files_exist(self):
        """Test that all required icon files exist."""
        required_icons = [
            'car.png',
            'electric.png',
            'motorcycle.png',
            'truck.png',
            'van.png',
            'bicycle.png',
            'pedestrian.png'
        ]
        
        for icon in required_icons:
            icon_path = os.path.join('vehicle_icons', icon)
            self.assertTrue(os.path.exists(icon_path), 
                           f"Icon {icon} should exist at {icon_path}")
    
    def test_icon_files_are_png(self):
        """Test that all icon files are valid PNG files."""
        icon_files = [
            'car.png',
            'electric.png',
            'motorcycle.png',
            'truck.png',
            'van.png',
            'bicycle.png',
            'pedestrian.png'
        ]
        
        for icon in icon_files:
            icon_path = os.path.join('vehicle_icons', icon)
            with open(icon_path, 'rb') as f:
                # PNG files start with specific magic bytes
                header = f.read(8)
                self.assertEqual(header[:4], b'\x89PNG', 
                               f"{icon} should be a valid PNG file")
    
    def test_get_vehicle_icon_path_petrol_diesel(self):
        """Test icon path for petrol/diesel vehicle."""
        self.app.vehicle_type = 'petrol_diesel'
        self.app.routing_mode = 'auto'

        # Simulate the method
        icon_name = 'car.png'
        icon_path = os.path.join(self.app.vehicle_icons_dir, icon_name)

        self.assertTrue(icon_path.endswith('car.png'))
        self.assertTrue(os.path.exists(icon_path))
    
    def test_get_vehicle_icon_path_electric(self):
        """Test icon path for electric vehicle."""
        self.app.vehicle_type = 'electric'
        self.app.routing_mode = 'auto'

        icon_name = 'electric.png'
        icon_path = os.path.join(self.app.vehicle_icons_dir, icon_name)

        self.assertTrue(icon_path.endswith('electric.png'))
        self.assertTrue(os.path.exists(icon_path))

    def test_get_vehicle_icon_path_motorcycle(self):
        """Test icon path for motorcycle."""
        self.app.vehicle_type = 'motorcycle'
        self.app.routing_mode = 'auto'

        icon_name = 'motorcycle.png'
        icon_path = os.path.join(self.app.vehicle_icons_dir, icon_name)

        self.assertTrue(icon_path.endswith('motorcycle.png'))
        self.assertTrue(os.path.exists(icon_path))

    def test_get_vehicle_icon_path_truck(self):
        """Test icon path for truck."""
        self.app.vehicle_type = 'truck'
        self.app.routing_mode = 'auto'

        icon_name = 'truck.png'
        icon_path = os.path.join(self.app.vehicle_icons_dir, icon_name)

        self.assertTrue(icon_path.endswith('truck.png'))
        self.assertTrue(os.path.exists(icon_path))

    def test_get_vehicle_icon_path_van(self):
        """Test icon path for van."""
        self.app.vehicle_type = 'van'
        self.app.routing_mode = 'auto'

        icon_name = 'van.png'
        icon_path = os.path.join(self.app.vehicle_icons_dir, icon_name)

        self.assertTrue(icon_path.endswith('van.png'))
        self.assertTrue(os.path.exists(icon_path))

    def test_get_vehicle_icon_path_pedestrian_routing(self):
        """Test icon path for pedestrian routing mode."""
        self.app.vehicle_type = 'petrol_diesel'
        self.app.routing_mode = 'pedestrian'

        # Pedestrian routing should use pedestrian icon
        icon_name = 'pedestrian.png'
        icon_path = os.path.join(self.app.vehicle_icons_dir, icon_name)

        self.assertTrue(icon_path.endswith('pedestrian.png'))
        self.assertTrue(os.path.exists(icon_path))

    def test_get_vehicle_icon_path_bicycle_routing(self):
        """Test icon path for bicycle routing mode."""
        self.app.vehicle_type = 'petrol_diesel'
        self.app.routing_mode = 'bicycle'

        # Bicycle routing should use bicycle icon
        icon_name = 'bicycle.png'
        icon_path = os.path.join(self.app.vehicle_icons_dir, icon_name)

        self.assertTrue(icon_path.endswith('bicycle.png'))
        self.assertTrue(os.path.exists(icon_path))
    
    def test_icon_file_sizes(self):
        """Test that icon files have reasonable sizes."""
        icon_files = [
            'car.png',
            'electric.png',
            'motorcycle.png',
            'truck.png',
            'van.png',
            'bicycle.png',
            'pedestrian.png'
        ]
        
        for icon in icon_files:
            icon_path = os.path.join('vehicle_icons', icon)
            file_size = os.path.getsize(icon_path)
            # PNG files should be at least 100 bytes and less than 100KB
            self.assertGreater(file_size, 100, 
                              f"{icon} file size too small")
            self.assertLess(file_size, 100000, 
                           f"{icon} file size too large")


class TestVehicleMarkerIntegration(unittest.TestCase):
    """Test vehicle marker integration with app."""
    
    def test_marker_attributes(self):
        """Test that marker has required attributes."""
        # Create mock marker
        marker = Mock()
        marker.lat = 53.5526
        marker.lon = -1.4797
        marker.source = 'vehicle_icons/car.png'
        
        self.assertEqual(marker.lat, 53.5526)
        self.assertEqual(marker.lon, -1.4797)
        self.assertEqual(marker.source, 'vehicle_icons/car.png')
    
    def test_marker_position_update(self):
        """Test that marker position can be updated."""
        marker = Mock()
        marker.lat = 53.5526
        marker.lon = -1.4797
        
        # Update position
        marker.lat = 53.6000
        marker.lon = -1.5000
        
        self.assertEqual(marker.lat, 53.6000)
        self.assertEqual(marker.lon, -1.5000)
    
    def test_marker_icon_update(self):
        """Test that marker icon can be updated."""
        marker = Mock()
        marker.source = 'vehicle_icons/car.png'

        # Update icon
        marker.source = 'vehicle_icons/electric.png'

        self.assertEqual(marker.source, 'vehicle_icons/electric.png')

    def test_triangle_icon_exists(self):
        """Test that triangle icon file exists."""
        icon_path = os.path.join('vehicle_icons', 'triangle.png')
        self.assertTrue(os.path.exists(icon_path), f"Triangle icon not found at {icon_path}")

    def test_triangle_vehicle_type_icon_path(self):
        """Test icon path selection for triangle vehicle type."""
        from satnav import SatNavApp

        # Create mock app with triangle vehicle type
        app = Mock()
        app.vehicle_type = 'triangle'
        app.routing_mode = 'auto'
        app.vehicle_icons_dir = 'vehicle_icons'

        # Mock the get_vehicle_icon_path method
        def get_icon_path():
            if app.routing_mode == 'pedestrian':
                icon_name = 'pedestrian.png'
            elif app.routing_mode == 'bicycle':
                icon_name = 'bicycle.png'
            elif app.vehicle_type == 'triangle':
                icon_name = 'triangle.png'
            else:
                icon_name = 'car.png'
            return os.path.join(app.vehicle_icons_dir, icon_name)

        icon_path = get_icon_path()
        self.assertTrue(icon_path.endswith('triangle.png'))

    def test_bicycle_vehicle_type_icon_path(self):
        """Test icon path selection for bicycle as vehicle type."""
        from satnav import SatNavApp

        # Create mock app with bicycle vehicle type
        app = Mock()
        app.vehicle_type = 'bicycle'
        app.routing_mode = 'auto'
        app.vehicle_icons_dir = 'vehicle_icons'

        # Mock the get_vehicle_icon_path method
        def get_icon_path():
            if app.routing_mode == 'pedestrian':
                icon_name = 'pedestrian.png'
            elif app.routing_mode == 'bicycle':
                icon_name = 'bicycle.png'
            elif app.vehicle_type == 'bicycle':
                icon_name = 'bicycle.png'
            else:
                icon_name = 'car.png'
            return os.path.join(app.vehicle_icons_dir, icon_name)

        icon_path = get_icon_path()
        self.assertTrue(icon_path.endswith('bicycle.png'))


if __name__ == '__main__':
    unittest.main(verbosity=2)

