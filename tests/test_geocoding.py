"""Tests for geocoding query parsing and result ranking."""

import json
from unittest.mock import patch

import pytest

from voyagr.services.geocoding import (
    build_nominatim_structured_params,
    is_business_or_industrial_query,
    looks_like_partial_uk_postcode,
    looks_like_uk_postcode_query,
    nominatim_extra_params_for_query,
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
        assert p.postcode_kind == 'unit'

    def test_unit_prefix(self):
        p = parse_address_query('Unit 5, Industrial Estate, Rotherham')
        assert p.house_number == '5'
        assert p.is_business is True

    def test_industrial_keyword(self):
        assert is_business_or_industrial_query('Acme Warehouse, Doncaster')
        p = parse_address_query('Acme Warehouse, Doncaster')
        assert p.is_business is True

    def test_named_business_hints(self):
        assert is_business_or_industrial_query('Costa Coffee, Leeds')
        assert is_business_or_industrial_query('Boots Pharmacy Sheffield')
        assert is_business_or_industrial_query('Premier Inn Manchester')
        p = parse_address_query('Costa Coffee, Leeds')
        assert p.is_business is True

    def test_full_postcode_only(self):
        p = parse_address_query('SW1A 1AA')
        assert p.postcode == 'SW1A1AA'
        assert p.postcode_display == 'SW1A 1AA'
        assert p.postcode_kind == 'unit'
        assert p.street == ''
        assert p.house_number == ''

    def test_compact_postcode(self):
        p = parse_address_query('sw1a1aa')
        assert p.postcode == 'SW1A1AA'
        assert p.postcode_display == 'SW1A 1AA'
        assert p.postcode_kind == 'unit'

    def test_hyphenated_postcode(self):
        p = parse_address_query('SW1A-1AA')
        assert p.postcode == 'SW1A1AA'
        assert p.postcode_kind == 'unit'

    def test_gir_special_postcode(self):
        p = parse_address_query('GIR 0AA')
        assert p.postcode == 'GIR0AA'
        assert p.postcode_display == 'GIR 0AA'
        assert p.postcode_kind == 'unit'

    def test_outward_only_postcode(self):
        p = parse_address_query('LS1')
        assert p.postcode == 'LS1'
        assert p.postcode_kind == 'outward'
        assert p.street == ''
        assert build_nominatim_structured_params(p) is None

    def test_outward_sw1a(self):
        p = parse_address_query('SW1A')
        assert p.postcode == 'SW1A'
        assert p.postcode_kind == 'outward'

    def test_a_road_not_parsed_as_outcode(self):
        p = parse_address_query('A1')
        assert p.postcode == ''
        assert p.postcode_kind == ''

    def test_motorway_ambiguous_outcode_not_parsed(self):
        p = parse_address_query('M1')
        assert p.postcode == ''
        p = parse_address_query('M25')
        assert p.postcode == ''

    def test_full_manchester_postcode_still_parsed(self):
        p = parse_address_query('M1 1AD')
        assert p.postcode == 'M11AD'
        assert p.postcode_kind == 'unit'


class TestHouseNumberDetection:
    def test_leading_number(self):
        assert query_has_house_number('12 High Street')
        assert query_has_house_number('12A Main Road')

    def test_unit_prefix(self):
        assert query_has_house_number('Unit 3 Business Park')

    def test_no_number(self):
        assert not query_has_house_number('High Street, Sheffield')

    def test_partial_postcode_not_house_number(self):
        assert not query_has_house_number('SW1A 1')
        assert not query_has_house_number('SW1A 1A')
        assert not query_has_house_number('SW1A 1AA')
        assert not query_has_house_number('LS1')


class TestUkPostcodeHelpers:
    def test_looks_like_uk_postcode(self):
        assert looks_like_uk_postcode_query('SW1A 1AA')
        assert looks_like_uk_postcode_query('sw1a1aa')
        assert looks_like_uk_postcode_query('LS1')
        assert looks_like_uk_postcode_query('GIR 0AA')
        assert not looks_like_uk_postcode_query('High Street')
        assert not looks_like_uk_postcode_query('SW1A 1A')
        assert not looks_like_uk_postcode_query('A1')
        assert not looks_like_uk_postcode_query('M1')
        assert not looks_like_uk_postcode_query('M25')

    def test_looks_like_uk_postcode_full_m1_unit(self):
        assert looks_like_uk_postcode_query('M1 1AD')

    def test_looks_like_partial(self):
        assert looks_like_partial_uk_postcode('SW1A 1')
        assert looks_like_partial_uk_postcode('SW1A 1A')
        assert not looks_like_partial_uk_postcode('SW1A 1AA')
        assert not looks_like_partial_uk_postcode('LS1')

    def test_nominatim_extra_biases_postcodes_to_gb(self):
        extra = nominatim_extra_params_for_query('SW1A 1AA')
        assert extra.get('countrycodes') == 'gb'
        assert 'layer' not in extra

    def test_nominatim_extra_skips_layer_for_partial_postcode(self):
        extra = nominatim_extra_params_for_query('SW1A 1A')
        assert 'layer' not in extra
        assert extra.get('countrycodes') == 'gb'

    def test_nominatim_extra_keeps_layer_for_house_number(self):
        extra = nominatim_extra_params_for_query('12 High Street')
        assert extra.get('layer') == 'address'
        assert extra.get('namedetails') == '1'

    def test_nominatim_extra_skips_layer_for_business_unit(self):
        extra = nominatim_extra_params_for_query('Unit 5 Business Park Leeds')
        assert 'layer' not in extra
        assert extra.get('namedetails') == '1'


class TestStructuredParams:
    def test_builds_street_and_postcode(self):
        p = parse_address_query('45 Doncaster Road, Barnsley S70 1AA')
        params = build_nominatim_structured_params(p)
        assert params is not None
        assert params['street'] == '45 Doncaster Road'
        assert params['postalcode'] == 'S70 1AA'
        assert params.get('namedetails') == '1'

    def test_postcode_only_structured(self):
        p = parse_address_query('EC1A 1BB')
        params = build_nominatim_structured_params(p)
        assert params is not None
        assert params['postalcode'] == 'EC1A 1BB'
        assert 'street' not in params

    def test_skips_structured_street_for_business_name(self):
        p = parse_address_query('Tesco Express, Leeds')
        assert build_nominatim_structured_params(p) is None

    def test_keeps_postcode_structured_without_business_street(self):
        p = parse_address_query('Costa Coffee, LS1 5AA')
        params = build_nominatim_structured_params(p)
        assert params is not None
        assert params['postalcode'] == 'LS1 5AA'
        assert 'street' not in params


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

    def test_prefers_named_business_poi_over_street(self):
        query = 'Tesco Express, Leeds'
        street = {
            'lat': '53.8',
            'lon': '-1.55',
            'type': 'residential',
            'class': 'highway',
            'importance': 0.7,
            'display_name': 'Express Way, Leeds',
            'name': 'Express Way',
            'address': {'road': 'Express Way', 'city': 'Leeds'},
        }
        poi = {
            'lat': '53.801',
            'lon': '-1.549',
            'type': 'supermarket',
            'class': 'shop',
            'importance': 0.4,
            'display_name': 'Tesco Express, Briggate, Leeds',
            'name': 'Tesco Express',
            'address': {'road': 'Briggate', 'city': 'Leeds', 'house_number': '12'},
        }
        ranked = rank_geocode_results(query, [street, poi])
        assert ranked[0]['name'] == 'Tesco Express'
        assert ranked[0]['class'] == 'shop'

    def test_prefers_gb_postcode_over_foreign_homonym(self):
        query = 'LS1'
        foreign = {
            'lat': '21.0',
            'lon': '105.0',
            'type': 'residential',
            'importance': 0.8,
            'display_name': 'LS1, Hanoi, Vietnam',
            'address': {'road': 'LS1', 'country_code': 'vn'},
        }
        uk = {
            'lat': '53.8',
            'lon': '-1.55',
            'type': 'postcode',
            'importance': 0.5,
            'display_name': 'LS1, Leeds, United Kingdom',
            'address': {'postcode': 'LS1', 'city': 'Leeds', 'country_code': 'gb'},
            '_source': 'postcodes_io',
        }
        ranked = rank_geocode_results(query, [foreign, uk])
        assert ranked[0]['address']['country_code'] == 'gb'

    def test_outward_ls1_does_not_match_ls10_district(self):
        query = 'LS1'
        ls10 = {
            'lat': '53.81',
            'lon': '-1.54',
            'type': 'postcode',
            'importance': 0.7,
            'display_name': 'LS10 2AB, Leeds',
            'address': {'postcode': 'LS10 2AB', 'city': 'Leeds', 'country_code': 'gb'},
        }
        ls1 = {
            'lat': '53.8',
            'lon': '-1.55',
            'type': 'postcode',
            'importance': 0.5,
            'display_name': 'LS1, Leeds, United Kingdom',
            'address': {'postcode': 'LS1', 'city': 'Leeds', 'country_code': 'gb'},
            '_source': 'postcodes_io',
        }
        ranked = rank_geocode_results(query, [ls10, ls1])
        assert ranked[0]['address']['postcode'].replace(' ', '').startswith('LS1')
        assert not ranked[0]['address']['postcode'].replace(' ', '').startswith('LS10')

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

    def test_strong_postcodes_io_skips_tomtom(self):
        results = [{
            'type': 'postcode',
            'address': {'postcode': 'SW1A 1AA', 'country_code': 'gb'},
            'importance': 0.9,
            '_source': 'postcodes_io',
        }]
        assert not should_fetch_tomtom('SW1A 1AA', results)

    def test_business_without_poi_fetches_tomtom(self):
        results = [{
            'type': 'residential',
            'class': 'highway',
            'name': 'Coffee Street',
            'address': {'road': 'Coffee Street'},
            'importance': 0.5,
        }]
        assert should_fetch_tomtom('Costa Coffee, Leeds', results)


@pytest.fixture
def client():
    from voyagr_web import app
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


class TestGeocodeEndpoint:
    @patch('voyagr.api.search._tomtom_geocode')
    @patch('voyagr.api.search._nominatim_search')
    @patch('voyagr.api.search._postcodes_io_geocode')
    def test_ranks_house_number_first(self, mock_pc, mock_nom, mock_tt, client):
        mock_pc.return_value = []
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
    @patch('voyagr.api.search._postcodes_io_geocode')
    def test_merges_tomtom_for_house_number(self, mock_pc, mock_nom, mock_tt, client):
        mock_pc.return_value = []
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

    @patch('voyagr.api.search._tomtom_geocode')
    @patch('voyagr.api.search._nominatim_search')
    @patch('voyagr.api.search._postcodes_io_geocode')
    def test_postcode_only_uses_postcodes_io(self, mock_pc, mock_nom, mock_tt, client):
        mock_pc.return_value = [{
            'lat': '51.50101',
            'lon': '-0.141563',
            'display_name': 'SW1A 1AA, Westminster, London, United Kingdom',
            'name': 'SW1A 1AA',
            'type': 'postcode',
            'importance': 0.9,
            'address': {
                'postcode': 'SW1A 1AA',
                'city': 'Westminster',
                'country': 'United Kingdom',
                'country_code': 'gb',
            },
            '_source': 'postcodes_io',
        }]
        mock_nom.return_value = ([], True)
        mock_tt.return_value = []

        rv = client.get('/api/geocode?q=SW1A+1AA&limit=3')
        assert rv.status_code == 200
        data = json.loads(rv.data)
        assert len(data) == 1
        assert data[0]['type'] == 'postcode'
        assert data[0]['address']['postcode'] == 'SW1A 1AA'
        assert '_source' not in data[0]
        mock_pc.assert_called()

    @patch('voyagr.api.search._tomtom_geocode')
    @patch('voyagr.api.search._nominatim_search')
    @patch('voyagr.api.search._postcodes_io_geocode')
    def test_outward_code_resolves(self, mock_pc, mock_nom, mock_tt, client):
        mock_pc.return_value = [{
            'lat': '53.797',
            'lon': '-1.551',
            'display_name': 'LS1, Leeds, England, United Kingdom',
            'name': 'LS1',
            'type': 'postcode',
            'importance': 0.75,
            'address': {
                'postcode': 'LS1',
                'city': 'Leeds',
                'country_code': 'gb',
            },
            '_source': 'postcodes_io',
        }]
        mock_nom.return_value = ([], True)
        mock_tt.return_value = []

        rv = client.get('/api/geocode?q=LS1&limit=3')
        assert rv.status_code == 200
        data = json.loads(rv.data)
        assert data[0]['name'] == 'LS1'
        assert data[0]['address']['country_code'] == 'gb'


    @patch('voyagr.api.search._tomtom_geocode')
    @patch('voyagr.api.search._nominatim_search')
    @patch('voyagr.api.search._postcodes_io_geocode')
    def test_ranks_business_poi_first(self, mock_pc, mock_nom, mock_tt, client):
        mock_pc.return_value = []
        mock_nom.side_effect = [([
            {
                'lat': '53.8',
                'lon': '-1.55',
                'type': 'residential',
                'class': 'highway',
                'importance': 0.7,
                'display_name': 'Express Way, Leeds',
                'name': 'Express Way',
                'address': {'road': 'Express Way', 'city': 'Leeds'},
            },
            {
                'lat': '53.801',
                'lon': '-1.549',
                'type': 'supermarket',
                'class': 'shop',
                'importance': 0.4,
                'display_name': 'Tesco Express, Briggate, Leeds',
                'name': 'Tesco Express',
                'address': {'road': 'Briggate', 'city': 'Leeds'},
            },
        ], True), ([], True)]
        mock_tt.return_value = []

        rv = client.get('/api/geocode?q=Tesco+Express,+Leeds&limit=3')
        assert rv.status_code == 200
        data = json.loads(rv.data)
        assert data[0]['name'] == 'Tesco Express'
        assert data[0]['class'] == 'shop'


class TestTomtomPoiHelper:
    @patch('voyagr.api.search.requests.get')
    def test_prefers_poi_name_over_street_number(self, mock_get):
        from voyagr.api.search import _tomtom_geocode

        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'results': [{
                'type': 'POI',
                'position': {'lat': 53.8, 'lon': -1.55},
                'poi': {
                    'name': 'Tesco Express',
                    'categories': ['shop.supermarket'],
                },
                'address': {
                    'streetNumber': '12',
                    'streetName': 'Briggate',
                    'municipality': 'Leeds',
                    'country': 'United Kingdom',
                    'postalCode': 'LS1 6HD',
                    'freeformAddress': '12 Briggate, Leeds, LS1 6HD',
                    'countryCode': 'GB',
                },
            }],
        }
        with patch.dict('os.environ', {'TOMTOM_API_KEY': 'test-key'}):
            results = _tomtom_geocode('Tesco Express Leeds', 5)
        assert len(results) == 1
        assert results[0]['name'] == 'Tesco Express'
        assert results[0]['class'] == 'shop'
        assert 'Tesco Express' in results[0]['display_name']
        assert results[0]['address']['house_number'] == '12'
        assert results[0]['address']['postcode'] == 'LS1 6HD'

class TestPostcodesIoHelper:
    @patch('voyagr.api.search.requests.get')
    def test_unit_postcode_lookup(self, mock_get):
        from voyagr.api.search import _postcodes_io_geocode

        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'status': 200,
            'result': {
                'postcode': 'SW1A 1AA',
                'longitude': -0.141563,
                'latitude': 51.50101,
                'admin_district': 'Westminster',
                'region': 'London',
                'country': 'England',
            },
        }
        results = _postcodes_io_geocode('SW1A 1AA')
        assert len(results) == 1
        assert results[0]['type'] == 'postcode'
        assert results[0]['address']['postcode'] == 'SW1A 1AA'
        assert results[0]['_source'] == 'postcodes_io'

    @patch('voyagr.api.search.requests.get')
    def test_outcode_lookup(self, mock_get):
        from voyagr.api.search import _postcodes_io_geocode

        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'status': 200,
            'result': {
                'outcode': 'LS1',
                'longitude': -1.55,
                'latitude': 53.8,
                'admin_district': ['Leeds'],
                'country': ['England'],
            },
        }
        results = _postcodes_io_geocode('LS1')
        assert len(results) == 1
        assert results[0]['name'] == 'LS1'
        assert 'Leeds' in results[0]['display_name']
