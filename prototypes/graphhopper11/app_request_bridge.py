"""Full app payloads -> registered public cases only; no production wiring."""
import copy
import math
import re

from prototypes.graphhopper11.app_settings_adapter import FIELDS, adapt_settings
from prototypes.graphhopper11.isolated_app import Refused, PolicyRefused, app_preview, version

JOURNEY_FIELDS = {'start','end','via_points','stops','optimize_stop_order','round_trip',
                  'departure_time','time_windows','total_stop_time','force_refresh',
                  'is_reroute','preserve_stop_order'}
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


def adapt_app_request(body, case):
    """Strict subset of the real app contract, retaining every supplied field.

    Ordered pass-through vias are supported only by exact registered points.
    Stops, reordering, round trips and time-sensitive semantics are not guessed.
    All costs/preferences retain explicit unverified status; no navigation proof.
    """
    if not isinstance(body,dict) or not {'start','end'} <= set(body) or not set(body) <= FIELDS | JOURNEY_FIELDS | COST_FIELDS:
        raise Refused('app_request_contract')
    for field in ('optimize_stop_order','round_trip','force_refresh','is_reroute','preserve_stop_order'):
        if field in body and type(body[field]) is not bool:
            raise Refused('app_request_boolean')
    if (body.get('optimize_stop_order',False) and (body.get('via_points') or body.get('stops'))) or body.get('round_trip',False):
        raise Refused('journey_optimization_not_supported')
    if body.get('departure_time') is not None or body.get('time_windows') is not None:
        raise Refused('time_sensitive_journey_not_supported')
    if body.get('stops',[]) != [] or type(body.get('stops',[])) is not list:
        raise Refused('stop_semantics_not_supported')
    if 'total_stop_time' in body and (not _number(body['total_stop_time']) or body['total_stop_time'] != 0):
        raise Refused('stop_semantics_not_supported')
    for field in COST_NUMBERS & set(body):
        if field == 'fuel_price' and body[field] is None:
            continue  # Missing manual price remains unavailable, never estimated.
        if not _number(body[field]) or body[field] < 0:
            raise Refused('cost_parameter_contract')
    if ('fuel_price_mode' in body and body['fuel_price_mode'] not in ('manual','automatic')) or ('fuel_category' in body and body['fuel_category'] not in ('','petrol','diesel')):
        raise Refused('cost_parameter_contract')
    vias = body.get('via_points',[])
    if not isinstance(vias,list) or len(vias)>3:
        raise Refused('ordered_visits_contract')
    visits = [_pair(body['start'])]
    for via in vias:
        if not isinstance(via,dict) or not {'lat','lon'} <= set(via) or not set(via) <= {'lat','lon','name','type','provenance','source_kind','original_index'}:
            raise Refused('ordered_visits_contract')
        if via.get('type','via') != 'via' or ('name' in via and (not isinstance(via['name'],str) or len(via['name'])>160)):
            raise Refused('ordered_visits_contract')
        for field in ('provenance','source_kind'):
            if field in via and via[field] not in ('gps','searched','map','saved','coordinates','unknown'):
                raise Refused('visit_provenance_contract')
        if 'original_index' in via and (type(via['original_index']) is not int or not 0 <= via['original_index'] < 26):
            raise Refused('ordered_visits_contract')
        visits.append(_coordinate(via['lat'],via['lon']))
    visits.append(_pair(body['end']))
    if visits != case.get('points'):
        raise Refused('journey_not_registered')
    try:
        settings = adapt_settings({key:copy.deepcopy(value) for key,value in body.items() if key in FIELDS})
    except ValueError as error:
        raise Refused(str(error)) from None
    return {'app_request':copy.deepcopy(body),'visits':visits,
            'policy_request':dict(settings['policy_request'],app_settings=settings['app_settings']),
            'is_reroute':body.get('is_reroute',False), 'force_refresh':body.get('force_refresh',False),
            'cost_warnings':[{'setting':key,'value':body[key],'state':'UNVERIFIED'} for key in sorted(COST_FIELDS & set(body))]}


class RegisteredAppRequestBridge:
    """Direct isolated adapter; not a live `/api/route` handler or private cache.

    Every operation bypasses the public fixture cache until complete private
    request-cache integration exists. References are selectors, never authority.
    """
    def __init__(self, bridge):
        self.bridge = bridge

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
        binding = version([b.binding(case_id,adapted['policy_request']),adapted])
        reference = dict(schema=3,case_id=case_id,**expected,app_request=adapted['app_request'],request_binding=binding)
        return adapted,reference

    def preflight(self, case_id, body, identities):
        adapted,reference = self._prepare(case_id,body,identities)
        return dict(success=True,app_request_context=adapted,
                    policy_report=self.bridge.policy(case_id,adapted['policy_request']),
                    request_binding=reference['request_binding'],plan_reference=reference,
                    navigation_allowed=False,app_integration_allowed=False)

    def calculate(self, case_id, body, identities):
        adapted,reference = self._prepare(case_id,body,identities)
        result = self.bridge.route(case_id,adapted['policy_request'],force_refresh=True)
        result.update(request_binding=reference['request_binding'],plan_reference=reference,
                      app_request_context=adapted,cache_policy='bypass_complete_app_request',
                      gps_verification='UNVERIFIED',app_integration_allowed=False)
        result['app_preview'] = app_preview(result)
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
        return self.calculate(reference['case_id'],reference['app_request'],identities)


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
