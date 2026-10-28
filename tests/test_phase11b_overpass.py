"""Real acquisition paths with deterministic transports; no production service calls."""

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import requests
import pytest
from flask import Flask, g
import overpass_helper as oh
from voyagr.utils import request_budget as rb

LOCAL = "http://localhost:8080/api/interpreter"
PUBLIC = "https://overpass-api.de/api/interpreter"
NODE = {
    "type": "node",
    "id": 1,
    "lat": 53.5,
    "lon": -1.2,
    "tags": {"highway": "traffic_signals"},
}


def response(data=None, status=200, raw=None, headers=None):
    r = requests.Response()
    r.status_code = status
    r._content = (
        raw
        if raw is not None
        else json.dumps({"elements": []} if data is None else data).encode()
    )
    r._content_consumed = True
    r.headers.update({"Content-Type": "application/json", **(headers or {})})
    return r


def client(**kwargs):
    return oh.OverpassClient(
        endpoints=[LOCAL, PUBLIC], cache=oh.OverpassCache(), max_retries=1, **kwargs
    )


@pytest.mark.parametrize(
    "data", [{}, {"remark": "runtime error: timeout", "elements": []}, {"elements": {}}]
)
def test_invalid_envelope_never_becomes_cached_empty_coverage(data):
    c = client()
    with patch.object(rb, "post", return_value=response(data)):
        r = c.query("synthetic")
    assert not r["success"]
    assert c.cache.stats["size"] == 0


def test_expired_cache_hit_propagates_deadline():
    c = client()
    app = Flask(__name__)
    with patch.object(rb, "post", return_value=response()):
        assert c.query("synthetic")["success"]
    with app.test_request_context("/api/route"):
        g.routing_budget = rb.RoutingBudget(0)
        with pytest.raises(rb.RoutingDeadlineExceeded):
            c.query("synthetic")


def test_equivalent_queries_ignore_custom_cache_label():
    c = client()
    with patch.object(rb, "post", return_value=response()) as post:
        c.query("synthetic", cache_key="first")
        c.query("synthetic", cache_key="second")
    assert post.call_count == 1


def test_concurrent_misses_share_one_owner():
    c = client()
    entered = threading.Event()
    release = threading.Event()

    def transport(*a, **kw):
        entered.set()
        assert release.wait(2)
        return response()

    with patch.object(rb, "post", side_effect=transport) as post, ThreadPoolExecutor(
        max_workers=2
    ) as pool:
        owner = pool.submit(c.query, "same")
        assert entered.wait(2)
        waiter = pool.submit(c.query, "same")
        release.set()
        assert owner.result(2)["success"] and waiter.result(2)["success"]
    assert post.call_count == 1


@pytest.mark.parametrize(
    "data, state",
    [
        ({"elements": []}, "VALID_EMPTY"),
        ({"elements": [NODE]}, "VALID_WITH_DATA"),
        ({"elements": [NODE], "remark": "timeout"}, "PARTIAL"),
        ({"elements": [{"type": "node", "id": True}]}, "INVALID_RESPONSE"),
    ],
)
def test_response_classification_and_provenance(data, state):
    with patch.object(rb, "post", return_value=response(data)):
        result = client().query("traffic_signals")
    assert result["response_state"] == state
    if result["success"]:
        assert result["retrieved_at"] > 0 and result["endpoint_class"] == "LOCAL"
        assert result["dataset_coverage"] == "UNVERIFIED"
    else:
        assert result["coverage_status"] == "UNKNOWN"


@pytest.mark.parametrize("status", [502, 503, 504])
def test_local_server_error_has_bounded_public_fallback(status):
    c = client()
    with patch.object(
        rb,
        "post",
        side_effect=[response(status=status), response({"elements": [NODE]})],
    ) as post:
        result = c.query("signals")
    assert result["success"] and result["endpoint_class"] == "PUBLIC"
    assert [call.args[0] for call in post.call_args_list] == [LOCAL, PUBLIC]


@pytest.mark.parametrize("raw", [b"", b'{"elements":[', b"<html>secret</html>"])
def test_malformed_or_truncated_body_is_never_cached(raw):
    c = client()
    with patch.object(rb, "post", return_value=response(raw=raw)):
        assert not c.query("synthetic")["success"]
    assert c.cache.stats["size"] == 0


