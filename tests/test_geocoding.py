"""Tests for geocoding query parsing and result ranking."""

import json
from unittest.mock import patch

import pytest

from voyagr.services.geocoding import (
    build_nominatim_structured_params,
    is_business_or_industrial_query,
    parse_address_query,
    query_has_house_number,
    rank_geocode_results,
    score_geocode_result,
    should_fetch_tomtom,
)


class TestParseAddressQuery:
    def test_house_number_and_postcode(self):
        p = parse_address_query('12 High Street, Sheffield, S1 2AB')
        assert p.house_number == '12'
        assert 'high street' in p.street.lower()
        assert p.postcode == 'S12AB'
        assert 'Sheffield' in p.city

    def test_unit_prefix(self):
        p = parse_address_query('Unit 5, Industrial Estate, Rotherham')
        assert p.house_number == '5'
        assert p.is_business is True

    def test_industrial_keyword(self):
        assert is_business_or_industrial_query('Acme Warehouse, Doncaster')
        p = parse_address_query('Acme Warehouse, Doncaster')
        assert p.is_business is True


class TestHouseNumberDetection:
    def test_leading_number(self):
        assert query_has_house_number('12 High Street')
        assert query_has_house_number('12A Main Road')

    def test_unit_prefix(self):
        assert query_has_house_number('Unit 3 Business Park')

    def test_no_number(self):
        assert not query_has_house_number('High Street, Sheffield')


class TestStructuredParams:
    def test_builds_street_and_postcode(self):
        p = parse_address_query('45 Doncaster Road, Barnsley S70 1AA')
        params = build_nominatim_structured_params(p)
        assert params is not None
        assert params['street'] == '45 Doncaster Road'
        assert params['postalcode'] == 'S70 1AA'


class TestRanking:
    def test_prefers_matching_house_number_over_street_centroid(self):
        query = '12 High Street, Sheffield'
        wrong = {
            'lat': '53.38',
            'lon': '-1.47',
            'type': 'street',
            'importance': 0.6,
            'display_name': 'High Street, Sheffield',
            'address': {'road': 'High Street', 'city': 'Sheffield'},
        }
        right = {
            'lat': '53.381',
            'lon': '-1.471',
            'type': 'house',
            'importance': 0.4,
            'display_name': '12, High Street, Sheffield',
            'address': {'house_number': '12', 'road': 'High Street', 'city': 'Sheffield'},
        }
        ranked = rank_geocode_results(query, [wrong, right])
        assert ranked[0]['address']['house_number'] == '12'

    def test_penalises_wrong_house_number(self):
        query = '12 High Street, Sheffield'
        wrong_num = {
            'lat': '53.38',
            'lon': '-1.47',
            'type': 'house',
            'address': {'house_number': '88', 'road': 'High Street'},
        }
        right_num = {
            'lat': '53.381',
            'lon': '-1.471',
            'type': 'house',
            'address': {'house_number': '12', 'road': 'High Street'},
        }
        assert score_geocode_result(parse_address_query(query), right_num) > \
            score_geocode_result(parse_address_query(query), wrong_num)

    def test_postcode_match_boosts_result(self):
        query = 'Industrial Way, Barnsley S70 6TA'
        with_pc = {
            'lat': '53.5',
            'lon': '-1.5',
            'type': 'industrial',
            'address': {'road': 'Industrial Way', 'postcode': 'S70 6TA'},
        }
        without_pc = {
            'lat': '53.6',
            'lon': '-1.6',
            'type': 'industrial',
            'address': {'road': 'Industrial Way', 'postcode': 'S71 1AA'},
        }
        ranked = rank_geocode_results(query, [without_pc, with_pc])
        assert ranked[0]['address']['postcode'] == 'S70 6TA'

    def test_disambiguates_same_street_different_cities(self):
        query = '12 High Street, Sheffield'
        mexborough = {
            'lat': '53.493',
            'lon': '-1.288',
            'type': 'shop',
            'importance': 0.7,
            'display_name': '12, High Street, Mexborough, Doncaster',
            'address': {
                'house_number': '12',
                'road': 'High Street',
                'town': 'Mexborough',
                'city': 'Doncaster',
            },
        }
        sheffield = {
            'lat': '53.381',
            'lon': '-1.471',
            'type': 'house',
            'importance': 0.4,
            'display_name': '12, High Street, Sheffield',
            'address': {
                'house_number': '12',
                'road': 'High Street',
                'city': 'Sheffield',
            },
        }
        ranked = rank_geocode_results(query, [mexborough, sheffield])
        assert ranked[0]['address'].get('city') == 'Sheffield'


class TestShouldFetchTomtom:
    def test_house_number_query_empty_results(self):
        assert should_fetch_tomtom('12 Foo Street', [])

    def test_weak_nominatim_match(self):
        results = [{
            'type': 'street',
            'address': {'road': 'Foo Street'},
            'importance': 0.5,
        }]
        assert should_fetch_tomtom('12 Foo Street, Leeds', results)

    def test_strong_match_skips_tomtom(self):
        results = [{
            'type': 'house',
            'address': {'house_number': '12', 'road': 'Foo Street', 'postcode': 'LS1 1AA'},
            'importance': 0.5,
        }]
        assert not should_fetch_tomtom('12 Foo Street, Leeds LS1 1AA', results)


@pytest.fixture
def client():
    from voyagr_web import app
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


class TestGeocodeEndpoint:
    @patch('voyagr.api.search._tomtom_geocode')
    @patch('voyagr.api.search._nominatim_search')
    def test_ranks_house_number_first(self, mock_nom, mock_tt, client):
        street_then_house = ([
            {
                'lat': '53.38',
                'lon': '-1.47',
                'type': 'street',
                'importance': 0.7,
                'display_name': 'High Street, Sheffield',
                'address': {'road': 'High Street', 'city': 'Sheffield'},
            },
            {
                'lat': '53.381',
                'lon': '-1.471',
                'type': 'house',
                'importance': 0.4,
                'display_name': '12 High Street, Sheffield',
                'address': {'house_number': '12', 'road': 'High Street', 'city': 'Sheffield'},
            },
        ], True)
        mock_nom.side_effect = [street_then_house, ([], True)]
        mock_tt.return_value = []

        rv = client.get('/api/geocode?q=12+High+Street,+Sheffield&limit=3')
        assert rv.status_code == 200
        data = json.loads(rv.data)
        assert data[0]['address']['house_number'] == '12'

    @patch('voyagr.api.search._tomtom_geocode')
    @patch('voyagr.api.search._nominatim_search')
    def test_merges_tomtom_for_house_number(self, mock_nom, mock_tt, client):
        mock_nom.side_effect = [
            ([{
                'lat': '53.38',
                'lon': '-1.47',
                'type': 'street',
                'address': {'road': 'High Street'},
            }], True),
            ([], True),
        ]
        mock_tt.return_value = [{
            'lat': '53.381',
            'lon': '-1.471',
            'type': 'address',
            'display_name': '12 High Street, Sheffield',
            'address': {'house_number': '12', 'road': 'High Street'},
            '_source': 'tomtom',
        }]

        with patch.dict('os.environ', {'TOMTOM_API_KEY': 'test-key'}):
            rv = client.get('/api/geocode?q=12+High+Street,+Sheffield&limit=1')
        assert rv.status_code == 200
        data = json.loads(rv.data)
        assert data[0]['address']['house_number'] == '12'
