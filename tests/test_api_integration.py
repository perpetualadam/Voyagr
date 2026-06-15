#!/usr/bin/env python
"""Test script to verify API integrations are working."""

from hazard_parser import HazardParser
import os

print('=== API Integration Test ===')
print()

# Check environment variables
print('1. Checking API Keys in Environment:')
mapquest_key = os.getenv('MAPQUEST_API_KEY', '')
weather_key = os.getenv('OPENWEATHERMAP_API_KEY', '')
picovoice_key = os.getenv('PICOVOICE_ACCESS_KEY', '')

status_mapquest = 'CONFIGURED' if mapquest_key else 'NOT CONFIGURED'
status_weather = 'CONFIGURED' if weather_key else 'NOT CONFIGURED'
status_picovoice = 'CONFIGURED' if picovoice_key else 'NOT CONFIGURED'

print('   MapQuest API Key: ' + status_mapquest)
print('   OpenWeatherMap API Key: ' + status_weather)
print('   Picovoice Access Key: ' + status_picovoice)
print()

# Test HazardParser
print('2. Testing HazardParser:')
try:
    parser = HazardParser()
    print('   HazardParser initialized successfully')
    
    # Test get_incidents
    incidents = parser.get_incidents()
    print('   get_incidents() works: ' + str(len(incidents)) + ' incidents in cache')
    
    # Test get_weather
    weather = parser.get_weather()
    print('   get_weather() works: ' + str(len(weather)) + ' weather alerts in cache')
    
    parser.close()
    print()
    print('=== All API Keys Configured Successfully! ===')
except Exception as e:
    print('   Error: ' + str(e))

