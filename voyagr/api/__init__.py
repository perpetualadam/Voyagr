"""
API Blueprints for Voyagr.

Contains Flask blueprints organized by functionality:
- core: Index, manifest, service worker, config
- vehicles: Vehicle management and CAZ passes
- caz: CAZ zones, pass types, and route checking
- routing: Route calculation, multi-stop, parallel routing
- traffic: Traffic conditions, flow, incidents
- hazards: Hazard reporting, cameras, traffic lights
- trips: Trip history and analytics
- search: POI search, favorites, search history, parking
- navigation: Lane guidance, speed warnings, voice commands
- monitoring: Engine status, alerts, costs
- settings: App settings, ML predictions, traffic patterns
- costs: Cost breakdown, comparison, prediction, optimization
"""

from voyagr.api.core import core_bp
from voyagr.api.vehicles import vehicles_bp
from voyagr.api.caz import caz_bp
from voyagr.api.routing import routing_bp, set_route_cache, set_fallback_optimizer
from voyagr.api.traffic import traffic_bp
from voyagr.api.hazards import hazards_bp
from voyagr.api.trips import trips_bp
from voyagr.api.search import search_bp
from voyagr.api.navigation import navigation_bp, set_voice_limiter, set_speed_limit_detector
from voyagr.api.monitoring import monitoring_bp, set_monitor
from voyagr.api.settings import settings_bp
from voyagr.api.costs import costs_bp, set_cost_calculator

__all__ = [
    # Blueprints
    'core_bp',
    'vehicles_bp',
    'caz_bp',
    'routing_bp',
    'traffic_bp',
    'hazards_bp',
    'trips_bp',
    'search_bp',
    'navigation_bp',
    'monitoring_bp',
    'settings_bp',
    'costs_bp',
    # Registration
    'register_blueprints',
    # Setter functions
    'set_route_cache',
    'set_fallback_optimizer',
    'set_voice_limiter',
    'set_speed_limit_detector',
    'set_monitor',
    'set_cost_calculator',
]


def register_blueprints(app):
    """Register all API blueprints with the Flask app."""
    app.register_blueprint(core_bp)
    app.register_blueprint(vehicles_bp, url_prefix='/api')
    app.register_blueprint(caz_bp, url_prefix='/api')
    app.register_blueprint(routing_bp, url_prefix='/api')
    app.register_blueprint(traffic_bp, url_prefix='/api')
    app.register_blueprint(hazards_bp, url_prefix='/api')
    app.register_blueprint(trips_bp, url_prefix='/api')
    app.register_blueprint(search_bp, url_prefix='/api')
    app.register_blueprint(navigation_bp, url_prefix='/api')
    app.register_blueprint(monitoring_bp, url_prefix='/api')
    app.register_blueprint(settings_bp, url_prefix='/api')
    app.register_blueprint(costs_bp, url_prefix='/api')