def test_response_size_cap_and_invalid_content_type():
    c = client()
    with patch.object(
        rb,
        "post",
        return_value=response(
            headers={"Content-Length": str(oh.MAX_RESPONSE_BYTES + 1)}
        ),
    ):
        assert c.query("large")["response_state"] == "PARTIAL"
    c = client()
    with patch.object(
        rb, "post", return_value=response(headers={"Content-Type": "text/html"})
    ):
        assert c.query("html")["response_state"] == "INVALID_RESPONSE"


def test_failed_refresh_keeps_original_cache_evidence_and_time():
    c = client()
    with patch.object(rb, "post", return_value=response({"elements": [NODE]})):
        original = c.query("signals")
    with patch.object(rb, "post", return_value=response({"remark": "timeout"})):
        assert not c.query("signals", skip_cache=True)["success"]
        cached = c.query("signals")
    assert (
        cached["elements"] == original["elements"]
        and cached["retrieved_at"] == original["retrieved_at"]
    )
    assert cached["dataset_coverage"] == "UNVERIFIED" and cached["cached"]


def test_stale_cache_is_not_promoted_after_failed_retry():
    c = client()
    with patch.object(rb, "post", return_value=response()):
        original = c.query("signals")
    # Simulate old evidence while keeping its monotonic eviction deadline in the future.
    with c.cache._lock:
        c.cache._cache[c._key("signals")]["data"]["retrieved_at"] -= 301
    with patch.object(rb, "post", return_value=response(status=502)):
        result = c.query("signals")
    assert not result["success"] and result["previous_evidence_state"] == "STALE"
    assert c.cache.stats["size"] == 0


def test_recovery_cooldown_expires_and_local_is_preferred_again():
    c = client()
    now = [0]
    c.clock = lambda: now[0]
    with patch.object(
        rb,
        "post",
        side_effect=[response(status=502), response(), response(), response()],
    ) as post:
        assert c.query("one")["endpoint_class"] == "PUBLIC"
        assert c.query("two")["endpoint_class"] == "PUBLIC"
        now[0] = 3
        assert c.query("three")["endpoint_class"] == "LOCAL"
    assert [call.args[0] for call in post.call_args_list] == [
        LOCAL,
        PUBLIC,
        PUBLIC,
        LOCAL,
    ]


def test_retry_after_cools_endpoint_without_sleeping_or_cascading():
    c = client()
    with patch.object(
        rb,
        "post",
        side_effect=[
            response(status=429, headers={"Retry-After": "30"}),
            response(),
            response(),
        ],
    ) as post, patch.object(rb, "retry_wait") as wait:
        assert c.query("one")["endpoint_class"] == "PUBLIC"
        assert c.query("two")["endpoint_class"] == "PUBLIC"
    assert post.call_count == 3 and c._health[LOCAL] > c.clock() + 20
    wait.assert_not_called()


def test_deadline_expiring_during_backoff_stops_fallback():
    c = oh.OverpassClient(
        endpoints=[LOCAL, PUBLIC], max_retries=2, cache=oh.OverpassCache()
    )
    now = [0]
    app = Flask(__name__)

    def sleep(seconds):
        now[0] += 10

    with app.test_request_context("/api/route"):
        g.routing_budget = rb.RoutingBudget(5, clock=lambda: now[0])
        with patch.object(
            rb.requests, "post", return_value=response(status=502)
        ) as post, patch.object(rb.time, "sleep", side_effect=sleep):
            with pytest.raises(rb.RoutingDeadlineExceeded):
                c.query("signals")
    assert post.call_count == 1


def test_waiter_cancellation_does_not_cancel_owner_or_another_waiter():
    c = client()
    entered = threading.Event()
    release = threading.Event()
    waiting = threading.Event()
    cancel = threading.Event()

    def transport(*args, **kwargs):
        entered.set()
        assert release.wait(2)
        return response()

    from voyagr.utils import overpass_audit as audit

    def emitted(event, **kwargs):
        if event == "inflight_wait":
            waiting.set()

    with patch.object(rb, "post", side_effect=transport) as post, patch.object(
        audit, "emit", side_effect=emitted
    ), ThreadPoolExecutor(max_workers=3) as pool:
        owner = pool.submit(c.query, "same")
        assert entered.wait(2)
        cancelled = pool.submit(c.query, "same", cancel_event=cancel)
        assert waiting.wait(2)
        cancel.set()
        with pytest.raises(rb.RoutingCancelled):
            cancelled.result(2)
        healthy = pool.submit(c.query, "same")
        release.set()
        assert owner.result(2)["success"] and healthy.result(2)["success"]
    assert post.call_count == 1 and not c._flights


