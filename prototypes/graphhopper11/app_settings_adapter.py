"""Settings-only preflight for the real app contract. Not a routing endpoint.

Never accepts coordinates, cost inputs, provider claims or graph-edge IDs.
The returned policy requires independent registered-case compilation/validation.
"""
import copy
import hashlib
import json

from voyagr.avoidance_contract import FLAGS, normalize_requirements
from prototypes.graphhopper11.policy_compiler import normalize_policy, compile_policy

BOOL_FIELDS = frozenset(FLAGS.values()) | {
    'enable_hazard_avoidance', 'caz_exempt', 'include_tolls', 'include_caz',
    'prefer_scenic', 'prefer_quiet',
}
FIELDS = BOOL_FIELDS | {'routing_mode', 'vehicle_type', 'avoidance_mode',
                       'avoidance_requirements', 'avoid_points',
                       'route_optimization', 'max_detour'}


def adapt_settings(settings):
    """Preserve supplied settings and apply the application's exact legacy defaults.

    Strict input validation intentionally refuses values the legacy parser might
    coerce. Nonempty avoid points require a separate private geometry contract.
    """
    if not isinstance(settings, dict) or not set(settings) <= FIELDS:
        raise ValueError('settings_contract')
    if any(type(settings[key]) is not bool for key in settings if key in BOOL_FIELDS):
        raise ValueError('settings_boolean')
    mode = settings.get('routing_mode', 'auto')
    vehicle = settings.get('vehicle_type', 'petrol_diesel')
    if mode not in ('auto', 'pedestrian', 'bicycle') or vehicle not in (
            'petrol_diesel', 'electric', 'hybrid', 'pedestrian', 'bicycle'):
        raise ValueError('settings_profile')
    if (mode == 'auto' and vehicle in ('pedestrian', 'bicycle')) or (
            mode != 'auto' and vehicle != mode):
        raise ValueError('settings_profile_conflict')
    if 'avoid_points' in settings and settings['avoid_points'] != []:
        raise ValueError('private_avoid_points_not_supported')
    if settings.get('route_optimization', 'fastest') not in (
            'fastest', 'scenic', 'quiet', 'cheapest', 'eco', 'balanced'):
        raise ValueError('settings_optimization')
    detour = settings.get('max_detour', 20)
    if type(detour) is not int or not 0 <= detour <= 100:
        raise ValueError('settings_detour')
    # Validate explicit rows without allowing the legacy normalizer to discard
    # extra fields; then use that normalizer for defaults and override semantics.
    if 'avoidance_requirements' in settings:
        normalize_policy({'profile': 'car', 'requirements': settings['avoidance_requirements']})
    policy = normalize_policy({'profile': 'car' if mode == 'auto' else mode,
                               'requirements': normalize_requirements(settings)})
    return {'app_settings': copy.deepcopy(settings), 'policy_request': policy}


def compile_app_settings(settings, *, registered_no_motorways=False):
    """Preflight only: supplied non-avoidance settings remain explicit gaps.

    A setting warning never grants navigation or permission to discard that
    setting when connecting the real application in a later milestone.
    """
    adapted = adapt_settings(settings)
    report = compile_policy(adapted['policy_request'],
                            registered_no_motorways=registered_no_motorways)
    supplemental = []
    for key in ('prefer_scenic', 'prefer_quiet', 'route_optimization', 'max_detour'):
        if key in settings:
            supplemental.append({'setting': key, 'value': copy.deepcopy(settings[key]),
                                 'state': 'UNVERIFIED', 'reason': 'app_preference_not_integrated'})
    binding = hashlib.sha256(json.dumps(adapted, sort_keys=True,
                                       separators=(',', ':')).encode()).hexdigest()
    return dict(adapted, policy_report=report, settings_fingerprint=binding,
                supplemental_settings=supplemental,
                app_integration_allowed=False, navigation_allowed=False,
                scope='settings_preflight_only')
