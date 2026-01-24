"""
Monitoring blueprint for Voyagr.

Contains:
- Engine status monitoring
- Alert management
- Cost tracking
- Bandwidth usage
"""

import logging
from datetime import datetime
from flask import Blueprint, jsonify, request, send_file

logger = logging.getLogger(__name__)

monitoring_bp = Blueprint('monitoring', __name__)

# Global reference to monitor (set by main app)
_monitor = None


def set_monitor(monitor):
    """Set the monitor instance."""
    global _monitor
    _monitor = monitor


def get_monitor():
    """Get the monitor instance."""
    return _monitor


@monitoring_bp.route('/monitoring/engine-status', methods=['GET'])
def get_engine_status_endpoint():
    """Get current status of all routing engines."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        status = monitor.get_all_engine_status()
        return jsonify({'success': True, 'engines': status})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/engine-status/<engine_name>', methods=['GET'])
def get_single_engine_status(engine_name: str):
    """Get status of a specific routing engine."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        status = monitor.get_engine_status(engine_name)
        if not status:
            return jsonify({'success': False, 'error': 'Engine not found'})

        return jsonify({'success': True, 'engine': status})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts', methods=['GET'])
def get_alerts_endpoint():
    """Get recent routing alerts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 10, type=int)
        alerts = monitor.get_recent_alerts(limit)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/<int:alert_id>/resolve', methods=['POST'])
def resolve_alert_endpoint(alert_id: int):
    """Mark an alert as resolved."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        monitor.resolve_alert(alert_id)
        return jsonify({'success': True, 'message': 'Alert resolved'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/costs', methods=['GET', 'POST'])
def manage_costs_endpoint():
    """Get or track OCI costs."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        if request.method == 'GET':
            days = request.args.get('days', 30, type=int)
            costs = monitor.get_daily_costs(days)
            return jsonify({'success': True, 'costs': costs})

        else:  # POST
            data = request.json
            bandwidth_gb = data.get('bandwidth_gb', 0)
            api_requests = data.get('api_requests', 0)
            monitor.track_oci_cost(bandwidth_gb, api_requests)
            return jsonify({'success': True, 'message': 'Cost tracked'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/health-check', methods=['POST'])
def manual_health_check():
    """Manually trigger a health check for all engines."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        results = {}
        for engine_name in ['valhalla', 'osrm']:
            status, response_time, error = monitor.check_engine_health(engine_name)
            monitor.record_health_check(engine_name, status, response_time, error)
            results[engine_name] = {
                'status': status,
                'response_time_ms': round(response_time, 2),
                'error': error
            }

        return jsonify({'success': True, 'results': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/summary', methods=['GET'])
def get_alerts_summary():
    """Get summary of all alerts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        summary = monitor.get_alert_summary()
        return jsonify({'success': True, 'summary': summary})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/severity/<severity>', methods=['GET'])
def get_alerts_by_severity(severity: str):
    """Get alerts filtered by severity level."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 10, type=int)
        alerts = monitor.get_alerts_by_severity(severity, limit)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/engine/<engine_name>', methods=['GET'])
def get_alerts_by_engine_endpoint(engine_name: str):
    """Get alerts for a specific engine."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 10, type=int)
        alerts = monitor.get_alerts_by_engine(engine_name, limit)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/unresolved', methods=['GET'])
def get_unresolved_alerts():
    """Get all unresolved alerts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 50, type=int)
        alerts = monitor.get_recent_alerts(limit, unresolved_only=True)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/<int:alert_id>/notify', methods=['POST'])
def send_alert_notification(alert_id: int):
    """Send notification for an alert."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        method = request.json.get('method', 'log') if request.json else 'log'
        success = monitor.send_alert_notification(alert_id, method)

        if success:
            return jsonify({'success': True, 'message': f'Notification sent via {method}'})
        else:
            return jsonify({'success': False, 'error': 'Failed to send notification'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/engine/<engine_name>/resolve-all', methods=['POST'])
def resolve_all_engine_alerts(engine_name: str):
    """Resolve all unresolved alerts for an engine."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        monitor.resolve_all_alerts_for_engine(engine_name)
        return jsonify({'success': True, 'message': f'All alerts for {engine_name} resolved'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/alerts/resolve-all', methods=['POST'])
def resolve_all_alerts():
    """Resolve ALL unresolved alerts (all engines)."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        affected = monitor.resolve_all_alerts()
        return jsonify({'success': True, 'message': f'Resolved {affected} alerts', 'count': affected})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ===== COST ANALYSIS ENDPOINTS =====

@monitoring_bp.route('/monitoring/costs/bandwidth', methods=['GET'])
def get_bandwidth_usage():
    """Get bandwidth usage history."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        bandwidth_data = monitor.get_bandwidth_usage(days)
        return jsonify({'success': True, 'bandwidth': bandwidth_data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/costs/requests', methods=['GET'])
def get_request_counts():
    """Get API request counts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        request_data = monitor.get_request_counts(days)
        return jsonify({'success': True, 'requests': request_data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/costs/estimate', methods=['GET'])
def estimate_monthly_cost():
    """Get estimated monthly OCI costs."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        estimate = monitor.estimate_monthly_cost(days)
        return jsonify({'success': True, 'estimate': estimate})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/costs/trends', methods=['GET'])
def analyze_cost_trends():
    """Analyze cost trends and anomalies."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        trends = monitor.analyze_cost_trends(days)
        return jsonify({'success': True, 'trends': trends})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/costs/history', methods=['GET'])
def get_cost_history():
    """Get comprehensive cost history."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        history = monitor.get_cost_history(days)
        return jsonify({'success': True, 'history': history})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/costs/export', methods=['GET'])
def export_cost_history():
    """Export cost history to CSV."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        filename = f'cost_history_{datetime.now().strftime("%Y%m%d")}.csv'
        result = monitor.export_cost_history_csv(days, filename)

        if result:
            return send_file(result, as_attachment=True, download_name=filename)
        else:
            return jsonify({'success': False, 'error': 'Failed to export cost history'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@monitoring_bp.route('/monitoring/costs/track', methods=['POST'])
def track_bandwidth_and_requests():
    """Track bandwidth and API requests."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        data = request.json
        engine_name = data.get('engine_name', 'valhalla')
        inbound_gb = data.get('inbound_gb', 0)
        outbound_gb = data.get('outbound_gb', 0)
        request_type = data.get('request_type', 'route_calculation')

        monitor.track_bandwidth(engine_name, inbound_gb, outbound_gb, request_type)
        monitor.track_api_request(engine_name, request_type)

        return jsonify({'success': True, 'message': 'Bandwidth and request tracked'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

