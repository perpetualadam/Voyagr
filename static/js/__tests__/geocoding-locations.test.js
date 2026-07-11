/**
 * Tests for modules/navigation/geocoding-locations.js
 */
const GL = require('../modules/navigation/geocoding-locations.js');

describe('geocoding-locations module', () => {
    test('readStoredLocationFromDataset returns cached coords when present', () => {
        const out = GL.readStoredLocationFromDataset({
            lat: '51.5',
            lon: '-0.1',
            displayName: 'London',
        }, 'fallback');
        expect(out).toEqual({
            lat: 51.5,
            lon: -0.1,
            display_name: 'London',
            cached: true,
        });
    });

    test('readStoredLocationFromDataset returns null when dataset incomplete', () => {
        expect(GL.readStoredLocationFromDataset({ lat: '51.5' }, 'x')).toBeNull();
        expect(GL.readStoredLocationFromDataset(null, 'x')).toBeNull();
    });

    test('status messages cover loading, not-found, resolved, and errors', () => {
        expect(GL.getGeocodeLoadingStatusMessage()).toContain('Geocoding');
        expect(GL.buildGeocodeNotFoundStatusMessage('start', 'ABC')).toContain('start location: ABC');
        expect(GL.buildGeocodeNotFoundStatusMessage('end', 'XYZ')).toContain('end location: XYZ');
        const resolved = GL.buildGeocodeResolvedStatusMessage(
            { display_name: 'A', cached: true },
            { display_name: 'B', cached: false }
        );
        expect(resolved).toContain('A → B');
        expect(resolved).toContain('(cached)');
        expect(GL.buildGeocodeErrorStatusMessage('timeout')).toContain('timeout');
    });

    test('formatGeocodeApiCoords builds lat,lon strings and names', () => {
        expect(GL.formatGeocodeApiCoords(
            { lat: 51.5, lon: -0.1, display_name: 'Start' },
            { lat: 52.0, lon: -1.0, display_name: 'End' }
        )).toEqual({
            start: '51.5,-0.1',
            end: '52,-1',
            startName: 'Start',
            endName: 'End',
        });
    });

    test('coordinate parsing helpers validate and build geocode results', () => {
        expect(GL.normalizeGeocodeQuery('  ')).toBeNull();
        expect(GL.normalizeGeocodeQuery(' Leeds ')).toBe('Leeds');
        expect(GL.isCoordinateFormat('51.5,-0.1')).toBe(true);
        expect(GL.isCoordinateFormat('bad')).toBe(false);
        const coord = GL.parseCoordinateGeocodeResult('51.5,-0.1');
        expect(coord.lat).toBe(51.5);
        expect(coord.display_name).toContain('51.5000');
        expect(GL.buildPlusCodeGeocodeResult('CODE', { lat: 1, lon: 2 }).display_name).toContain('Plus Code');
        expect(GL.parseNominatimResultRow({ lat: '51', lon: '-1', display_name: 'X' })).toEqual({
            lat: 51, lon: -1, display_name: 'X',
        });
    });

    test('parseLatLonPairString and invalid coordinate status messages', () => {
        expect(GL.parseLatLonPairString('51.5,-0.1')).toEqual({ valid: true, coords: [51.5, -0.1] });
        expect(GL.parseLatLonPairString('bad')).toEqual({ valid: false });
        expect(GL.getInvalidCoordinatesFormatStatusMessage()).toContain('format');
        expect(GL.getInvalidCoordinatesStatusMessage()).toContain('Invalid coordinates');
    });

    test('geocode cache read/write helpers', () => {
        const cache = {};
        expect(GL.readGeocodeCacheHit(cache, 'missing')).toBeNull();
        GL.writeGeocodeCacheEntry(cache, 'Leeds', { lat: 53.8, lon: -1.5, display_name: 'Leeds' });
        expect(GL.readGeocodeCacheHit(cache, 'Leeds')).toEqual({
            lat: 53.8,
            lon: -1.5,
            display_name: 'Leeds',
            cached: true,
        });
    });

    test('buildNominatimSearchUrl encodes query and limit', () => {
        expect(GL.buildNominatimSearchUrl('https://nominatim.example/search', 'Leeds UK', 5))
            .toBe('https://nominatim.example/search?q=Leeds%20UK&limit=5');
    });

    test('parseNominatimFetchPayload handles api errors, empty, and success', () => {
        expect(GL.parseNominatimFetchPayload({ success: false, error: 'rate limit' }))
            .toEqual({ ok: false, reason: 'api_error', message: 'rate limit' });
        expect(GL.parseNominatimFetchPayload([])).toEqual({ ok: false, reason: 'empty' });
        expect(GL.parseNominatimFetchPayload([{ lat: '51', lon: '-1', display_name: 'X' }]))
            .toEqual({ ok: true, geocoded: { lat: 51, lon: -1, display_name: 'X' } });
    });

    test('buildGeocodeEndpointPlan prefers stored dataset coords', () => {
        const stored = { lat: 51.5, lon: -0.1, display_name: 'London', cached: true };
        expect(GL.buildGeocodeEndpointPlan(stored, 'typed')).toEqual({
            action: 'use_stored',
            result: stored,
        });
        expect(GL.buildGeocodeEndpointPlan(null, 'Leeds')).toEqual({
            action: 'fetch',
            address: 'Leeds',
        });
    });

    test('buildGeocodePairPlans assembles start/end endpoint plans', () => {
        const stored = { lat: 51.5, lon: -0.1, display_name: 'London', cached: true };
        const plans = GL.buildGeocodePairPlans({
            startStored: stored,
            startAddress: 'London',
            endStored: null,
            endAddress: 'Leeds',
        });
        expect(plans.startPlan.action).toBe('use_stored');
        expect(plans.endPlan.action).toBe('fetch');
        expect(plans.endPlan.address).toBe('Leeds');
        expect(plans.loadingStatusMessage).toContain('Geocoding');
    });

    test('buildGeocodePairSuccessOutcomePlan formats coords and status', () => {
        const outcome = GL.buildGeocodePairSuccessOutcomePlan(
            { lat: 51.5, lon: -0.1, display_name: 'Start' },
            { lat: 52, lon: -1, display_name: 'End' }
        );
        expect(outcome.ok).toBe(true);
        expect(outcome.coords.start).toBe('51.5,-0.1');
        expect(outcome.statusMessage).toContain('Start → End');
        expect(outcome.clearGeocodingFlag).toBe(true);
    });

    test('buildGeocodeEndpointFailurePlan and error outcome include status metadata', () => {
        const fail = GL.buildGeocodeEndpointFailurePlan('end', 'Nowhere');
        expect(fail.statusMessage).toContain('end location: Nowhere');
        expect(fail.statusType).toBe('error');
        const err = GL.buildGeocodePairErrorOutcomePlan('timeout');
        expect(err.ok).toBe(false);
        expect(err.statusMessage).toContain('timeout');
    });

    test('buildGeocodeAddressLookupPlan resolves coordinates and cache hits', () => {
        const coords = GL.buildGeocodeAddressLookupPlan({ address: '51.5,-0.1' });
        expect(coords.action).toBe('resolve');
        expect(coords.source).toBe('coordinates');

        const cache = {};
        GL.writeGeocodeCacheEntry(cache, 'Leeds', { lat: 53.8, lon: -1.5, display_name: 'Leeds' });
        const cached = GL.buildGeocodeAddressLookupPlan({ address: 'Leeds', cache });
        expect(cached.action).toBe('resolve');
        expect(cached.source).toBe('cache');
    });

    test('buildGeocodeAddressLookupPlan falls through to nominatim fetch', () => {
        const plan = GL.buildGeocodeAddressLookupPlan({
            address: 'Leeds UK',
            nominatimBaseUrl: 'https://nominatim.example/search',
        });
        expect(plan.action).toBe('nominatim_fetch');
        expect(plan.url).toContain('Leeds');
    });

    test('buildGeocodeAddressFetchSuccessPlan wraps geocoded result for cache write', () => {
        const success = GL.buildGeocodeAddressFetchSuccessPlan(
            { lat: 53.8, lon: -1.5, display_name: 'Leeds' },
            'Leeds'
        );
        expect(success.ok).toBe(true);
        expect(success.result.cached).toBe(false);
        expect(success.cacheKey).toBe('Leeds');
    });

    test('buildGeocodeNominatimFetchRequestPlan includes user agent header', () => {
        const plan = GL.buildGeocodeNominatimFetchRequestPlan({
            url: 'https://nominatim.example/search?q=Leeds',
            trimmed: 'Leeds',
        });
        expect(plan.url).toContain('Leeds');
        expect(plan.headers['User-Agent']).toBe('Voyagr-PWA/1.0');
        expect(plan.trimmed).toBe('Leeds');
    });

    test('buildGeocodeNominatimResponsePlan handles api errors and success', () => {
        const fail = GL.buildGeocodeNominatimResponsePlan(
            { ok: false, reason: 'api_error', message: 'rate limit' },
            'Leeds'
        );
        expect(fail.branch).toBe('api_error');
        expect(fail.errorMessage).toBe('rate limit');

        const empty = GL.buildGeocodeNominatimResponsePlan({ ok: false, reason: 'empty' }, 'Leeds');
        expect(empty.branch).toBe('empty_results');

        const ok = GL.buildGeocodeNominatimResponsePlan(
            { ok: true, geocoded: { lat: 53.8, lon: -1.5, display_name: 'Leeds' } },
            'Leeds'
        );
        expect(ok.ok).toBe(true);
        expect(ok.success.result.display_name).toBe('Leeds');
    });

    test('buildGeocodeHttpErrorPlan formats status code', () => {
        expect(GL.buildGeocodeHttpErrorPlan(429).errorMessage).toBe('API error: 429');
    });

    test('buildGeocodePlusCodeLookupPlan resolves valid decoded plus codes', () => {
        const resolved = GL.buildGeocodePlusCodeLookupPlan({
            plusCodesEnabled: true,
            hasPlusCodeService: true,
            trimmed: 'CODE',
            isValidCode: true,
            decoded: { lat: 51.5, lon: -0.1 },
        });
        expect(resolved.action).toBe('resolve');
        expect(resolved.result.lat).toBe(51.5);
        expect(resolved.source).toBe('plus_code');

        expect(GL.buildGeocodePlusCodeLookupPlan({
            plusCodesEnabled: false,
            hasPlusCodeService: true,
            trimmed: 'CODE',
            isValidCode: true,
            decoded: { lat: 1, lon: 2 },
        }).action).toBe('skip');
    });
});
