"""Versioned avoidance requirements and independent, evidence-bounded compliance.

Provider option acceptance is never proof of compliance. Client-supplied coverage
and claims are deliberately not inputs to the HTTP integration's evaluator.
"""
import copy
import hashlib
import json
import math
import time

from voyagr.utils.hazard_matching import SegmentIndex

VERSION = 1
CATEGORIES = {
    'speed_cameras': ('camera_speed','camera_average_speed'),
    'red_light_cameras': ('camera_red_light',),
    'other_cameras': ('camera_other','camera_bus_lane','camera_mobile','camera'),
    'traffic_lights': ('traffic_light',), 'railway_crossings': ('railway_crossing',),
    'other_hazards': ('police','roadworks','accident','pothole','debris','road_closed'),
    'avoid_points': ('avoid_point',),
    'tolls': (), 'caz': (), 'congestion_charging': (), 'motorways': (), 'ferries': (), 'unpaved': (),
}
FLAGS = {
    'speed_cameras':'avoid_cameras','red_light_cameras':'avoid_cameras','other_cameras':'avoid_cameras',
    'traffic_lights':'avoid_traffic_lights','railway_crossings':'avoid_railway_crossings',
    'tolls':'avoid_tolls','caz':'avoid_caz','congestion_charging':'avoid_caz',
    'motorways':'avoid_motorways','ferries':'avoid_ferries','unpaved':'avoid_unpaved',
}
# Configured integration capabilities, not assertions about an installed server build.
CAPABILITIES = {
    'Valhalla': {'point_exclusions':'requested', 'penalties':'requested', 'polygons':'not_used', 'verified_installation':False},
    'GraphHopper': {'polygons':'custom_model_requested', 'penalties':'requested', 'point_exclusions':'via_areas', 'verified_installation':False},
    'OSRM': {'polygons':'unsupported', 'point_exclusions':'unsupported', 'penalties':'unsupported', 'verified_installation':False},
    'Unknown': {'verified_installation':False},
}


def normalize_requirements(data):
    mode = data.get('avoidance_mode', 'preference')
    if mode not in ('mandatory','preference'):
        raise ValueError('Invalid avoidance mode')
    for flag in set(FLAGS.values()) | {'enable_hazard_avoidance'}:
        if flag in data and not isinstance(data[flag], bool):
            raise ValueError('Avoidance flags must be booleans')
    master = data.get('enable_hazard_avoidance', False) or bool(data.get('avoid_points'))
    legacy = {
        'speed_cameras': master and data.get('avoid_cameras',True),
        'red_light_cameras': master and data.get('avoid_cameras',True),
        'other_cameras': master and data.get('avoid_cameras',True),
        'traffic_lights': master and data.get('avoid_traffic_lights',True),
        'railway_crossings': master and data.get('avoid_railway_crossings',True),
        'other_hazards': master,
        'avoid_points': bool(data.get('avoid_points')),
        'caz': data.get('avoid_caz',True) and not data.get('caz_exempt',False) and data.get('vehicle_type') != 'electric',
        'congestion_charging': data.get('avoid_caz',True) and not data.get('caz_exempt',False) and data.get('vehicle_type') != 'electric',
    }
    legacy.update({k:data.get(v,False) for k,v in FLAGS.items() if k not in legacy})
    result = {k: {'category':k,'enabled':bool(legacy.get(k)), 'mode':mode,'scope':'route'} for k in CATEGORIES}
    explicit = data.get('avoidance_requirements', [])
    if not isinstance(explicit,list) or len(explicit)>len(CATEGORIES):
        raise ValueError('Invalid avoidance requirements')
    seen = set()
    for item in explicit:
        if not isinstance(item,dict) or not isinstance(item.get('category'),str) or item['category'] not in CATEGORIES or item['category'] in seen:
            raise ValueError('Unknown or duplicate avoidance category')
        category = item['category']; seen.add(category)
        if not isinstance(item.get('enabled'),bool) or item.get('mode') not in ('mandatory','preference') or item.get('scope','route') != 'route':
            raise ValueError('Invalid avoidance requirement')
        result[category] = {'category':category,'enabled':item['enabled'],'mode':item['mode'],'scope':'route'}
    return list(result.values())


def requirement_fingerprint(requirements):
    return hashlib.sha256(json.dumps(requirements, sort_keys=True, separators=(',',':')).encode()).hexdigest()[:24]


