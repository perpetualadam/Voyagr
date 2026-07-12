/**
 * Tests for modules/navigation/multimodal-parking.js
 */
const MP = require('../modules/navigation/multimodal-parking.js');

describe('multimodal-parking module', () => {
    test('computeMultimodalLegTotals sums driving and walking legs', () => {
        const totals = MP.computeMultimodalLegTotals(
            { distance_km: 5, duration_minutes: 12 },
            { distance_km: 0.8, duration_minutes: 10 }
        );
        expect(totals.totalDistKm).toBe(5.8);
        expect(totals.totalTimeMin).toBe(22);
        expect(totals.drivingDistKm).toBe(5);
        expect(totals.walkingTimeMin).toBe(10);
    });

    test('buildParkingRouteLabel formats start → parking → end', () => {
        expect(MP.buildParkingRouteLabel('Home', 'City Centre', 'Office'))
            .toBe('Home → 🅿️ City Centre → Office');
    });

    test('buildParkingBreakdownHtml includes both legs', () => {
        const html = MP.buildParkingBreakdownHtml({
            drivingDistDisplay: '3.10',
            drivingTimeMin: 8,
            walkingDistDisplay: '0.50',
            walkingTimeMin: 6,
            distUnit: 'mi',
        });
        expect(html).toContain('🚗 Driving');
        expect(html).toContain('3.10 mi');
        expect(html).toContain('🚶 Walking');
        expect(html).toContain('6 min');
    });

    test('computeWalkingMinutesFromMeters estimates at least one minute', () => {
        expect(MP.computeWalkingMinutesFromMeters(0)).toBe(1);
        expect(MP.computeWalkingMinutesFromMeters(420)).toBe(5);
    });

    test('buildParkingOptionItemHtml includes distance and action buttons', () => {
        const html = MP.buildParkingOptionItemHtml(
            { name: 'City Car Park', distance_m: 420 },
            0,
            { distanceText: '0.26', distUnit: 'mi' }
        );
        expect(html).toContain('City Car Park');
        expect(html).toContain('parking-show-route-btn');
        expect(html).toContain('parking-set-dest-btn');
        expect(html).toContain('0.26 mi');
    });

    test('buildParkingEmptyStateHtml wraps message text', () => {
        const html = MP.buildParkingEmptyStateHtml('No parking found nearby.');
        expect(html).toContain('No parking found nearby.');
        expect(html).toContain('font-size:13px');
    });

    test('buildParkingPreviewRouteHtml concatenates label and breakdown', () => {
        const html = MP.buildParkingPreviewRouteHtml('A → B', '<div>walk</div>');
        expect(html).toBe('A → B<div>walk</div>');
    });

    test('buildParkingMapMarkerHtml and popup include parking icon and distance', () => {
        expect(MP.buildParkingMapMarkerHtml()).toContain('🅿️');
        expect(MP.buildParkingMapMarkerPopupHtml('City Park', '0.3', 'mi')).toContain('City Park');
        expect(MP.buildParkingMapMarkerPopupHtml('City Park', '0.3', 'mi')).toContain('0.3 mi');
    });

    test('getParkingOptionItemContainerStyleCssText styles list row container', () => {
        expect(MP.getParkingOptionItemContainerStyleCssText()).toContain('border-radius: 6px');
        expect(MP.getParkingOptionItemContainerStyleCssText()).toContain('cursor: pointer');
        expect(MP.PARKING_OPTION_ITEM_HOVER_BACKGROUND).toBe('#FFF3E0');
    });

    test('parking route polyline style presets', () => {
        expect(MP.PARKING_DRIVING_ROUTE_POLYLINE.color).toBe('#2196F3');
        expect(MP.PARKING_WALKING_ROUTE_POLYLINE.color).toBe('#4CAF50');
        expect(MP.PARKING_WALKING_ROUTE_POLYLINE.weight).toBe(4);
    });

    test('getParkingOptionsDisplaySlice sorts and limits options', () => {
        const slice = MP.getParkingOptionsDisplaySlice([
            { name: 'Far', distance_m: 900 },
            { name: 'Near', distance_m: 100 },
            { name: 'Mid', distance_m: 500 },
        ], 2);
        expect(slice).toHaveLength(2);
        expect(slice[0].name).toBe('Near');
        expect(slice[1].name).toBe('Mid');
    });

    test('buildParkingOptionItemMountPlan includes hover and rest backgrounds', () => {
        const plan = MP.buildParkingOptionItemMountPlan(
            { name: 'City Park', distance_m: 420 },
            0,
            { distanceText: '0.26', distUnit: 'mi' }
        );
        expect(plan.containerStyle).toContain('border-radius: 6px');
        expect(plan.html).toContain('City Park');
        expect(plan.hoverBackground).toBe('#FFF3E0');
        expect(plan.restBackground).toBe('white');
    });

    test('parking select helpers resolve start coords and status copy', () => {
        expect(MP.resolveParkingStartCoordsFromRoute({ start_lat: 51.5, start_lon: -0.1 }))
            .toEqual({ lat: 51.5, lon: -0.1 });
        expect(MP.resolveParkingStartCoordsFromRoute(null)).toBeNull();
        expect(MP.getParkingSelectLoadingMessage()).toContain('Calculating');
        expect(MP.getParkingSelectLegErrorMessage('driving')).toContain('driving');
    });

    test('parseLatLonCommaString parses coordinate strings', () => {
        expect(MP.parseLatLonCommaString('51.5,-0.12')).toEqual({ lat: 51.5, lon: -0.12 });
        expect(MP.parseLatLonCommaString('bad')).toBeNull();
    });

    test('resolveParkingDestinationCoordsFromSources prefers end_lat then route polyline', () => {
        const fromEnd = MP.resolveParkingDestinationCoordsFromSources({
            lastRoute: { end_lat: 51.6, end_lon: -0.2 },
        });
        expect(fromEnd.coords).toEqual({ lat: 51.6, lon: -0.2 });
        expect(fromEnd.source).toBe('end_lat');

        const fromPoly = MP.resolveParkingDestinationCoordsFromSources({
            lastRoute: {},
            selectedRouteOption: { polyline: [[51.5, -0.1], [51.55, -0.15]] },
        });
        expect(fromPoly.coords).toEqual({ lat: 51.55, lon: -0.15 });
        expect(fromPoly.source).toBe('route_polyline');
    });

    test('resolveParkingDestinationCoordsFromSources signals geocode when only endInput remains', () => {
        expect(MP.resolveParkingDestinationCoordsFromSources({ endInput: 'Leeds' }))
            .toEqual({ needsGeocode: true });
    });

    test('parking destination and find-parking entry orchestration plans', () => {
        expect(MP.buildResolveParkingDestinationSelectedRouteIndexPlan(3, 5)).toBe(2);
        expect(MP.buildResolveParkingDestinationSelectedRouteIndexPlan(0, 1)).toBe(0);

        const missingRoute = MP.buildFindParkingNearDestinationEntryOrchestrationPlan(null, 'Leeds');
        expect(missingRoute.preflight.ok).toBe(false);

        const ok = MP.buildFindParkingNearDestinationEntryOrchestrationPlan({}, 'Leeds');
        expect(ok.preflight.ok).toBe(true);
        expect(ok.preflight.loadingStatusMessage).toContain('Searching');
    });

    test('buildParkingSearchDispatchPlan maps walking distance to radius and widen fallback', () => {
        const plan = MP.buildParkingSearchDispatchPlan({
            lat: 51.5,
            lon: -0.1,
            maxWalkingDist: 10,
            parkingType: 'street',
            pricePref: 'cheap',
        });
        expect(plan.initialSearch.radius).toBe(10 * MP.WALKING_DISTANCE_TO_RADIUS_METERS);
        expect(plan.initialSearch.type).toBe('street');
        expect(plan.widenSearchWhenEmpty.enabled).toBe(true);
        expect(plan.widenSearchWhenEmpty.params.radius).toBe(MP.PARKING_SEARCH_MIN_RADIUS_METERS);
        expect(plan.widenSearchWhenEmpty.params.type).toBe('any');
    });

    test('buildParkingPreferencesCollectPlan applies defaults for missing values', () => {
        const prefs = MP.buildParkingPreferencesCollectPlan({ preferredType: 'garage' });
        expect(prefs.maxWalkingDistance).toBe(MP.PARKING_PREFS_DEFAULTS.maxWalkingDistance);
        expect(prefs.preferredType).toBe('garage');
        expect(prefs.pricePreference).toBe('any');
    });

    test('buildParkingPreferencesDomApplyPlan maps values to select element ids', () => {
        const dom = MP.buildParkingPreferencesDomApplyPlan({
            maxWalkingDistance: '15',
            preferredType: 'street',
            pricePreference: 'cheap',
        });
        expect(dom.selects.find((item) => item.id === 'parkingMaxWalkingDistance').value).toBe('15');
        expect(dom.selects.find((item) => item.id === 'parkingPreferredType').value).toBe('street');
    });

    test('buildParkingPreferencesStoragePlan writes canonical storage key', () => {
        const storage = MP.buildParkingPreferencesStoragePlan({
            maxWalkingDistance: '8',
            preferredType: 'any',
            pricePreference: 'any',
        });
        expect(storage.storageKey).toBe(MP.PARKING_PREFS_STORAGE_KEY);
        expect(JSON.parse(storage.storageValue).maxWalkingDistance).toBe('8');
    });

    test('buildSaveParkingPreferencesExecutePlan and load execute plan', () => {
        const prefs = { maxWalkingDistance: '12', preferredType: 'garage', pricePreference: 'cheap' };
        const save = MP.buildSaveParkingPreferencesExecutePlan(prefs);
        expect(save.shouldSave).toBe(true);
        expect(save.storageKey).toBe(MP.PARKING_PREFS_STORAGE_KEY);
        const load = MP.buildLoadParkingPreferencesExecutePlan(prefs);
        expect(load.shouldApply).toBe(true);
        expect(load.domPlan.selects.find((item) => item.id === 'parkingPreferredType').value).toBe('garage');
        expect(MP.buildLoadParkingPreferencesOrchestrationPlan().storageKey).toBe(MP.PARKING_PREFS_STORAGE_KEY);
    });

    test('buildSaveParkingPreferencesEntryOrchestrationPlan bundles execute plan', () => {
        const entry = MP.buildSaveParkingPreferencesEntryOrchestrationPlan({
            maxWalkingDistance: '10',
            preferredType: 'garage',
            pricePreference: 'cheap',
        });
        expect(entry.execute.shouldSave).toBe(true);
        expect(entry.prefs.preferredType).toBe('garage');
    });

    test('buildLoadParkingPreferencesResponseEntryOrchestrationPlan bundles load execute', () => {
        const entry = MP.buildLoadParkingPreferencesResponseEntryOrchestrationPlan({
            maxWalkingDistance: '5',
            preferredType: 'street',
            pricePreference: 'any',
        });
        expect(entry.execute.shouldApply).toBe(true);
        expect(entry.execute.domPlan.selects.find((item) => item.id === 'parkingPreferredType').value)
            .toBe('street');
        expect(MP.buildLoadParkingPreferencesEntryOrchestrationPlan().orch.storageKey)
            .toBe(MP.PARKING_PREFS_STORAGE_KEY);
    });
});
