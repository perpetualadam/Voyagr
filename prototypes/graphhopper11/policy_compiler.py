"""Canonical rule compiler for registered preview cases; no navigation authority."""
import copy
import hashlib
import json
import re

CATEGORIES = ('speed_cameras', 'red_light_cameras', 'other_cameras', 'traffic_lights',
              'railway_crossings', 'other_hazards', 'avoid_points', 'tolls', 'caz',
              'congestion_charging', 'motorways', 'ferries', 'unpaved')
DATA_DEPENDENT = frozenset(CATEGORIES[:7])


class InvalidPolicy(ValueError):
    pass


def normalize_policy(value):
    if (not isinstance(value, dict) or set(value) not in ({'profile', 'requirements'}, {'profile', 'requirements', 'app_settings'})
            or not isinstance(value['profile'], str)
            or not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}', value['profile'])
            or not isinstance(value['requirements'], list) or len(value['requirements']) > len(CATEGORIES)):
        raise InvalidPolicy('policy_contract')
    rows, seen = [], set()
    for row in value['requirements']:
        if (not isinstance(row, dict) or not {'category', 'enabled', 'mode'} <= set(row)
                or not set(row) <= {'category', 'enabled', 'mode', 'scope'}
                or not isinstance(row['category'], str) or row['category'] not in CATEGORIES
                or row['category'] in seen or type(row['enabled']) is not bool
                or row['mode'] not in ('mandatory', 'preference') or row.get('scope', 'route') != 'route'):
            raise InvalidPolicy('policy_requirement_contract')
        seen.add(row['category'])
        rows.append(dict(category=row['category'], enabled=row['enabled'], mode=row['mode'], scope='route'))
    selected = {'profile': value['profile'], 'requirements': sorted(rows, key=lambda item: item['category'])}
    if 'app_settings' in value:
        # Local import avoids a module initialization cycle; adaptation of the
        # legacy rows itself only normalizes a plain two-field policy.
        from prototypes.graphhopper11.app_settings_adapter import adapt_settings
        try:
            adapted = adapt_settings(value['app_settings'])
        except ValueError as error:
            raise InvalidPolicy(str(error)) from None
        if selected != adapted['policy_request']:
            raise InvalidPolicy('app_settings_policy_mismatch')
        selected['app_settings'] = adapted['app_settings']
    return selected


def compile_policy(value, *, registered_no_motorways=False):
    selected = normalize_policy(value)
    rows, blocked, warnings = [], [], []
    profile_supported = selected['profile'] == 'car'
    for rule in selected['requirements']:
        category = rule['category']
        if not rule['enabled']:
            state, reason = 'DISABLED', 'not_selected'
        elif not profile_supported:
            state, reason = 'UNSUPPORTED', 'profile_not_registered'
        elif category == 'motorways' and registered_no_motorways is True:
            state, reason = 'COMPILED', 'registered_motorway_model_and_edge_validation'
        elif category in DATA_DEPENDENT:
            state, reason = 'UNVERIFIED', 'general_association_coverage_or_freshness_unproven'
        else:
            state, reason = 'UNSUPPORTED', 'exclusion_not_enabled_and_validated_in_registered_case'
        message = {'DISABLED':'Rule retained as disabled.',
                   'COMPILED':'The registered case requests and validates this road exclusion; navigation remains unverified.',
                   'UNVERIFIED':'Available association, coverage or freshness evidence cannot establish this avoidance.',
                   'UNSUPPORTED':'This registered case cannot apply and validate this selected rule.'}[state]
        compiled = dict(rule, state=state, reason=reason, message=message)
        rows.append(compiled)
        if rule['enabled'] and state != 'COMPILED':
            (blocked if rule['mode'] == 'mandatory' else warnings).append(copy.deepcopy(compiled))
    fingerprint = hashlib.sha256(json.dumps(selected, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'schema': 1, 'selected': selected, 'fingerprint': fingerprint, 'rules': rows,
            'unresolved_mandatory': blocked, 'preference_warnings': warnings,
            'profile_supported': profile_supported,
            'route_preview_allowed': profile_supported and not blocked,
            **({'app_settings': copy.deepcopy(selected['app_settings']),
                'supplemental_settings': [{'setting': key, 'value': copy.deepcopy(selected['app_settings'][key]),
                    'state': 'UNVERIFIED', 'reason': 'app_preference_not_integrated'}
                    for key in ('prefer_scenic', 'prefer_quiet', 'route_optimization', 'max_detour')
                    if key in selected['app_settings']],
                'app_integration_allowed': False} if 'app_settings' in selected else {}),
            'navigation_allowed': False, 'automatic_selection_allowed': False,
            'legal_restrictions': {'required': True, 'verification': 'UNVERIFIED'},
            'scope': 'registered_case_compilation_only', 'route_absence_proven': False}