def test_waiter_has_its_own_short_deadline():
    c = client()
    entered = threading.Event()
    release = threading.Event()

    def transport(*args, **kwargs):
        entered.set()
        assert release.wait(2)
        return response()

    def waiter():
        with rb.use_budget(rb.WorkBudget(0.02)):
            return c.query("same")

    with patch.object(rb, "post", side_effect=transport) as post, ThreadPoolExecutor(
        max_workers=2
    ) as pool:
        owner = pool.submit(c.query, "same")
        assert entered.wait(2)
        short = pool.submit(waiter)
        try:
            with pytest.raises(rb.RoutingDeadlineExceeded):
                short.result(2)
        finally:
            release.set()
        assert owner.result(2)["success"]
    assert post.call_count == 1


def test_owner_failure_wakes_waiters_and_removes_entry():
    c = client()
    entered = threading.Event()
    release = threading.Event()
    waiting = threading.Event()

    def transport(*args, **kwargs):
        entered.set()
        assert release.wait(2)
        raise RuntimeError("synthetic owner failure")

    from voyagr.utils import overpass_audit as audit

    def emitted(event, **kwargs):
        if event == "inflight_wait":
            waiting.set()

    with patch.object(rb, "post", side_effect=transport), patch.object(
        audit, "emit", side_effect=emitted
    ), ThreadPoolExecutor(max_workers=2) as pool:
        owner = pool.submit(c.query, "same")
        assert entered.wait(2)
        waiter = pool.submit(c.query, "same")
        assert waiting.wait(2)
        release.set()
        with pytest.raises(RuntimeError):
            owner.result(2)
        assert waiter.result(2)["error"] == "owner_failed"
    assert not c._flights


def test_cancelled_owner_never_publishes_late_result():
    c = client()
    cancel = threading.Event()

    def transport(*args, **kwargs):
        cancel.set()
        return response({"elements": [NODE]})

    with patch.object(rb, "post", side_effect=transport):
        with pytest.raises(rb.RoutingCancelled):
            c.query("signals", cancel_event=cancel)
    assert not c._flights and c.cache.stats["size"] == 0


def test_inflight_and_active_admission_are_bounded():
    c = client(max_inflight=1)
    entered = threading.Event()
    release = threading.Event()

    def transport(*args, **kwargs):
        entered.set()
        assert release.wait(2)
        return response()

    with patch.object(rb, "post", side_effect=transport), ThreadPoolExecutor(
        max_workers=1
    ) as pool:
        owner = pool.submit(c.query, "one")
        assert entered.wait(2)
        try:
            assert c.query("two")["error"] == "inflight_limit"
        finally:
            release.set()
        assert owner.result(2)["success"]


def test_query_identity_preserves_quoted_values_bounds_and_source_version():
    assert oh.canonical_query("node ( 1 ); out body;") == oh.canonical_query(
        "node(1);out body;"
    )
    assert oh.canonical_query('node["name"="a b"];') != oh.canonical_query(
        'node["name"="ab"];'
    )
    assert oh.canonical_query("// comment\nnode(1);") != oh.canonical_query(
        "// comment node(1);"
    )
    c = client()
    d = client(dataset_revision="new")
    assert c._key("node(1);") != d._key("node(1);")
    assert c._key("node(1);") != c._key("node(2);")


def test_cache_is_bounded_and_does_not_store_failed_envelopes():
    cache = oh.OverpassCache(max_entries=1)
    cache.set("bad", oh.unavailable("failure"))
    assert cache.stats["size"] == 0
    with patch.object(rb, "post", return_value=response()):
        c = oh.OverpassClient(endpoints=[LOCAL], cache=cache, max_retries=1)
        c.query("one")
        c.query("two")
    assert cache.stats["size"] == 1


def test_unavailable_hazards_preserve_mandatory_gates_and_preference_graphhopper_first():
    from voyagr.services.routing.integrity import (
        assess_response,
        normalize_requirements,
    )
    from voyagr.utils.hazard_matching import HazardDataset, HazardList

    line = [[53.5, -1.2], [53.51, -1.19]]
    routes = [
        {
            "name": "Fastest",
            "source": "Valhalla",
            "geometry": line,
            "duration_minutes": 10,
            "distance_km": 1,
        },
        {
            "name": "⚡ Optimised",
            "source": "GraphHopper",
            "geometry": line,
            "duration_minutes": 12,
            "distance_km": 1,
        },
    ]
    hazards = HazardDataset(
        {"traffic_light": HazardList(coverage={"status": "UNKNOWN"})}
    )
    for mode in ("mandatory", "preference"):
        req = normalize_requirements(
            {
                "avoid_caz": False,
                "avoidance_requirements": [
                    {"category": "traffic_lights", "enabled": True, "mode": mode}
                ],
            }
        )
        result = assess_response({"success": True, "routes": routes}, req, hazards)
        assert result["routes"][0]["source"] == "GraphHopper"
        assert result["avoidance_status"] != "SATISFIED"
        assert result["automatic_selection_allowed"] is (mode == "preference")


