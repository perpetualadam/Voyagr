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
        assert model['priority'][0]['multiply_by'] == '0.01'


class TestCombinedCameraModel:
    def test_area_sections_always_used_with_scdb(self, sample_camera_areas):
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        camera_hazards = {
            'camera_speed': [{'lat': 53.55, 'lon': -1.45, 'type': 'camera_speed'}],
        }
        model = hz.build_graphhopper_combined_camera_model(camera_hazards, bbox)
        rules = ' '.join(r['if'] for r in model.get('priority', []))
        assert 'in_camera_area_10' in rules
        assert 'in_hazard_0' in rules
        assert model.get('areas')

    def test_area_sections_without_scdb(self, sample_camera_areas):
        bbox = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
        model = hz.build_graphhopper_combined_camera_model(None, bbox)
        assert 'in_camera_area_10' in model['priority'][0]['if']
        assert 'areas' not in model
