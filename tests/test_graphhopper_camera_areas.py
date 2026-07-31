"""Tests for GraphHopper UK camera area section model (128 grid sections)."""

import json
from pathlib import Path

import pytest

from voyagr.services import hazards as hz


@pytest.fixture
def sample_camera_areas(monkeypatch):
    """Minimal geojson with two grid sections for bbox filtering tests."""
    data = {
        'type': 'FeatureCollection',
        'features': [
            {
                'id': 'camera_area_10',
                'type': 'Feature',
                'geometry': {
                    'type': 'MultiPolygon',
                    'coordinates': [[[[-1.5, 53.5], [-1.4, 53.5], [-1.4, 53.6], [-1.5, 53.6], [-1.5, 53.5]]]],
                },
            },
            {
                'id': 'camera_area_20',
                'type': 'Feature',
                'geometry': {
                    'type': 'MultiPolygon',
                    'coordinates': [[[[0.1, 51.4], [0.2, 51.4], [0.2, 51.5], [0.1, 51.5], [0.1, 51.4]]]],
                },
            },
        ],
    }
    monkeypatch.setattr(hz, 'CAMERA_AREAS_DATA', data)
    return data


class TestGraphhopperCameraAreasCount:
    def test_count_from_geojson_when_loaded(self, sample_camera_areas, monkeypatch):
        monkeypatch.delenv('GRAPHHOPPER_CAMERA_AREAS_COUNT', raising=False)
        assert hz.get_graphhopper_camera_areas_count() == 2

    def test_count_from_repo_geojson(self, monkeypatch):
        monkeypatch.delenv('GRAPHHOPPER_CAMERA_AREAS_COUNT', raising=False)
        path = Path(__file__).resolve().parents[1] / 'camera_areas.geojson'
        if not path.exists():
            pytest.skip('camera_areas.geojson not in workspace')
        with open(path) as f:
            monkeypatch.setattr(hz, 'CAMERA_AREAS_DATA', json.load(f))
        assert hz.get_graphhopper_camera_areas_count() == 128


class TestCameraAreaBboxFiltering:
    def test_includes_section_inside_bbox(self, sample_camera_areas):
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        indices = hz._camera_area_indices_for_bbox(bbox)
        assert 10 in indices
        assert 20 not in indices

    def test_build_model_uses_in_camera_area_rules(self, sample_camera_areas):
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        model = hz.build_graphhopper_camera_avoidance_model(bbox)
        assert 'priority' in model
        rule = model['priority'][0]['if']
        assert 'in_camera_area_10' in rule
        assert 'in_camera_area_20' not in rule
        assert model['priority'][0]['multiply_by'] == '0'


class TestCombinedCameraModel:
    def test_merges_scdb_with_area_sections_when_filters_not_selective(self, sample_camera_areas):
        """Map-data-selected SCDB cameras must hard-block alongside UK area sections."""
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        camera_hazards = {
            'camera_speed': [{'lat': 53.55, 'lon': -1.45, 'type': 'camera_speed'}],
            'camera_red_light': [{'lat': 53.56, 'lon': -1.44, 'type': 'camera_red_light'}],
        }
        model = hz.build_graphhopper_combined_camera_model(
            camera_hazards, bbox, selective_filters=False,
        )
        rules = ' '.join(r['if'] for r in model.get('priority', []))
        assert 'in_camera_area_10' in rules
        assert 'in_hazard_0' in rules
        assert 'areas' in model
        assert all(
            r.get('multiply_by') == hz.GRAPHHOPPER_HAZARD_BLOCK_MULTIPLY_BY
            for r in model.get('priority', [])
        )

    def test_selective_map_data_filters_skip_area_sections(self, sample_camera_areas):
        """When Settings disables a camera type, do not use type-agnostic area sections."""
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        camera_hazards = {
            'camera_red_light': [{'lat': 53.55, 'lon': -1.45, 'type': 'camera_red_light'}],
        }
        model = hz.build_graphhopper_combined_camera_model(
            camera_hazards, bbox, selective_filters=True,
        )
        rules = ' '.join(r['if'] for r in model.get('priority', []))
        assert 'in_camera_area_' not in rules
        assert 'in_hazard_0' in rules
        assert 'areas' in model

    def test_scdb_used_when_area_sections_unavailable(self, monkeypatch):
        monkeypatch.setattr(hz, 'build_graphhopper_camera_avoidance_model', lambda bbox: {})
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        camera_hazards = {
            'camera_speed': [{'lat': 53.55, 'lon': -1.45, 'type': 'camera_speed'}],
        }
        model = hz.build_graphhopper_combined_camera_model(
            camera_hazards, bbox, selective_filters=False,
        )
        assert any('in_hazard_' in r.get('if', '') for r in model.get('priority', []))
        assert all(
            r.get('multiply_by') == hz.GRAPHHOPPER_HAZARD_BLOCK_MULTIPLY_BY
            for r in model.get('priority', [])
        )

    def test_area_sections_hard_block_cameras(self, sample_camera_areas):
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        model = hz.build_graphhopper_combined_camera_model(None, bbox, selective_filters=False)
        assert model['priority'][0]['multiply_by'] == '0'
        assert 'in_camera_area_10' in model['priority'][0]['if']
        assert 'areas' not in model

    def test_selective_helper_true_when_camera_type_disabled(self, monkeypatch):
        class FakeCursor:
            def execute(self, *_a, **_k):
                return None

            def fetchall(self):
                return [
                    ('camera_speed', 0),
                    ('camera_red_light', 1),
                    ('camera_average_speed', 1),
                    ('camera_bus_lane', 1),
                    ('camera_mobile', 1),
                    ('camera_other', 1),
                ]

        class FakeConn:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def cursor(self):
                return FakeCursor()

        monkeypatch.setattr(hz, 'db_connection', lambda: FakeConn())
        assert hz.camera_map_data_filters_are_selective() is True

    def test_selective_helper_false_when_all_enabled(self, monkeypatch):
        class FakeCursor:
            def execute(self, *_a, **_k):
                return None

            def fetchall(self):
                return [
                    ('camera_speed', 1),
                    ('camera_red_light', 1),
                    ('camera_average_speed', 1),
                    ('camera_bus_lane', 1),
                    ('camera_mobile', 1),
                    ('camera_other', 1),
                ]

        class FakeConn:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def cursor(self):
                return FakeCursor()

        monkeypatch.setattr(hz, 'db_connection', lambda: FakeConn())
        assert hz.camera_map_data_filters_are_selective() is False

    def test_scdb_zones_prefer_cameras_near_corridor(self):
        """Capped SCDB list should hard-block cameras on the A→B line first."""
        camera_hazards = {
            'camera_speed': [
                {'lat': 52.0, 'lon': 0.0, 'type': 'camera_speed'},  # far from corridor
                {'lat': 51.505, 'lon': -0.105, 'type': 'camera_speed'},  # near corridor
            ],
        }
        model = hz.build_graphhopper_filtered_camera_model(
            camera_hazards,
            max_hazards=1,
            start_lat=51.50,
            start_lon=-0.10,
            end_lat=51.51,
            end_lon=-0.11,
        )
        feature = model['areas']['features'][0]
        coords = feature['geometry']['coordinates'][0]
        # Polygon center ≈ first camera chosen; should be the near-corridor one.
        lons = [c[0] for c in coords[:-1]]
        lats = [c[1] for c in coords[:-1]]
        center_lon = sum(lons) / len(lons)
        center_lat = sum(lats) / len(lats)
        assert abs(center_lat - 51.505) < 0.01
        assert abs(center_lon - (-0.105)) < 0.01