def test_viewport_admission_rejects_third_task_and_late_work_cannot_cache():
    from voyagr.api import hazards

    c = client()
    entered = threading.Barrier(3)
    release = threading.Event()

    def transport(*args, **kwargs):
        entered.wait(2)
        assert release.wait(2)
        return response()

    def work(query):
        return c.query(query)

    def run(query):
        return hazards._run_osm_area_fetch(work, query)

    submitted = []
    original_submit = hazards._osm_area_executor.submit

    def capture(*args, **kwargs):
        future = original_submit(*args, **kwargs)
        submitted.append(future)
        return future

    with patch.object(hazards, "_OSM_AREA_FETCH_TIMEOUT_SEC", 0.2), patch.object(
        hazards._osm_area_executor, "submit", side_effect=capture
    ), patch.object(rb, "post", side_effect=transport), ThreadPoolExecutor(
        max_workers=2
    ) as pool:
        one = pool.submit(run, "one")
        two = pool.submit(run, "two")
        entered.wait(2)
        rejected = hazards._run_osm_area_fetch(work, "three")
        assert rejected.coverage["reason"] == "acquisition_busy"
        try:
            assert one.result(2).coverage["status"] == "UNAVAILABLE"
            assert two.result(2).coverage["status"] == "UNAVAILABLE"
        finally:
            release.set()
    # Wait for actual executor cleanup, not an arbitrary sleep.
    for future in submitted:
        with pytest.raises(rb.RoutingDeadlineExceeded):
            future.result(timeout=2)
    assert c.cache.stats["size"] == 0 and not c._flights


def test_multistop_unavailable_coverage_blocks_every_mandatory_leg():
    from voyagr.services.routing.integrity import (
        assess_response,
        normalize_requirements,
    )
    from voyagr.services.routing.journey_geometry import stitch_legs
    from voyagr.utils.hazard_matching import HazardDataset, HazardList

    legs = [
        {"source": "GraphHopper", "geometry": [[53.5, -1.2], [53.51, -1.19]]},
        {"source": "Valhalla", "geometry": [[53.51, -1.19], [53.52, -1.18]]},
    ]
    journey = stitch_legs(legs)
    req = normalize_requirements(
        {
            "avoid_caz": False,
            "avoidance_requirements": [
                {"category": "railway_crossings", "enabled": True, "mode": "mandatory"}
            ],
        }
    )
    result = assess_response(
        dict(journey, success=True, legs=legs),
        req,
        HazardDataset({"railway_crossing": HazardList(coverage={"status": "UNKNOWN"})}),
    )
    assert not result["automatic_selection_allowed"]
    assert all(
        not leg["avoidance_assessment"]["automatic_selection_allowed"]
        for leg in result["legs"]
    )


def test_spatial_and_query_size_limits_refuse_unbounded_work():
    with pytest.raises(ValueError):
        oh.build_traffic_signals_query(0, 0, 90, 180)
    with pytest.raises(ValueError):
        oh.build_poi_query(53.5, -1.2, 1000000, ["fuel"])
    with pytest.raises(ValueError):
        client().query("x" * 65537)


def test_different_queries_respect_active_transport_limit():
    c = client(max_concurrent=1)
    entered = threading.Event()
    release = threading.Event()

    def transport(*args, **kwargs):
        entered.set()
        assert release.wait(2)
        return response()

    with patch.object(rb, "post", side_effect=transport), ThreadPoolExecutor(
        max_workers=1
    ) as pool:
        one = pool.submit(c.query, "one")
        assert entered.wait(2)
        try:
            assert c.query("two")["error"] == "acquisition_busy"
        finally:
            release.set()
        assert one.result(2)["success"]


def test_all_public_endpoints_fail_sequentially_with_two_endpoint_cap():
    c = oh.OverpassClient(endpoints=list(oh.PUBLIC_ENDPOINTS), cache=oh.OverpassCache())
    with patch.object(
        rb, "post", return_value=response(status=503)
    ) as post, patch.object(rb, "retry_wait") as wait:
        assert not c.query("signals")["success"]
    assert [call.args[0] for call in post.call_args_list] == list(
        oh.PUBLIC_ENDPOINTS[:2]
    )
    wait.assert_not_called()