def engine_name(route, fallback=''):
    source = str(route.get('source') or fallback)
    for name in ('OSRM','GraphHopper','Valhalla'):
        if name.lower() in source.lower():
            return name
    return 'Unknown'


def _geometry(route):
    from voyagr.services.routing.journey_geometry import decode_geometry, IncompleteJourney
    try: return decode_geometry(route.get('geometry'),route.get('geometry_precision',6))
    except IncompleteJourney: return []


def _coverage_for(category, buckets, hazards, coords, now):
    coverage = getattr(hazards,'coverage',{})
    # Each relevant bucket must have explicit successful, untruncated coverage.
    statuses = []
    sources = []
    for bucket in buckets:
        c = getattr(hazards.get(bucket),'coverage',None) or coverage.get(bucket,{})
        status = c.get('status','UNKNOWN')
        bounds = c.get('bounds')
        if status == 'AVAILABLE':
            if not isinstance(bounds,(list,tuple)) or len(bounds)!=4 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in bounds): status='UNKNOWN'
            elif not bounds or not all(bounds[0]<=p[0]<=bounds[2] and bounds[1]<=p[1]<=bounds[3] for p in coords): status='PARTIAL'
            if not isinstance(c.get('retrieved_at'),(int,float)) or not 0<=now-c['retrieved_at']<=600: status='STALE'
        statuses.append(status); sources.append(c.get('source','unknown'))
    return ('AVAILABLE' if statuses and all(s=='AVAILABLE' for s in statuses) else 'UNKNOWN' if not statuses else next((s for s in statuses if s!='AVAILABLE'),'UNKNOWN')), sorted(set(sources))


def assess_route(route, requirements, hazards=None, *, fallback_source='', now=None):
    hazards = hazards if hazards is not None else {}
    now = time.time() if now is None else now
    from voyagr.services.routing.journey_geometry import geometry_binding
    coords = _geometry(route)
    index = SegmentIndex(coords, route.get('road_segments',())) if coords else None
    engine = engine_name(route, fallback_source)
    rows = []
    for requirement in requirements:
        row = dict(requirement, status='SATISFIED', coverage='NOT_APPLICABLE', verification='disabled',
                   engine=engine, engine_capability='not_requested', conflicts=0, uncertain_matches=0, unrelated_matches=0, outside_radius=0, unknown_or_stale=0)
        if requirement['enabled']:
            category = requirement['category']; buckets = CATEGORIES[category]
            row.update(status='UNVERIFIED', coverage='UNKNOWN', verification='insufficient_evidence', engine_capability='unsupported' if engine=='OSRM' else 'best_effort')
            if index and buckets:
                coverage, sources = _coverage_for(category,buckets,hazards,coords,now)
                row.update(coverage=coverage, sources=sources)
                seen = set()
                for bucket in buckets:
                    for hazard in hazards.get(bucket,[]) or []:
                        if not isinstance(hazard,dict): row['uncertain_matches']+=1; continue
                        identity = (bucket,) + tuple(str(hazard.get(field)) for field in ('id','lat','lon','road_id','road_id_namespace','osm_way_id','graph_edge_id','graph_provider','observed_at_ms','valid_until','level','directionality','travel_bearing_deg','source'))
                        if identity in seen: continue
                        seen.add(identity)
                        match = index.match(hazard, category, now)
                        if match=='MATCH': row['conflicts']+=1
                        elif match=='POSSIBLE':
                            row['uncertain_matches']+=1
                            stamp = hazard.get('observed_at_ms')
                            expiry = hazard.get('valid_until')
                            stale = not isinstance(stamp,(int,float)) or isinstance(stamp,bool) or not math.isfinite(stamp) or not 0<=now*1000-stamp<=600000
                            if expiry is not None:
                                stale = stale or not isinstance(expiry,(int,float)) or not math.isfinite(expiry) or expiry<now
                            if stale: row['unknown_or_stale']+=1
                        elif match=='CLEAR':
                            radius=max(10,30+float(hazard.get('position_uncertainty_m',20)))
                            near=any(distance<=radius for distance,_ in index.nearby(float(hazard['lat']),float(hazard['lon']),radius))
                            row['unrelated_matches' if near else 'outside_radius']+=1
                if row['conflicts']: row.update(status='VIOLATED', verification='matched_available_data')
                elif row['uncertain_matches']: row.update(status='UNVERIFIED', verification='road_or_direction_unknown')
                elif coverage=='AVAILABLE': row.update(status='SATISFIED', verification='checked_available_data')
            elif index and not buckets:
                # Road-class/toll/caz estimates or an accepted provider option are not evidence.
                field = {'tolls':'toll','motorways':'motorway','ferries':'ferry','unpaved':'unpaved'}.get(category)
                attributes = list(index.attributes.values())
                if field and any(a.get(field) is True for a in attributes): row.update(status='VIOLATED',verification='road_attribute_conflict',conflicts=1)
                elif field and len(index.attributes)==len(coords)-1 and all(a.get(field) is False for a in attributes) and isinstance(route.get('road_attributes_verified_at'),(int,float)) and 0<=now-route['road_attributes_verified_at']<=600:
                    row.update(status='SATISFIED',coverage='AVAILABLE',verification='checked_route_attributes')
                elif engine=='OSRM': row['status']='UNSUPPORTED'
            limitation = next((item for item in route.get('provider_limitations', []) if item.get('category') == category), None)
            if limitation:
                row.update(engine_capability='not_verified', provider_limitation=limitation['reason'])
            if not coords: row.update(status='UNVERIFIED',verification='invalid_or_missing_geometry')
        rows.append(row)
    active = [r for r in rows if r['enabled']]
    mandatory = [r for r in active if r['mode']=='mandatory']
    status = next((s for s in ('VIOLATED','UNSUPPORTED','UNVERIFIED') if any(r['status']==s for r in active)), 'SATISFIED')
    automatic = bool(coords) and all(r['status']=='SATISFIED' for r in mandatory)
    return {'version':VERSION,'status':status,'requirements':rows,'request_fingerprint':requirement_fingerprint(requirements),
            'engine_capabilities':CAPABILITIES[engine], 'automatic_selection_allowed':automatic,
            'requires_acceptance':not automatic,'geometry_valid':bool(coords),'geometry_binding':geometry_binding(route),'checked_at':now,
            'claim':'checked_available_data_only' if status=='SATISFIED' and active else 'avoidance_disabled' if not active else 'best_effort_or_unverified'}


