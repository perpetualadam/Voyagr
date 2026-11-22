"""Offline contract tests; not evidence of deployed Flask/browser integration."""
import pytest

from prototypes.graphhopper11.adapter import UnverifiedRoute
from prototypes.graphhopper11.integration_boundary import StrictPrototypeSession


def inputs():
    return ({"profile": "car", "visits": [[0, 0], [.02, 0]]}, {
        "graph_version": "a"*64, "source_version": "b"*64, "policy_version": "c"*64,
        "blocked_keys": [99], "forbidden_turn_pairs": [], "coverage": "SYNTHETIC_COMPLETE",
        "checked_at": 0, "valid_until": 50,
    })


def response(request, policy, keys=(2, 4, 6)):
    candidates = []
    for key in keys:
        legs = []
        for first, last in zip(request["visits"], request["visits"][1:]):
            legs.append({"graph_version": policy["graph_version"], "paths": [{
                "distance": 1000, "time": 120000, "points_encoded": False,
                "points": {"type": "LineString", "coordinates": [first, last]},
                "details": {"edge_key": [[0, 1, key]]},
            }]})
        candidates.append(legs)
    return {**{field: policy[field] for field in ("graph_version", "source_version", "policy_version")},
            "candidates": candidates}


@pytest.mark.parametrize("keys", [(2,), (2, 4), (2, 4, 6)])
def test_calculate_cache_and_select_every_alternative(keys):
    request, policy = inputs()
    session = StrictPrototypeSession(clock=lambda: 0)
    calls = []
    def provider(r, p):
        calls.append((r, p))
        return response(r, p, keys)
    result = session.calculate(request, policy, provider)
    assert len(result["candidates"]) == len(keys)
    assert result["navigation_allowed"] is False
    assert session.calculate(request, policy, provider)["cached"] is True
    assert len(calls) == 1
    for index, key in enumerate(keys):
        selected = session.select(result["handle"], index, request, policy)
        assert selected["directed_edge_keys"] == [key]
        assert selected["navigation_allowed"] is False
    # Returned objects cannot rewrite the retained raw evidence.
    result["candidates"][0]["directed_edge_keys"].append(99)
    assert session.select(result["handle"], 0, request, policy)["directed_edge_keys"] == [keys[0]]


@pytest.mark.parametrize("field", ["graph_version", "source_version", "policy_version", "blocked_keys", "forbidden_turn_pairs"])
def test_changed_evidence_cannot_select_or_reuse_old_plan(field):
    request, policy = inputs()
    session = StrictPrototypeSession(clock=lambda: 0)
    result = session.calculate(request, policy, response)
    policy[field] = {"blocked_keys": [2], "forbidden_turn_pairs": [[4, 6]]}.get(field, "d"*64)
    with pytest.raises(UnverifiedRoute, match="selection_context_changed"):
        session.select(result["handle"], 0, request, policy)
    calls = []
    def provider(r, p):
        calls.append(1)
        return response(r, p, (8,))
    assert session.calculate(request, policy, provider)["cached"] is False
    assert calls == [1]


def test_reroute_and_every_multistop_leg_keep_exclusions_and_turn_rules():
    request, policy = inputs()
    request["visits"].insert(1, [.01, 0])
    session = StrictPrototypeSession(clock=lambda: 0)
    raw = response(request, policy, (2,))
    raw["candidates"][0][1]["paths"][0]["details"]["edge_key"][0][2] = 99
    with pytest.raises(UnverifiedRoute, match="mandatory_edge_violation"):
        session.calculate(request, policy, lambda *_: raw)
    raw["candidates"][0][1]["paths"][0]["details"]["edge_key"][0][2] = 4
    policy["forbidden_turn_pairs"] = [[2, 4]]
    with pytest.raises(UnverifiedRoute, match="mandatory_turn_violation"):
        session.calculate(request, policy, lambda *_: raw)
    policy["forbidden_turn_pairs"] = []
    result = session.calculate(request, policy, lambda *_: raw)
    assert result["candidates"][0]["leg_count"] == 2
    request["visits"][0] = [.005, 0]
    with pytest.raises(UnverifiedRoute, match="selection_context_changed"):
        session.select(result["handle"], 0, request, policy)
    rerouted = session.calculate(request, policy, lambda r, p: response(r, p, (8,)))
    assert rerouted["cached"] is False
    assert rerouted["candidates"][0]["directed_edge_keys"] == [8, 8]


@pytest.mark.parametrize("fault", ["third_candidate", "graph", "source", "policy", "missing_leg", "empty", "timeout"])
def test_provider_failure_never_returns_a_partial_plan_or_fallback(fault):
    request, policy = inputs()
    session = StrictPrototypeSession(clock=lambda: 0)
    def provider(r, p):
        raw = response(r, p)
        if fault == "timeout":
            raise TimeoutError()
        if fault == "third_candidate":
            raw["candidates"][2][0]["paths"][0]["details"]["edge_key"][0][2] = 99
        elif fault in ("graph", "source", "policy"):
            raw[fault + "_version"] = "d"*64
        elif fault == "missing_leg":
            raw["candidates"][0] = []
        elif fault == "empty":
            raw["candidates"] = []
        return raw
    with pytest.raises(UnverifiedRoute):
        session.calculate(request, policy, provider)
    assert len(session.cache.cache) == 0


def test_expired_evidence_rejected_on_cache_hit_and_selection():
    now = [0]
    request, policy = inputs()
    session = StrictPrototypeSession(clock=lambda: now[0])
    result = session.calculate(request, policy, response)
    now[0] = 50
    with pytest.raises(UnverifiedRoute, match="evidence_stale"):
        session.calculate(request, policy, response)
    with pytest.raises(UnverifiedRoute, match="evidence_stale"):
        session.select(result["handle"], 0, request, policy)


def test_session_isolation_and_cached_evidence_are_revalidated():
    request, policy = inputs()
    session = StrictPrototypeSession(clock=lambda: 0)
    result = session.calculate(request, policy, response)
    other = StrictPrototypeSession(clock=lambda: 0)
    with pytest.raises(UnverifiedRoute, match="selection_context_changed"):
        other.select(result["handle"], 0, request, policy)
    raw = response(request, policy)
    raw["candidates"][2][0]["paths"][0]["details"]["edge_key"][0][2] = 99
    session.cache.clear()
    key = session._key(request, policy)
    session.cache.set(key, raw)  # Deliberately corrupt private test storage.
    for action in (lambda: session.calculate(request, policy, response),
                   lambda: session.select(key, 0, request, policy)):
        with pytest.raises(UnverifiedRoute, match="mandatory_edge_violation"):
            action()


@pytest.mark.parametrize("coverage", ["UNKNOWN", "STALE", "AVAILABLE"])
def test_real_or_unknown_evidence_cannot_enter_synthetic_boundary(coverage):
    request, policy = inputs()
    policy["coverage"] = coverage
    with pytest.raises(UnverifiedRoute, match="coverage_unverified"):
        StrictPrototypeSession(clock=lambda: 0).calculate(request, policy, response)


def test_evidence_expiring_during_provider_call_is_never_cached():
    now = [0]
    request, policy = inputs()
    session = StrictPrototypeSession(clock=lambda: now[0])
    def slow_provider(r, p):
        raw = response(r, p)
        now[0] = 50
        return raw
    with pytest.raises(UnverifiedRoute, match="evidence_stale"):
        session.calculate(request, policy, slow_provider)
    assert len(session.cache.cache) == 0