def test_speed_acquisition_propagates_expired_budget_without_io():
    from speed_limit_detector import SpeedLimitDetector

    app = Flask(__name__)
    with app.test_request_context("/api/speed-limit"):
        g.routing_budget = rb.RoutingBudget(0)
        with patch.object(rb.requests, "post") as transport:
            with pytest.raises(rb.RoutingDeadlineExceeded):
                SpeedLimitDetector()._query_overpass_posted_limit(53.5, -1.2, "uk")
        transport.assert_not_called()


def test_acquisition_cap_does_not_falsely_exhaust_parent_route_budget():
    now = [0]
    app = Flask(__name__)
    c = client(max_elapsed=0.05)

    def transport(*args, **kwargs):
        now[0] = 0.1
        return response()

    with app.test_request_context("/api/route"):
        g.routing_budget = rb.RoutingBudget(30, clock=lambda: now[0])
        with patch.object(rb, "post", side_effect=transport):
            result = c.query("signals")
        assert result["error"] == "acquisition_deadline_exceeded"
        assert g.routing_budget.remaining() > 29
    assert c.cache.stats["size"] == 0


def test_late_streaming_transport_response_is_closed_on_deadline():
    now = [0]
    app = Flask(__name__)
    late = response()
    late.close = __import__("unittest.mock", fromlist=["Mock"]).Mock()

    def transport(*args, **kwargs):
        now[0] = 2
        return late

    with app.test_request_context("/api/route"):
        g.routing_budget = rb.RoutingBudget(1, clock=lambda: now[0])
        with patch.object(rb.requests, "post", side_effect=transport):
            with pytest.raises(rb.RoutingDeadlineExceeded):
                client().query("signals")
    late.close.assert_called_once()


def test_retry_after_http_date_is_respected_as_a_cooldown():
    from email.utils import formatdate

    c = client()
    future = formatdate(__import__("time").time() + 30, usegmt=True)
    with patch.object(
        rb,
        "post",
        side_effect=[response(status=429, headers={"Retry-After": future}), response()],
    ):
        assert c.query("signals")["endpoint_class"] == "PUBLIC"
    assert c._health[LOCAL] > c.clock() + 20


def test_stream_read_checks_deadline_and_closes_without_caching():
    now = [0]
    app = Flask(__name__)
    r = response()
    closed = threading.Event()

    def chunks(size):
        yield b'{"elements":'
        now[0] = 3
        yield b"[]}"

    r.iter_content = chunks
    r.close = closed.set
    c = client()
    with app.test_request_context("/api/route"):
        g.routing_budget = rb.RoutingBudget(2, clock=lambda: now[0])
        with patch.object(rb, "post", return_value=r):
            with pytest.raises(rb.RoutingDeadlineExceeded):
                c.query("signals")
    assert closed.is_set() and c.cache.stats["size"] == 0


def test_source_unknown_valid_empty_is_not_available_complete_coverage():
    from voyagr.services.hazards import fetch_traffic_lights_osm_bbox

    c = client()
    with patch.object(oh, "get_client", return_value=c), patch.object(
        rb, "post", return_value=response()
    ):
        result = fetch_traffic_lights_osm_bbox(53.5, 53.51, -1.2, -1.19)
    assert result == [] and result.coverage["response_state"] == "VALID_EMPTY"
    assert (
        result.coverage["status"] == "PARTIAL"
        and result.coverage["dataset_coverage"] == "UNVERIFIED"
    )


@pytest.mark.parametrize("target", ["lane", "speed"])
def test_expired_request_refuses_local_cached_lookup_before_acquisition(target):
    app = Flask(__name__)
    with app.test_request_context("/api/" + target):
        g.routing_budget = rb.RoutingBudget(0)
        if target == "lane":
            from voyagr.api import navigation

            with patch.dict(
                navigation._lane_data_cache,
                {
                    "53.5000,-1.2000": {
                        "timestamp": __import__("time").time(),
                        "data": {"total_lanes": 3},
                    }
                },
            ):
                with pytest.raises(rb.RoutingDeadlineExceeded):
                    navigation._fetch_osm_lane_data(53.5, -1.2)
        else:
            from speed_limit_detector import SpeedLimitDetector

            detector = SpeedLimitDetector()
            with patch.object(detector, "_get_posted_speed_limit") as lookup:
                with pytest.raises(rb.RoutingDeadlineExceeded):
                    detector.get_speed_limit_for_location(53.5, -1.2)
            lookup.assert_not_called()
