"""Keep a plan's selected provider settings on every alternative and recovery.

This preserves request intent, not proof of hazard-free roads. Independent route
assessment still decides what the returned geometry can establish.
"""
import copy


def retain_valhalla_settings(candidate, selected):
    result = copy.deepcopy(candidate)
    if not selected:
        return result
    for key in ('locations', 'costing', 'exclude_locations', 'date_time'):
        if key in selected:
            result[key] = copy.deepcopy(selected[key])
    # A variety option may add scenic/quiet biases, but cannot override a selected
    # road avoidance, optimisation preset or travel-mode option.
    for mode, options in selected.get('costing_options', {}).items():
        result.setdefault('costing_options', {}).setdefault(mode, {}).update(copy.deepcopy(options))
    return result


def needs_settings_capable_engine(data):
    return bool(data.get('enable_hazard_avoidance') or data.get('avoid_points') or
                any(data.get(key) for key in ('avoid_tolls', 'avoid_motorways', 'avoid_ferries',
                                              'avoid_unpaved', 'avoid_caz', 'prefer_scenic', 'prefer_quiet')) or
                data.get('route_optimization', 'fastest') not in ('fastest', 'balanced') or
                any(row.get('enabled') for row in data.get('avoidance_requirements', [])))