def assess_response(payload, requirements, hazards=None, *, now=None, waypoints=None, endpoints=None, origin_context=None):
    """Copy before annotating: no mutation of shared in-memory/persistent cache values."""
    result = copy.deepcopy(payload)
    routes = result.get('routes')
    if not isinstance(routes,list):
        routes = [result] if result.get('geometry') else []
    routes = [r for r in routes if isinstance(r,dict)]
    if 'routes' in result: result['routes']=routes
    for route in routes:
        if isinstance(route,dict):
            route['avoidance_assessment'] = assess_route(route,requirements,hazards,fallback_source=result.get('source',''),now=now)
            if route.get('legs') and not result.get('legs'):
                nested=assess_response(dict(route,success=True,routes=[dict(route,legs=None)]),requirements,hazards,now=now)
                route['avoidance_assessment']=nested['avoidance_assessment']
                route['legs']=nested['legs']
    legs = result.get('legs')
    if isinstance(legs,list) and legs:
        assessments = []
        for leg in legs:
            if not isinstance(leg,dict): leg = {}
            leg['avoidance_assessment'] = assess_route(leg,requirements,hazards,now=now)
            assessments.append(leg['avoidance_assessment'])
        limitations = []
        for leg in legs:
            for item in leg.get('provider_limitations', []):
                if item not in limitations: limitations.append(item)
        if limitations: result['provider_limitations'] = limitations
        aggregate = copy.deepcopy(assessments[0])
        aggregate['scope'] = 'all_legs'
        aggregate['geometry_valid'] = all(a['geometry_valid'] for a in assessments)
        aggregate['automatic_selection_allowed'] = all(a['automatic_selection_allowed'] for a in assessments)
        aggregate['requires_acceptance'] = not aggregate['automatic_selection_allowed']
        for i, row in enumerate(aggregate['requirements']):
            peers = [a['requirements'][i] for a in assessments]
            row['status'] = next((status for status in ('VIOLATED','UNSUPPORTED','UNVERIFIED') if any(p['status']==status for p in peers)), 'SATISFIED')
            limitation = next((p.get('provider_limitation') for p in peers if p.get('provider_limitation')), None)
            if limitation: row.update(engine_capability='not_verified', provider_limitation=limitation)
            row['conflicts'] = sum(p['conflicts'] for p in peers)
            row['uncertain_matches'] = sum(p['uncertain_matches'] for p in peers)
            for field in ('unrelated_matches','outside_radius','unknown_or_stale'):
                row[field] = sum(p.get(field,0) for p in peers)
            if any(p['coverage']!='AVAILABLE' for p in peers): row['coverage']='UNKNOWN'
        aggregate['status'] = next((status for status in ('VIOLATED','UNSUPPORTED','UNVERIFIED') if any(r['status']==status for r in aggregate['requirements'] if r['enabled'])), 'SATISFIED')
        if aggregate['status']!='SATISFIED': aggregate['claim']='best_effort_or_unverified'
        if not routes: routes = [dict(result)]
        from voyagr.services.routing.journey_geometry import stitch_legs, geometry_binding, IncompleteJourney
        try: expected_binding = geometry_binding(stitch_legs(legs))
        except (IncompleteJourney,KeyError,TypeError,ValueError): expected_binding = None
        for route in routes:
            a = copy.deepcopy(aggregate)
            if limitations: route['provider_limitations'] = copy.deepcopy(limitations)
            a['geometry_binding'] = geometry_binding(route)
            if not expected_binding or a['geometry_binding']!=expected_binding or geometry_binding(result)!=expected_binding:
                a.update(geometry_valid=False,automatic_selection_allowed=False,requires_acceptance=True,
                         geometry_error='Journey geometry differs from its assessed legs')
            route['avoidance_assessment']=a
    if waypoints or endpoints:
        from voyagr.services.routing.journey_geometry import visits_in_order, distance
        for route in routes:
            points=_geometry(route)
            endpoints_valid=not endpoints or (points and distance(points[0],endpoints[0])<=75 and distance(points[-1],endpoints[1])<=75)
            if not endpoints_valid or (waypoints and not visits_in_order(route,waypoints)):
                route['avoidance_assessment'].update(geometry_valid=False,automatic_selection_allowed=False,requires_acceptance=True,
                    geometry_error='Route omits or reorders a requested waypoint')
        routes.sort(key=lambda r:not r['avoidance_assessment']['geometry_valid'])
        if routes and not any(r['avoidance_assessment']['geometry_valid'] for r in routes):
            result.update(success=False,error_code='INCOMPLETE_ROUTE',error='Route does not include every requested visit in order.',geometry_complete=False)
    if origin_context is not None:
        from voyagr.services.routing.origin_integrity import assess_origin
        from voyagr.utils import request_budget
        with request_budget.stage('origin_validation'):
            for route in routes:
                origin = assess_origin(route, origin_context, now)
                # Every leg has independent requested endpoints, including intermediate stops.
                leg_origins = []
                from voyagr.services.routing.origin_integrity import coordinate
                journey_points = [origin_context.get('start')] + [coordinate(p) for p in (waypoints or [])] + [origin_context.get('end')]
                origin_legs = route.get('legs') or result.get('legs') or []
                for leg_index, leg in enumerate(origin_legs):
                    bound = len(origin_legs) == len(journey_points)-1
                    context = dict(origin_context, start=journey_points[leg_index] if bound else None,
                                   end=journey_points[leg_index+1] if bound else None, accuracy_m=None)
                    evidence = assess_origin(leg, context, now)
                    leg['origin_integrity'] = evidence
                    leg_origins.append(evidence)
                if leg_origins:
                    origin['legs'] = leg_origins
                    if any(not a['navigation_allowed'] for a in leg_origins):
                        origin.update(navigation_allowed=False, status='UNVERIFIED', reason='unverified_leg_endpoint')
                a = route['avoidance_assessment']
                a['origin_integrity_required'] = True
                a['origin_integrity'] = origin
                if not origin['navigation_allowed']:
                    a.update(automatic_selection_allowed=False, requires_acceptance=True, claim='origin_connectivity_unverified')
                    if a['status']=='SATISFIED': a['status']='UNVERIFIED'
    from voyagr.services.routing.route_variety import is_graphhopper_optimised
    mandatory = any(r['enabled'] and r['mode']=='mandatory' for r in requirements)
    # Product display policy follows independent assessment, never proximity counts.
    routes.sort(key=lambda r:(
        not r['avoidance_assessment']['geometry_valid'],
        not r['avoidance_assessment']['automatic_selection_allowed'],
        not is_graphhopper_optimised(r),
    ))
    if routes and is_graphhopper_optimised(routes[0]) and routes[0]['avoidance_assessment']['automatic_selection_allowed']:
        binding = routes[0]['avoidance_assessment'].get('geometry_binding')
        routes = [routes[0]] + [r for r in routes[1:] if not (binding and
            r['avoidance_assessment']['automatic_selection_allowed'] and
            r['avoidance_assessment'].get('geometry_binding')==binding)]
    for position, route in enumerate(routes, 1):
        assessment = route['avoidance_assessment']
        camera_rows = [row for row in assessment['requirements'] if row['enabled'] and row['category'] in ('speed_cameras','red_light_cameras','other_cameras')]
        evidence = {
            'evaluated':bool(camera_rows), 'applicable':sum(row['conflicts'] for row in camera_rows),
            'possible':sum(row['uncertain_matches'] for row in camera_rows),
            'unknown_or_stale':sum(row.get('unknown_or_stale',0) for row in camera_rows),
            'confirmed_unrelated':sum(row.get('unrelated_matches',0) for row in camera_rows),
            'outside_radius':sum(row.get('outside_radius',0) for row in camera_rows),
            'coverage':{row['category']:row['coverage'] for row in camera_rows},
            'scope':assessment.get('scope','route'), 'claim':'association_with_available_evidence_only',
        }
        route['camera_evidence'] = evidence
        route['route_comparison'] = {
            'display_position':position, 'engine':engine_name(route,result.get('source','')),
            'duration_minutes':route.get('duration_minutes'), 'distance_km':route.get('distance_km'),
            'avoidance_status':assessment['status'], 'camera_evidence':evidence,
            'provider_limitations':route.get('provider_limitations',[]),
            'geometry_binding':assessment.get('geometry_binding'),
            'automatic_selection_allowed':assessment['automatic_selection_allowed'],
            'origin_integrity':assessment.get('origin_integrity'),
            'ranking_reason':'blocked_mandatory_or_geometry' if not assessment['automatic_selection_allowed'] else
                'graphhopper_primary_policy' if is_graphhopper_optimised(route) else 'fallback_or_alternative',
        }
    if origin_context is not None and routes and not any(r['avoidance_assessment']['automatic_selection_allowed'] for r in routes):
        result['navigation_state'] = 'UNRESOLVED'
        result['routing_warning'] = 'Navigation cannot start: origin or mandatory route safety is unresolved. Recalculate from the actual location.'
    usable = [r for r in routes if r['avoidance_assessment']['automatic_selection_allowed']]
    result['avoidance_requirements'] = requirements
    result['avoidance_request_fingerprint'] = requirement_fingerprint(requirements)
    result['automatic_selection_allowed'] = bool(usable)
    result['avoidance_status'] = 'NO_COMPLIANT_ROUTE' if not usable and routes else (routes[0]['avoidance_assessment']['status'] if routes else 'UNVERIFIED')
    if routes:
        if 'routes' in result: result['routes']=routes
        result['avoidance_assessment']=routes[0]['avoidance_assessment']
        if 'routes' in result:
            primary = routes[0]
            for field in ('provider_limitations', 'provider_capabilities', 'camera_evidence', 'route_comparison'):
                result.pop(field, None)
                if field in primary: result[field] = copy.deepcopy(primary[field])
            for key in ('source','name','geometry','geometry_precision','maneuvers','fuel_cost','fuel_litres','toll_cost','caz_cost','hazards','hazard_count'):
                if key in primary: result[key]=primary[key]
            if 'distance_km' in primary: result['distance']=f"{primary['distance_km']:.2f} km"
            if 'duration_minutes' in primary: result['time']=f"{primary['duration_minutes']:.0f} minutes"
        fastest = min((r.get('duration_minutes',float('inf')) for r in routes if isinstance(r.get('duration_minutes'),(int,float)) and r['duration_minutes']>0), default=None)
        for route in routes:
            duration = route.get('duration_minutes')
            route['avoidance_tradeoff'] = {'baseline':'fastest_returned_alternative',
                'duration_detour_percent':round((duration/fastest-1)*100,1) if fastest and isinstance(duration,(int,float)) else None,
                'maneuver_count':len(route.get('maneuvers') or []), 'ranking_changed':bool(any(r['enabled'] and r['mode']=='mandatory' for r in requirements))}

    if result.get('provider_limitations'):
        result['routing_degraded'] = True
        result['routing_warning'] = (str(result.get('routing_warning', '')) + ' GraphHopper could not apply one or more requested preferences; review this route as best effort.').strip()
    if any(r.get('avoidance_assessment',{}).get('status')!='SATISFIED' for r in routes):
        result['routing_degraded']=True
        warning='Avoidance is best effort or unverified against available data, not guaranteed; review route limitations before navigation.'
        result['routing_warning']=(str(result.get('routing_warning',''))+' '+warning).strip()
    return result
