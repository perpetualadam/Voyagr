"""Full app payloads -> registered public cases only; no production wiring."""
import copy
import itertools
import math
import re
import time

from prototypes.graphhopper11.app_settings_adapter import FIELDS, adapt_settings
from prototypes.graphhopper11.isolated_app import Refused, PolicyRefused, app_preview, version

JOURNEY_FIELDS = {'start','end','via_points','stops','optimize_stop_order','round_trip',
                  'departure_time','time_windows','total_stop_time','force_refresh',
                  'is_reroute','preserve_stop_order','journey_context','origin_accuracy_m'}
COST_NUMBERS = {'fuel_efficiency','fuel_price','energy_efficiency','electricity_price'}
COST_FIELDS = COST_NUMBERS | {'fuel_price_mode','fuel_category'}


def _number(value):
    return type(value) in (int,float) and math.isfinite(value)


def _coordinate(lat, lon):
    if not _number(lat) or not _number(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise Refused('request_coordinates')
    return [lat,lon]


def _pair(value):
    if not isinstance(value,str) or len(value)>80 or not re.fullmatch(r'\s*[+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?\s*',value):
        raise Refused('request_coordinates')
    return _coordinate(*(float(part) for part in value.split(',')))


def _planning_context(body, visits, stops=()):
    """Accept the normal Calculate metadata, never GPS/arrival authority.

    This bounded bridge supports coordinate endpoints and default place arrival.
    Search evidence, explicit arrival choices and live-purpose metadata need their
    own integration; refusing them is safer than silently discarding them.
    """
    if 'origin_accuracy_m' in body:
        accuracy = body['origin_accuracy_m']
        if not _number(accuracy) or not 0 < accuracy <= 150:
            raise Refused('origin_accuracy_contract')
    if 'journey_context' not in body:
        return
    context = body['journey_context']
    if (not isinstance(context, dict) or set(context) != {
            'version','purpose','origin','destination','arrival_intent','stops'}
            or type(context['version']) is not int or context['version'] != 1
            or context['purpose'] != 'planning' or not isinstance(context['stops'],list)
            or len(context['stops']) != len(stops)):
        raise Refused('planning_context_not_supported')
    kinds = {'gps','searched','map','coordinates','saved','unknown'}
    for supplied, stop in zip(context['stops'],stops):
        if (not isinstance(supplied,dict) or set(supplied) != {'kind','coordinates'}
                or not isinstance(supplied['kind'],str) or supplied['kind'] not in kinds or supplied['coordinates'] != [stop['lat'],stop['lon']]
                or not isinstance(supplied['coordinates'],list)
                or not all(_number(value) for value in supplied['coordinates'])):
            raise Refused('planning_context_not_supported')
    for name, point in (('origin', visits[0]), ('destination', visits[-1])):
        endpoint = context[name]
        if (not isinstance(endpoint,dict) or not {'kind','coordinates'} <= set(endpoint)
                or not set(endpoint) <= {'kind','coordinates','source_kind'}
                or not isinstance(endpoint['kind'],str) or endpoint['kind'] not in kinds
                or ('source_kind' in endpoint and (not isinstance(endpoint['source_kind'],str)
                    or endpoint['source_kind'] not in kinds))
                or not isinstance(endpoint['coordinates'],list) or len(endpoint['coordinates']) != 2
                or not all(_number(v) for v in endpoint['coordinates'])
                or endpoint['coordinates'] != point):
            raise Refused('planning_endpoint_contract')
    intent = context['arrival_intent']
    if (not isinstance(intent,dict) or set(intent) != {'version','mode','target'}
            or type(intent['version']) is not int or intent['version'] != 1
            or intent['mode'] != 'place' or not isinstance(intent['target'],list)
            or len(intent['target']) != 2 or not all(_number(v) for v in intent['target'])
            or intent['target'] != visits[-1]):
        raise Refused('arrival_intent_not_supported')


def normalize_app_request(body):
    """Parse the supported app contract without granting execution eligibility.

    Coordinates here are untrusted request metadata, not graph/road association.
    Stops, reordering, round trips and time-sensitive semantics are not guessed.
    This function performs no engine, cache, storage or network work. Registered
    eligibility and independent policy/evidence checks remain separate gates.
    """
    return _normalize_app_request(body)


def _normalize_app_request(body, *, continuous_stops=False, registered_optimization=False):
    if not isinstance(body,dict) or not {'start','end'} <= set(body) or not set(body) <= FIELDS | JOURNEY_FIELDS | COST_FIELDS:
        raise Refused('app_request_contract')
    for field in ('optimize_stop_order','round_trip','force_refresh','is_reroute','preserve_stop_order'):
        if field in body and type(body[field]) is not bool:
            raise Refused('app_request_boolean')
    optimizing=body.get('optimize_stop_order',False) and bool(body.get('via_points') or body.get('stops'))
    if (optimizing and not registered_optimization) or body.get('round_trip',False):
        raise Refused('journey_optimization_not_supported')
    if optimizing and (body.get('via_points') or not isinstance(body.get('stops'),list) or not 2<=len(body['stops'])<=3
            or body.get('preserve_stop_order') is True or body.get('route_optimization','fastest')!='fastest'
            or body.get('prefer_scenic',False) or body.get('prefer_quiet',False)):
        raise Refused('journey_optimization_not_supported')
    if body.get('departure_time') is not None or body.get('time_windows') is not None:
        raise Refused('time_sensitive_journey_not_supported')
    stops = body.get('stops',[])
    via_points = body.get('via_points',[])
    if type(stops) is not list or (stops and not continuous_stops):
        raise Refused('stop_semantics_not_supported')
    if not isinstance(via_points,list) or len(via_points)+len(stops)>3:
        raise Refused('ordered_visits_contract')
    if stops and not optimizing and body.get('preserve_stop_order') is False:
        raise Refused('stop_semantics_not_supported')
    stop_plan = []
    for i, stop in enumerate(stops):
        if (not isinstance(stop,dict) or not {'lat','lon'} <= set(stop)
                or not set(stop) <= {'lat','lon','name','type','duration','provenance','source_kind','original_index'}
                or stop.get('type','stop') != 'stop'):
            raise Refused('stop_semantics_not_supported')
        duration = stop.get('duration',15)
        if not _number(duration) or not 0 <= duration <= 1440:
            raise Refused('stop_semantics_not_supported')
        stop_plan.append(dict(coordinates=_coordinate(stop['lat'],stop['lon']),
                              duration_minutes=duration,original_index=stop.get('original_index',len(via_points)+i),
                              name=stop.get('name','Journey stop'),kind=stop.get('provenance','unknown'),
                              **({'source_kind':stop['source_kind']} if 'source_kind' in stop else {})))
    if len({stop['original_index'] for stop in stop_plan if type(stop['original_index']) is int}) != len(stop_plan):
        raise Refused('stop_semantics_not_supported')
    dwell = sum(stop['duration_minutes'] for stop in stop_plan)
    if 'total_stop_time' in body and (not _number(body['total_stop_time']) or body['total_stop_time'] != dwell):
        raise Refused('stop_semantics_not_supported')
    for field in COST_NUMBERS & set(body):
        if field == 'fuel_price' and body[field] is None:
            continue  # Missing manual price remains unavailable, never estimated.
        if not _number(body[field]) or body[field] < 0:
            raise Refused('cost_parameter_contract')
    if ('fuel_price_mode' in body and body['fuel_price_mode'] not in ('manual','automatic')) or ('fuel_category' in body and body['fuel_category'] not in ('','petrol','diesel')):
        raise Refused('cost_parameter_contract')
    # Share coordinate/metadata validation without changing a stop into a via.
    # Match the UK's fixed-order contract: via_points followed by stops. Indices
    # identify visits; they do not silently reorder the two request arrays.
    ordered = [(value,'via') for value in via_points]+[(value,'stop') for value in stops]
    visits = [_pair(body['start'])]
    visit_plan = []
    for index,(via,expected_type) in enumerate(ordered):
        allowed = {'lat','lon','name','type','provenance','source_kind','original_index'} | ({'duration'} if expected_type=='stop' else set())
        if not isinstance(via,dict) or not {'lat','lon'} <= set(via) or not set(via) <= allowed:
            raise Refused('ordered_visits_contract')
        if via.get('type',expected_type) != expected_type or ('name' in via and (not isinstance(via['name'],str) or len(via['name'])>160)):
            raise Refused('ordered_visits_contract')
        for field in ('provenance','source_kind'):
            if field in via and via[field] not in ('gps','searched','map','saved','coordinates','unknown'):
                raise Refused('visit_provenance_contract')
        if 'original_index' in via and (type(via['original_index']) is not int or not 0 <= via['original_index'] < 26):
            raise Refused('ordered_visits_contract')
        visits.append(_coordinate(via['lat'],via['lon']))
        visit_plan.append(dict(type=expected_type,coordinates=visits[-1],original_index=via.get('original_index',index),
                               duration_minutes=via.get('duration',15) if expected_type=='stop' else 0,
                               name=via.get('name','Journey stop' if expected_type=='stop' else 'Pass-through via'),
                               kind=via.get('provenance','unknown'),
                               **({'source_kind':via['source_kind']} if 'source_kind' in via else {})))
    if stops and len({visit['original_index'] for visit in visit_plan}) != len(visit_plan):
        raise Refused('ordered_visits_contract')
    visits.append(_pair(body['end']))
    _planning_context(body, visits, stops)
    try:
        settings = adapt_settings({key:copy.deepcopy(value) for key,value in body.items() if key in FIELDS})
    except ValueError as error:
        raise Refused(str(error)) from None
    return {**({'stop_plan':stop_plan,'dwell_minutes':dwell,'stop_mode':'continuous_no_turn_reset'} if stops else {}),
            **({'registered_stop_order_optimization':True} if optimizing else {}),
            **({'visit_plan':visit_plan} if stops and via_points else {}),
            'app_request':copy.deepcopy(body),'visits':visits,
            'policy_request':dict(settings['policy_request'],app_settings=settings['app_settings']),
            'is_reroute':body.get('is_reroute',False), 'force_refresh':body.get('force_refresh',False),
            'cost_warnings':[{'setting':key,'value':body[key],'state':'UNVERIFIED'} for key in sorted(COST_FIELDS & set(body))]}


def adapt_app_request(body, case):
    """Require exact operator-registered visits after general contract parsing.

    Successful normalization alone never authorizes an arbitrary journey. Keep
    this gate shared by preflight, execution, cache binding and restoration.
    """
    continuous = (isinstance(case,dict) and case.get('stop_preview_mode') == 'continuous_no_turn_reset'
                  and (case.get('alternatives',False) is False or
                       case.get('alternatives') is True and case.get('whole_journey_alternatives') is True))
    optimizing=(continuous and case.get('alternatives',False) is False and isinstance(case.get('stop_order_cases'),list))
    adapted = _normalize_app_request(body,continuous_stops=continuous,registered_optimization=optimizing)
    if not isinstance(case,dict) or adapted['visits'] != case.get('points'):
        raise Refused('journey_not_registered')
    return adapted


class RegisteredAppRequestBridge:
    """Direct isolated adapter; not a live `/api/route` handler or private cache.

    HTTPS calculations can reuse independently revalidated private evidence.
    HTTP, reroutes, refreshes and restores stay fresh; the public fixture cache
    is always bypassed. References are selectors, never authority.
    """
    def __init__(self, bridge, *, private_cache=None):
        self.bridge = bridge
        self.private_cache = private_cache
        self._clock = time.monotonic

    def _optimization_orders(self,case_id,adapted):
        """Require the entire finite permutation set before any engine work."""
        root=self.bridge.cases[case_id];names=root.get('stop_order_cases')
        points=adapted['visits'];stops=points[1:-1]
        if (not 2<=len(stops)<=3 or len({tuple(p) for p in points})!=len(points)
                or not isinstance(names,list) or len(names)!=math.factorial(len(stops))
                or any(not isinstance(name,str) for name in names) or len(set(names))!=len(names)):
            raise Refused('stop_order_registry_unverified')
        constraints={key:value for key,value in root.items() if key not in ('id','points','stop_order_cases')}
        expected=set(itertools.permutations(range(len(stops))));orders=[];seen=set()
        for name in names:
            case=self.bridge.cases.get(name)
            if (not isinstance(case,dict) or case.get('alternatives',False) is not False
                    or {key:value for key,value in case.items() if key not in ('id','points','stop_order_cases')}!=constraints
                    or not isinstance(case.get('points'),list) or len(case['points'])!=len(points)
                    or case['points'][0]!=points[0] or case['points'][-1]!=points[-1]):
                raise Refused('stop_order_registry_unverified')
            try:order=tuple(stops.index(point) for point in case['points'][1:-1])
            except ValueError:raise Refused('stop_order_registry_unverified') from None
            if order not in expected or order in seen:raise Refused('stop_order_registry_unverified')
            seen.add(order);orders.append(dict(case_id=name,order=list(order)))
        if seen!=expected:raise Refused('stop_order_registry_unverified')
        return sorted(orders,key=lambda item:item['order'])

    def _prepare(self, case_id, body, identities):
        b = self.bridge
        b.verify()
        if not isinstance(case_id,str) or case_id not in b.cases:
            raise Refused('case_not_registered')
        expected = {key:b.manifest[key] for key in ('graph_version','source_version','policy_version')}
        if identities != expected:
            raise Refused('version_changed')
        adapted = adapt_app_request(body,b.cases[case_id])
        policy = b.policy(case_id,adapted['policy_request'])
        if not policy['route_preview_allowed']:
            raise PolicyRefused(policy)
        if adapted.get('registered_stop_order_optimization'):
            adapted['optimization_orders']=self._optimization_orders(case_id,adapted)
        binding = version([b.binding(case_id,adapted['policy_request']),adapted])
        reference = dict(schema=3,case_id=case_id,**expected,app_request=adapted['app_request'],request_binding=binding)
        return adapted,reference

    def preflight(self, case_id, body, identities):
        adapted,reference = self._prepare(case_id,body,identities)
        return dict(success=True,app_request_context=adapted,
                    policy_report=self.bridge.policy(case_id,adapted['policy_request']),
                    request_binding=reference['request_binding'],plan_reference=reference,
                    navigation_allowed=False,app_integration_allowed=False)

    def calculate(self, case_id, body, identities, *, bypass_cache=False):
        adapted,reference = self._prepare(case_id,body,identities)
        bypass = bypass_cache or adapted['force_refresh'] or adapted['is_reroute']
        key = self.private_cache.key({'case_id':case_id,'request_binding':reference['request_binding'],
                                     'resolved':adapted,'versions':identities},bypass=bypass) if self.private_cache else None
        optimization=None
        if adapted.get('optimization_orders'):
            deadline=self._clock()+60;evaluated=[]
            for entry in adapted['optimization_orders']:
                if self._clock()>=deadline:raise Refused('stop_order_budget_exceeded')
                # Never select a winner from mutable cached duration metrics.
                candidate=self.bridge.route(entry['case_id'],adapted['policy_request'],force_refresh=True)
                if self._clock()>=deadline:raise Refused('stop_order_budget_exceeded')
                if len(candidate['candidates'])!=1:raise Refused('stop_order_registry_unverified')
                evaluated.append((candidate['candidates'][0]['duration_minutes'],entry,candidate))
            best=min(evaluated,key=lambda item:(item[0],item[1]['order']))
            result=copy.deepcopy(best[2])
            optimization=dict(scope='registered_primary_paths_only',objective='reported_primary_driving_time',
                requested_order=[stop['original_index'] for stop in adapted['stop_plan']],
                resolved_order=[adapted['stop_plan'][index]['original_index'] for index in best[1]['order']],
                evaluated_orders=len(evaluated),navigation_allowed=False,
                scores=[dict(order=[adapted['stop_plan'][i]['original_index'] for i in entry['order']],
                             driving_minutes=minutes) for minutes,entry,_ in evaluated])
            display_stops=[adapted['stop_plan'][i] for i in best[1]['order']]
            result['resolved_case_id']=best[1]['case_id']
            result['case_id']=case_id
            result['stop_order_optimization']=copy.deepcopy(optimization)
            key=None
        else:
            result = self.bridge.route(case_id,adapted['policy_request'],force_refresh=key is None,
                                       evidence_cache=self.private_cache.store if key else None,cache_key=key)
            display_stops=adapted.get('stop_plan')
        result.update(request_binding=reference['request_binding'],plan_reference=reference,
                      app_request_context=adapted,cache_policy='bypass_registered_optimization' if optimization else 'private_complete_request' if key else 'bypass_complete_app_request',
                      gps_verification='UNVERIFIED',app_integration_allowed=False)
        result['app_preview'] = app_preview(result)
        context = adapted['app_request'].get('journey_context')
        if context is not None:
            # Provenance is display metadata. Never turn an accuracy number or
            # caller-declared GPS kind into authenticated location evidence.
            context = copy.deepcopy(context)
            context['authority'] = 'request_metadata_only'
            context['arrival_intent']['status'] = 'DEFAULT'
            result['app_preview']['journey_context'] = context
            for route in result['app_preview']['routes']:
                route['journey_context'] = copy.deepcopy(context)
        if adapted.get('stop_plan'):
            # One continuous, independently checked route retains turn history.
            # Dwell is scheduling metadata, never a road-access/parking claim.
            context = copy.deepcopy(context) if context is not None else dict(
                version=1,purpose='planning',authority='request_metadata_only',
                origin=dict(kind='unknown',coordinates=adapted['visits'][0]),
                destination=dict(kind='unknown',coordinates=adapted['visits'][-1]),
                arrival_intent=dict(version=1,mode='place',target=adapted['visits'][-1],status='DEFAULT'))
            context['ordered_stops'] = copy.deepcopy(display_stops)
            if optimization:
                context['registered_stop_order_optimization']=copy.deepcopy(optimization)
                context['stops']=[dict(kind=stop['kind'],coordinates=stop['coordinates']) for stop in display_stops]
            ordered = adapted.get('visit_plan',display_stops)
            if adapted.get('visit_plan'):
                context['ordered_visits'] = copy.deepcopy(ordered)
            result['app_preview']['journey_context'] = copy.deepcopy(context)
            for route in result['app_preview']['routes']:
                if len(route['leg_geometry_ranges']) != len(ordered)+1:
                    raise Refused('preview_leg_contract')
                route['journey_context'] = copy.deepcopy(context)
                route['driving_duration_minutes'] = route['duration_minutes']
                route['dwell_duration_minutes'] = adapted['dwell_minutes']
                route['duration_minutes'] += adapted['dwell_minutes']
                route['stop_semantics'] = dict(mode=adapted['stop_mode'],access_verification='UNVERIFIED',
                                               arrival_departure='continuous_route_no_direction_reset')
                for leg,visit in zip(route['leg_geometry_ranges'],ordered):
                    if adapted.get('visit_plan'):
                        leg['visit'] = copy.deepcopy(visit)
                    if visit.get('type','stop') == 'stop':
                        leg['stop'] = copy.deepcopy(visit)
                    leg['waypoint'] = dict(lat=visit['coordinates'][0],lon=visit['coordinates'][1])
        self.bridge.verify()
        return result

    def restore(self, reference):
        fields = {'schema','case_id','graph_version','source_version','policy_version','app_request','request_binding'}
        if not isinstance(reference,dict) or set(reference) != fields or type(reference['schema']) is not int or reference['schema'] != 3 or not isinstance(reference['case_id'],str):
            raise Refused('app_reference_contract')
        identities = {key:reference[key] for key in ('graph_version','source_version','policy_version')}
        _,expected = self._prepare(reference['case_id'],reference['app_request'],identities)
        if reference != expected:
            raise Refused('app_reference_changed')
        return self.calculate(reference['case_id'],reference['app_request'],identities,bypass_cache=True)


def public_request_template(case):
    """Operator-owned public fixtures only; never a device-location source."""
    points = case.get('points')
    if not isinstance(points,list) or not 2 <= len(points) <= 5 or any(not isinstance(p,list) or len(p)!=2 or not _number(p[0]) or not _number(p[1]) or not -90 <= p[0] <= 90 or not -180 <= p[1] <= 180 for p in points):
        raise Refused('case_request_not_available')
    return dict(start=','.join(map(str,points[0])),end=','.join(map(str,points[-1])),
                via_points=[dict(lat=p[0],lon=p[1],type='via',provenance='coordinates',original_index=i)
                            for i,p in enumerate(points[1:-1])],
                stops=[],optimize_stop_order=False,round_trip=False,departure_time=None,
                routing_mode='auto',vehicle_type='petrol_diesel',avoid_caz=False,
                avoidance_mode='preference',max_detour=20)
