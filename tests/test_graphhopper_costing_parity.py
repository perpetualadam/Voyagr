"""GraphHopper costing preference parity with Valhalla."""

from voyagr.services.routing.costing import build_graphhopper_costing_preference_model


def test_graphhopper_costing_model_empty_when_no_prefs():
    assert build_graphhopper_costing_preference_model() == {}


def test_graphhopper_costing_model_avoid_motorways():
    model = build_graphhopper_costing_preference_model(avoid_motorways=True)
    assert model['priority']
    assert any('MOTORWAY' in rule['if'] for rule in model['priority'])


def test_graphhopper_costing_model_avoid_tolls_and_ferries():
    model = build_graphhopper_costing_preference_model(avoid_tolls=True, avoid_ferries=True)
    rules = ' '.join(rule['if'] for rule in model['priority'])
    assert 'toll' in rules
    assert 'FERRY' in rules
