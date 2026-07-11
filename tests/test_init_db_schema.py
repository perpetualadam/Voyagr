"""Schema-completeness tests for the consolidated init_db.

init_db() previously existed as two DIVERGENT copies (voyagr_web.py vs
voyagr/models/database.py). These tests pin the full schema created by the single
source of truth (voyagr.models.database.init_db) so the divergence cannot silently
return. The DB file is redirected to a temp path so the tests are fully isolated
(no shared voyagr_web.db state).
"""

import sqlite3

import pytest

import voyagr.models.database as dbmod

# Tables the complete schema must create. The bug we are guarding against was the
# stale copy missing promo/entitlement/feedback tables and camera_* buckets.
EXPECTED_TABLES = {
    'trips', 'vehicles', 'charging_stations', 'cameras', 'hazard_preferences',
    'route_hazards_cache', 'persistent_route_cache', 'community_hazard_reports',
    'search_history', 'favorite_locations', 'speed_limit_cache',
    'speed_limit_feedback', 'lane_guidance_cache', 'app_settings',
    'ml_route_predictions', 'ml_traffic_patterns', 'gesture_events',
    'battery_status_log', 'dashcam_recordings', 'promo_coupons',
    'promo_redemptions', 'user_entitlements',
}


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "schema_test.db")
    monkeypatch.setattr(dbmod, "DB_FILE", db_path)
    dbmod.init_db()
    conn = sqlite3.connect(db_path)
    try:
        yield conn
    finally:
        conn.close()


def _tables(conn):
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {r[0] for r in cur.fetchall()}


def test_init_db_creates_full_schema(fresh_db):
    tables = _tables(fresh_db)
    missing = EXPECTED_TABLES - tables
    assert not missing, f"init_db did not create: {sorted(missing)}"


def test_init_db_seeds_camera_hazard_buckets(fresh_db):
    rows = dict(fresh_db.execute(
        "SELECT hazard_type, penalty_seconds FROM hazard_preferences "
        "WHERE hazard_type LIKE 'camera_%'"
    ).fetchall())
    from voyagr.config import CAMERA_HAZARD_BUCKETS
    for bucket in CAMERA_HAZARD_BUCKETS:
        assert bucket in rows, f"missing seeded bucket {bucket}"
    # apply_camera_hazard_penalty_defaults: red-light 1200s, other camera_* 800s.
    assert rows['camera_red_light'] == 1200
    for bucket in ('camera_speed', 'camera_average_speed', 'camera_bus_lane',
                   'camera_mobile', 'camera_other'):
        assert rows[bucket] == 800


def test_init_db_app_settings_has_multidrop_columns(fresh_db):
    cols = {r[1] for r in fresh_db.execute("PRAGMA table_info(app_settings)").fetchall()}
    for col in ('optimize_stop_order', 'round_trip', 'traffic_aware_routing',
                'avoid_road_closures', 'avoid_incidents'):
        assert col in cols, f"app_settings missing multidrop column {col}"


def test_init_db_is_idempotent(fresh_db, tmp_path, monkeypatch):
    # Running again must not raise (CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE).
    dbmod.init_db()
    assert EXPECTED_TABLES <= _tables(fresh_db)
