"""
Voyagr Android - Minimal version for Android deployment
This is a simplified version that works reliably on Android devices.
"""

from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.uix.textinput import TextInput
from kivy.uix.scrollview import ScrollView
from kivy.uix.popup import Popup
from kivy.graphics import Color, Rectangle
from kivy.clock import Clock
import threading
import requests
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')

class VoyagrApp(App):
    def build(self):
        """Build the main UI"""
        self.title = 'Voyagr Navigation'
        
        # Main layout
        main_layout = BoxLayout(orientation='vertical', padding=10, spacing=10)
        
        # Header
        header = Label(
            text='Voyagr Navigation System',
            size_hint_y=0.1,
            font_size='20sp',
            bold=True
        )
        main_layout.add_widget(header)
        
        # Scrollable content area
        scroll = ScrollView(size_hint=(1, 0.8))
        content = GridLayout(cols=1, spacing=10, size_hint_y=None)
        content.bind(minimum_height=content.setter('height'))
        
        # Status label
        self.status_label = Label(
            text='Ready',
            size_hint_y=None,
            height=50,
            markup=True
        )
        content.add_widget(self.status_label)
        
        # Start location input
        start_label = Label(text='Start Location:', size_hint_y=None, height=30)
        content.add_widget(start_label)
        self.start_input = TextInput(
            multiline=False,
            hint_text='Enter start address or coordinates',
            size_hint_y=None,
            height=40
        )
        content.add_widget(self.start_input)
        
        # End location input
        end_label = Label(text='End Location:', size_hint_y=None, height=30)
        content.add_widget(end_label)
        self.end_input = TextInput(
            multiline=False,
            hint_text='Enter destination address or coordinates',
            size_hint_y=None,
            height=40
        )
        content.add_widget(self.end_input)
        
        # Route info display
        self.route_info = Label(
            text='Route information will appear here',
            size_hint_y=None,
            height=100,
            markup=True
        )
        content.add_widget(self.route_info)
        
        scroll.add_widget(content)
        main_layout.add_widget(scroll)
        
        # Button layout
        button_layout = GridLayout(cols=2, spacing=10, size_hint_y=0.15)
        
        calculate_btn = Button(text='Calculate Route')
        calculate_btn.bind(on_press=self.on_calculate_route)
        button_layout.add_widget(calculate_btn)
        
        clear_btn = Button(text='Clear')
        clear_btn.bind(on_press=self.on_clear)
        button_layout.add_widget(clear_btn)
        
        main_layout.add_widget(button_layout)
        
        return main_layout
    
    def on_calculate_route(self, instance):
        """Calculate route when button is pressed"""
        start = self.start_input.text.strip()
        end = self.end_input.text.strip()
        
        if not start or not end:
            self.status_label.text = '[color=ff0000]Please enter both start and end locations[/color]'
            return
        
        self.status_label.text = '[color=ffff00]Calculating route...[/color]'
        
        # Run in background thread
        thread = threading.Thread(target=self._calculate_route_thread, args=(start, end))
        thread.daemon = True
        thread.start()
    
    def _calculate_route_thread(self, start, end):
        """Background thread for route calculation"""
        try:
            # Try to parse as coordinates (lat,lon format)
            try:
                start_parts = start.split(',')
                end_parts = end.split(',')
                start_coords = [float(start_parts[1].strip()), float(start_parts[0].strip())]
                end_coords = [float(end_parts[1].strip()), float(end_parts[0].strip())]
            except:
                # If not coordinates, use default test coordinates
                start_coords = [51.5074, -0.1278]  # London
                end_coords = [51.5174, -0.1278]    # London (slightly north)
            
            # Call Valhalla API
            url = f"{VALHALLA_URL}/route"
            payload = {
                "locations": [
                    {"lat": start_coords[0], "lon": start_coords[1]},
                    {"lat": end_coords[0], "lon": end_coords[1]}
                ],
                "costing": "auto"
            }
            
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'trip' in data and 'legs' in data['trip']:
                    distance = data['trip']['summary']['length']
                    time = data['trip']['summary']['time']
                    
                    # Update UI on main thread
                    Clock.schedule_once(
                        lambda dt: self._update_route_info(distance, time),
                        0
                    )
                else:
                    Clock.schedule_once(
                        lambda dt: self._show_error('No route found'),
                        0
                    )
            else:
                Clock.schedule_once(
                    lambda dt: self._show_error(f'API Error: {response.status_code}'),
                    0
                )
        
        except Exception as e:
            Clock.schedule_once(
                lambda dt: self._show_error(f'Error: {str(e)}'),
                0
            )
    
    def _update_route_info(self, distance, time):
        """Update route information display"""
        distance_km = distance / 1000
        time_min = time / 60
        
        self.route_info.text = (
            f'[b]Route Information:[/b]\n'
            f'Distance: {distance_km:.2f} km\n'
            f'Time: {time_min:.0f} minutes\n'
            f'[color=00ff00]Route calculated successfully![/color]'
        )
        self.status_label.text = '[color=00ff00]Route ready[/color]'
    
    def _show_error(self, error_msg):
        """Show error message"""
        self.route_info.text = f'[color=ff0000]{error_msg}[/color]'
        self.status_label.text = '[color=ff0000]Error occurred[/color]'
    
    def on_clear(self, instance):
        """Clear all inputs"""
        self.start_input.text = ''
        self.end_input.text = ''
        self.route_info.text = 'Route information will appear here'
        self.status_label.text = 'Ready'


if __name__ == '__main__':
    VoyagrApp().run()

