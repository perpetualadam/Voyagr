"""
Unit tests for voyagr.services.routing.costing.build_auto_costing_options.

This helper is the single source of truth that translates the "Route Preferences"
settings UI into Valhalla `auto` costing_options. It is called from voyagr_web.py
(primary Valhalla call, retry payload, baseline fallback) and from multidrop.py.
"""

from voyagr.services.routing.costing import (
    VALID_ROUTE_OPTIMIZATIONS,
    build_auto_costing_options,
)


class TestDefaults:
    def test_no_preferences_returns_empty_dict(self):
        assert build_auto_costing_options() == {}

    def test_fastest_is_default_and_has_no_overrides(self):
        assert build_auto_costing_options(route_optimization='fastest') == {}

    def test_balanced_has_no_overrides(self):
        assert build_auto_costing_options(route_optimization='balanced') == {}

    def test_invalid_optimization_falls_back_to_fastest(self):
        assert build_auto_costing_options(route_optimization='does_not_exist') == {}

    def test_case_insensitive_optimization(self):
        assert build_auto_costing_options(route_optimization='SCENIC') == {'use_highways': 0.2}

    def test_legacy_shortest_maps_to_fastest(self):
        assert build_auto_costing_options(route_optimization='SHORTEST') == {}


class TestHardAvoidances:
    def test_avoid_tolls_sets_use_tolls_zero(self):
        assert build_auto_costing_options(avoid_tolls=True)['use_tolls'] == 0

    def test_avoid_motorways_sets_use_highways_zero(self):
        assert build_auto_costing_options(avoid_motorways=True)['use_highways'] == 0

    def test_avoid_ferries_sets_use_ferry_zero(self):
        assert build_auto_costing_options(avoid_ferries=True)['use_ferry'] == 0

    def test_avoid_unpaved_sets_use_tracks_zero(self):
        assert build_auto_costing_options(avoid_unpaved=True)['use_tracks'] == 0

    def test_all_hard_avoidances_combined(self):
        opts = build_auto_costing_options(
            avoid_tolls=True, avoid_motorways=True, avoid_ferries=True, avoid_unpaved=True,
        )
        assert opts == {'use_tolls': 0, 'use_highways': 0, 'use_ferry': 0, 'use_tracks': 0}


class TestSoftPreferences:
    def test_prefer_scenic_biases_away_from_highways(self):
        opts = build_auto_costing_options(prefer_scenic=True)
        assert opts['use_highways'] == 0.2

    def test_prefer_quiet_biases_living_streets_and_highways(self):
        opts = build_auto_costing_options(prefer_quiet=True)
        assert opts['use_living_streets'] == 0.8
        assert opts['use_highways'] == 0.3

    def test_hard_avoid_motorways_beats_prefer_scenic(self):
        """avoid_motorways=True must set 0 (not 0.2) even when scenic is also on."""
        opts = build_auto_costing_options(avoid_motorways=True, prefer_scenic=True)
        assert opts['use_highways'] == 0

    def test_hard_avoid_motorways_beats_prefer_quiet(self):
        opts = build_auto_costing_options(avoid_motorways=True, prefer_quiet=True)
        assert opts['use_highways'] == 0
        # living_streets still applies
        assert opts['use_living_streets'] == 0.8


class TestOptimizationPresets:
    def test_scenic_downweights_highways(self):
        assert build_auto_costing_options(route_optimization='scenic') == {'use_highways': 0.2}

    def test_quiet_favours_living_streets(self):
        opts = build_auto_costing_options(route_optimization='quiet')
        assert opts['use_living_streets'] == 0.8
        assert opts['use_highways'] == 0.3

    def test_cheapest_avoids_tolls_and_downweights_highways(self):
        opts = build_auto_costing_options(route_optimization='cheapest')
        assert opts['use_tolls'] == 0
        assert opts['use_highways'] == 0.4

    def test_eco_caps_speed_and_downweights_highways(self):
        opts = build_auto_costing_options(route_optimization='eco')
        assert opts['top_speed'] == 90
        assert opts['use_highways'] == 0.5

    def test_cheapest_preset_does_not_override_hard_avoid_motorways(self):
        opts = build_auto_costing_options(
            route_optimization='cheapest', avoid_motorways=True,
        )
        assert opts['use_highways'] == 0  # hard wins over preset 0.4

    def test_eco_preset_does_not_override_hard_avoid_motorways(self):
        opts = build_auto_costing_options(
            route_optimization='eco', avoid_motorways=True,
        )
        assert opts['use_highways'] == 0
        assert opts['top_speed'] == 90  # top_speed still applied


class TestValidOptimizationsRegistry:
    def test_valid_optimizations_contains_all_expected_values(self):
        assert 'fastest' in VALID_ROUTE_OPTIMIZATIONS
        assert 'scenic' in VALID_ROUTE_OPTIMIZATIONS
        assert 'quiet' in VALID_ROUTE_OPTIMIZATIONS
        assert 'cheapest' in VALID_ROUTE_OPTIMIZATIONS
        assert 'eco' in VALID_ROUTE_OPTIMIZATIONS
        assert 'balanced' in VALID_ROUTE_OPTIMIZATIONS
