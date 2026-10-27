"""One HTTP boundary for primary, recovery, fallback, multidrop and cached routes."""
import logging
from flask import g, request, jsonify
from voyagr.services.routing.integrity import normalize_requirements, assess_response, FLAGS

logger = logging.getLogger(__name__)
PATHS = {'/api/route','/api/multi-stop-route'}


def capture_hazard_snapshot(hazards):
    from flask import has_request_context
    if has_request_context():
        g.route_avoidance_hazards = hazards
    return hazards


def register_avoidance_integrity(app):
    @app.before_request
    def normalize_avoidance_contract():
        if request.path not in PATHS or request.method != 'POST': return None
        from voyagr.utils.request_budget import RoutingBudget
        g.routing_budget=RoutingBudget(30)
        data = request.get_json(silent=True)
        if not isinstance(data,dict): return None  # Existing endpoint handles body validation.
        try:
            requirements = normalize_requirements(data)
        except ValueError as error:
            return jsonify(success=False,error=str(error)),400
        g.route_avoidance_requirements = requirements
        # Explicit canonical constraints must also reach the existing provider adapters.
        for category in {r['category'] for r in data.get('avoidance_requirements',[])}:
            relevant = [r for r in requirements if FLAGS.get(r['category']) == FLAGS.get(category)]
            flag = FLAGS.get(category)
            if flag:
                data[flag] = any(r['enabled'] for r in relevant)
            if category in ('speed_cameras','red_light_cameras','other_cameras','traffic_lights','railway_crossings','other_hazards') and any(r['enabled'] for r in requirements if r['category']==category):
                data['enable_hazard_avoidance'] = True
        # Category-specific explicit requests cannot use pre-contract coarse cache keys.
        if data.get('avoidance_requirements'): data['force_refresh'] = True
        return None

    @app.after_request
    def assess_navigation_response(response):
        budget=getattr(g,'routing_budget',None)
        if budget and budget.remaining()<=0:
            failure=jsonify(success=False,error='Routing request deadline exceeded; current route retained.',error_code='ROUTING_DEADLINE_EXCEEDED',automatic_selection_allowed=False)
            failure.status_code=504
            return failure
        requirements = getattr(g,'route_avoidance_requirements',None)
        if requirements is None or response.status_code>=400 or not response.is_json: return response
        payload = response.get_json(silent=True)
        if not isinstance(payload,dict) or not payload.get('success'): return response
        hazards = getattr(g,'route_avoidance_hazards',None)
        if hazards is None:
            # Cache hits: recheck current local camera data, never trust cached assessment.
            # No new paid/network query is introduced by cache verification.
            try:
                from voyagr.services.hazards import fetch_hazards_for_route
                from voyagr.utils.validation import validate_coordinates
                raw = request.get_json(silent=True) or {}
                start, end = validate_coordinates(raw.get('start','')), validate_coordinates(raw.get('end',''))
                hazards = fetch_hazards_for_route(*start,*end) if start and end and any(r['enabled'] for r in requirements) else {}
            except Exception:
                hazards = {}
        try:
            raw=request.get_json(silent=True) or {}
            visits=payload.get('ordered_stops') if payload.get('multi_drop') else list(raw.get('via_points') or [])+list(raw.get('stops') or [])
            endpoints=None
            if visits:
                from voyagr.utils.validation import validate_coordinates
                start=validate_coordinates(raw.get('start',''))
                end=start if raw.get('round_trip') else validate_coordinates(raw.get('end',''))
                if start and end: endpoints=(start,end)
            result = assess_response(payload, requirements, hazards, waypoints=visits,endpoints=endpoints)

        except Exception as error:
            # Verification failure must not replay a cached/provider claim of compliance.
            logger.error('Route compliance unavailable (%s)',type(error).__name__)
            result = dict(payload, automatic_selection_allowed=False, avoidance_status='UNVERIFIED',
                          avoidance_requirements=requirements, routing_degraded=True,
                          avoidance_assessment={'version':1,'status':'UNVERIFIED','requires_acceptance':True,
                                                'automatic_selection_allowed':False,'geometry_valid':False,'requirements':requirements},
                          routing_warning='Avoidance verification unavailable; do not automatically select this route.')
            for route in result.get('routes',[]): route['avoidance_assessment']=result['avoidance_assessment']
        if budget and budget.remaining()<=0:
            failure=jsonify(success=False,error='Routing deadline exceeded during validation.',error_code='ROUTING_DEADLINE_EXCEEDED',automatic_selection_allowed=False)
            failure.status_code=504
            return failure
        response.set_data(app.json.dumps(result))
        if budget:
            response.headers['Server-Timing']=f'routing;dur={(budget.clock()-budget.started)*1000:.1f}, provider;dur={budget.transport_seconds*1000:.1f}'
            response.headers['X-Routing-HTTP-Calls']=str(budget.calls)
        response.headers['Cache-Control']='no-store'
        return response
