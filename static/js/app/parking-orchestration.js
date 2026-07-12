/**
 * @file Parking search, selection, and preference orchestration (DOM + network).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var parkingMarkers = [];
    var selectedParking = null;
    var parkingWalkingRoute = null;
    var parkingDrivingRoute = null;

    function rt() {
        if (!runtime) {
            throw new Error('[Parking] Orchestration runtime not bound');
        }
        return runtime;
    }

    function MP() {
        return rt().multimodalParking();
    }

    function collectParkingPreferencesDomInput() {
        return {
            maxWalkingDistance: document.getElementById('parkingMaxWalkingDistance')?.value,
            preferredType: document.getElementById('parkingPreferredType')?.value,
            pricePreference: document.getElementById('parkingPricePreference')?.value,
        };
    }

    function collectParkingPreferencesFormState() {
        const module = MP();
        return module.buildParkingPreferencesCollectPlan(
            module.buildCollectParkingPreferencesInputPlan(collectParkingPreferencesDomInput())
        );
    }

    function applySaveParkingPreferencesFromPlan(execute) {
        if (!execute || !execute.shouldSave) return;

        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.saveAllSettings) rt().saveAllSettings();
        console.log(execute.logMessage, execute.prefs);
    }

    function saveParkingPreferences() {
        const module = MP();
        applySaveParkingPreferencesFromPlan(
            module.buildSaveParkingPreferencesEntryOrchestrationPlan(
                module.buildCollectParkingPreferencesInputPlan(collectParkingPreferencesDomInput())
            ).execute
        );
    }

    function applyLoadParkingPreferencesFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;

        rt().applyDomSelectsFromPlan(execute.domPlan.selects);
        console.log(execute.logMessage, execute.prefs);
    }

    function loadParkingPreferences() {
        const module = MP();
        const entry = module.buildLoadParkingPreferencesEntryOrchestrationPlan();
        try {
            const saved = localStorage.getItem(entry.orch.storageKey);
            if (!saved) return;

            applyLoadParkingPreferencesFromPlan(
                module.buildLoadParkingPreferencesResponseEntryOrchestrationPlan(JSON.parse(saved)).execute
            );
        } catch (e) {
            console.log(entry.orch.errorLogPrefix, e);
        }
    }

    function collectResolveParkingDestinationInput(lastRoute, endInput) {
        const module = MP();
        const idx = module.buildResolveParkingDestinationSelectedRouteIndexPlan(
            rt().getRouteOptionsLength(),
            rt().getSelectedRouteIndex()
        );
        const endEl = document.getElementById('end');
        let endElementCoords = null;
        if (endEl && endEl.dataset.lat && endEl.dataset.lon) {
            const lat = parseFloat(endEl.dataset.lat);
            const lon = parseFloat(endEl.dataset.lon);
            if (!isNaN(lat) && !isNaN(lon)) {
                endElementCoords = { lat, lon };
            }
        }

        return module.buildCollectResolveParkingDestinationInputPlan({
            lastRoute: lastRoute || {},
            selectedRouteOption: rt().getRouteOptionAt(idx),
            endElementCoords,
            endInput,
        });
    }

    async function resolveParkingDestinationCoords(lastRoute, endInput) {
        const module = MP();
        const sources = collectResolveParkingDestinationInput(lastRoute, endInput);

        let resolved = module.resolveParkingDestinationCoordsFromSources(sources, rt().decodePolyline);

        if (resolved.needsGeocode && endInput && typeof rt().geocodeLocations === 'function') {
            const geocoded = await rt().geocodeLocations('', endInput);
            resolved = module.resolveParkingDestinationCoordsFromSources(
                module.buildCollectResolveParkingDestinationInputPlan({
                    ...sources,
                    geocodedEnd: geocoded && geocoded.end,
                }),
                rt().decodePolyline
            );
        }

        return resolved.coords || null;
    }

    async function fetchParkingSearch(params) {
        const response = await fetch('/api/parking-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        return response.json();
    }

    function scrollParkingResultsIntoView() {
        const parkingSection = document.getElementById('parkingSection');
        const content = document.querySelector('.bottom-sheet-content');
        if (!parkingSection || !content) return;
        if (typeof rt().expandBottomSheet === 'function') rt().expandBottomSheet();
        requestAnimationFrame(() => {
            content.scrollTop = Math.max(0, parkingSection.offsetTop - 12);
        });
    }

    function showParkingEmptyState(message) {
        const parkingSection = document.getElementById('parkingSection');
        const parkingListDiv = document.getElementById('parkingList');
        if (!parkingSection || !parkingListDiv) return;
        parkingListDiv.innerHTML = MP().buildParkingEmptyStateHtml(message);
        parkingSection.style.display = 'block';
        scrollParkingResultsIntoView();
    }

    function collectFindParkingNearDestinationInput() {
        return {
            lastRoute: rt().getLastCalculatedRoute(),
            endInput: document.getElementById('end')?.value || '',
        };
    }

    async function findParkingNearDestination() {
        console.log('[Parking] findParkingNearDestination called');
        console.log('[Parking] lastCalculatedRoute:', rt().getLastCalculatedRoute());

        const module = MP();
        const input = collectFindParkingNearDestinationInput();
        const entry = module.buildFindParkingNearDestinationEntryOrchestrationPlan(
            input.lastRoute,
            input.endInput
        );
        if (!entry.preflight.ok) {
            console.error('[Parking]', entry.preflight.errorStatusMessage);
            rt().showStatus(entry.preflight.errorStatusMessage, entry.preflight.errorStatusType);
            return;
        }

        rt().showStatus(entry.preflight.loadingStatusMessage, entry.preflight.loadingStatusType);

        try {
            const endCoords = await resolveParkingDestinationCoords(input.lastRoute, input.endInput);
            console.log('[Parking] End coordinates:', endCoords);

            if (!endCoords || isNaN(endCoords.lat) || isNaN(endCoords.lon)) {
                console.error('[Parking] Could not determine destination coordinates');
                rt().showStatus('Could not determine destination coordinates', 'error');
                return;
            }

            const parkingPrefs = collectParkingPreferencesFormState();
            const searchPlan = module.buildParkingSearchDispatchPlan({
                lat: endCoords.lat,
                lon: endCoords.lon,
                maxWalkingDist: parseInt(parkingPrefs.maxWalkingDistance, 10),
                parkingType: parkingPrefs.preferredType,
                pricePref: parkingPrefs.pricePreference,
            });

            let searchParams = searchPlan.initialSearch;
            console.log('[Parking] Search parameters:', searchParams);
            let data = await fetchParkingSearch(searchParams);
            console.log('[Parking] Response data:', data);

            if (!data.success) {
                rt().showStatus('Parking search failed: ' + (data.error || 'Unknown error'), 'error');
                return;
            }

            if (!data.parking || data.parking.length === 0) {
                const widen = searchPlan.widenSearchWhenEmpty;
                if (widen.enabled) {
                    rt().showStatus(widen.statusMessage, 'info');
                    searchParams = widen.params;
                    data = await fetchParkingSearch(searchParams);
                }
            }

            if (!data.parking || data.parking.length === 0) {
                showParkingEmptyState(searchPlan.emptyStateMessage);
                rt().showStatus(searchPlan.noResultsStatusMessage, 'warning');
                return;
            }

            console.log('[Parking] Found', data.parking.length, 'parking options');
            displayParkingOptions(data.parking, endCoords);
            rt().showStatus(`✅ Found ${data.parking.length} parking options — scroll down to choose`, 'success');
            scrollParkingResultsIntoView();

            if (data.parking && data.parking.length > 0) {
                fitMapToParkingResults(data.parking, endCoords);
            }
        } catch (error) {
            console.error('[Parking] Error:', error);
            rt().showStatus('Error searching for parking: ' + error.message, 'error');
        }
    }

    function fitMapToParkingResults(parkingList, destinationCoords) {
        const map = rt().getMap();
        if (!map || !parkingList || parkingList.length === 0) return;
        try {
            const coords = parkingList.slice(0, 5).map((p) => [p.lat, p.lon]);
            if (destinationCoords) coords.push([destinationCoords.lat, destinationCoords.lon]);
            if (typeof MapLibreHelpers !== 'undefined' && MapLibreHelpers.fitMapBounds) {
                MapLibreHelpers.fitMapBounds(map, coords, { padding: 60, maxZoom: 16 });
            }
        } catch (e) {
            console.warn('[Parking] fitMapToParkingResults:', e);
        }
    }

    function displayParkingOptions(parkingList, destinationCoords) {
        console.log('[Parking] displayParkingOptions called with', parkingList.length, 'parking options');

        parkingMarkers.forEach((marker) => {
            if (marker && typeof marker.remove === 'function') marker.remove();
        });
        parkingMarkers = [];

        const parkingSection = document.getElementById('parkingSection');
        const parkingListDiv = document.getElementById('parkingList');
        const map = rt().getMap();

        if (!parkingSection || !parkingListDiv) {
            console.error('[Parking] parkingSection or parkingListDiv not found!');
            return;
        }

        parkingListDiv.innerHTML = '';

        const parkingModule = MP();
        const topParkingOptions = parkingModule.getParkingOptionsDisplaySlice(parkingList);
        console.log('[Parking] Displaying top', topParkingOptions.length, 'parking options');

        topParkingOptions.forEach((parking, index) => {
            const parkingDisplayDist = rt().convertDistance(parking.distance_m / 1000);
            const parkingDistUnit = rt().getDistanceUnit();
            const cardOpts = {
                distanceText: parkingDisplayDist,
                distUnit: parkingDistUnit,
            };

            try {
                const marker = MapLibreHelpers.createMarker(parking.lat, parking.lon, {
                    html: parkingModule.buildParkingMapMarkerHtml(),
                    iconSize: [32, 32],
                    className: 'parking-marker',
                    popup: parkingModule.buildParkingMapMarkerPopupHtml(
                        parking.name,
                        parkingDisplayDist,
                        parkingDistUnit
                    ),
                }).addTo(map);

                marker.parkingData = parking;
                marker.on('click', () => selectParking(parking, destinationCoords));
                parkingMarkers.push(marker);
            } catch (markerErr) {
                console.warn('[Parking] Marker error:', markerErr);
            }

            const plan = parkingModule.buildParkingOptionItemMountPlan(parking, index, cardOpts);
            const item = document.createElement('div');
            item.style.cssText = plan.containerStyle;
            item.innerHTML = plan.html;

            item.querySelector('.parking-show-route-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectParking(parking, destinationCoords);
            });
            item.querySelector('.parking-set-dest-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                setParkingAsDestination(parking);
            });
            item.addEventListener('click', () => selectParking(parking, destinationCoords));

            item.onmouseover = () => { item.style.background = plan.hoverBackground; };
            item.onmouseout = () => { item.style.background = plan.restBackground; };

            parkingListDiv.appendChild(item);
        });

        parkingSection.style.display = 'block';
        console.log('[Parking] Parking section displayed with', topParkingOptions.length, 'options');
    }

    async function selectParking(parking, destinationCoords) {
        const module = MP();
        const RR = rt().routingRequest();
        selectedParking = parking;
        rt().showStatus(module.getParkingSelectLoadingMessage(), 'loading');

        try {
            const startCoords = module.resolveParkingStartCoordsFromRoute(rt().getLastCalculatedRoute());
            if (!startCoords) {
                rt().showStatus(module.getParkingSelectNoStartMessage(), 'error');
                return;
            }

            const legPrefs = RR.readMultimodalLegAvoidancePrefs(localStorage);
            const drivingExtras = RR.readMultimodalDrivingLegStoragePrefs(localStorage, rt().isAvoidTollsEnabled());
            const drivingBody = RR.buildMultimodalDrivingLegBody({
                startLat: startCoords.lat,
                startLon: startCoords.lon,
                endLat: parking.lat,
                endLon: parking.lon,
                vehicleType: rt().getCurrentVehicleType(),
                costParams: rt().getRouteCostParams(rt().getCurrentVehicleType()),
                includeTolls: drivingExtras.includeTolls,
                avoidTolls: drivingExtras.avoidTolls,
                avoidCaz: drivingExtras.avoidCaz,
                enableHazardAvoidance: legPrefs.enableHazardAvoidance,
                avoidCameras: legPrefs.avoidCameras,
                avoidTrafficLights: legPrefs.avoidTrafficLights,
                avoidRailwayCrossings: legPrefs.avoidRailwayCrossings,
            });

            const drivingResponse = await fetch('/api/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(drivingBody),
            });

            const drivingData = await drivingResponse.json();
            if (!drivingData.success) {
                rt().showStatus(module.getParkingSelectLegErrorMessage('driving'), 'error');
                return;
            }

            const walkingBody = RR.buildMultimodalWalkingLegBody({
                startLat: parking.lat,
                startLon: parking.lon,
                endLat: destinationCoords.lat,
                endLon: destinationCoords.lon,
                enableHazardAvoidance: legPrefs.enableHazardAvoidance,
                avoidCameras: legPrefs.avoidCameras,
                avoidTrafficLights: legPrefs.avoidTrafficLights,
                avoidRailwayCrossings: legPrefs.avoidRailwayCrossings,
            });

            const walkingResponse = await fetch('/api/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(walkingBody),
            });

            const walkingData = await walkingResponse.json();
            if (!walkingData.success) {
                rt().showStatus(module.getParkingSelectLegErrorMessage('walking'), 'error');
                return;
            }

            displayParkingRoutes(drivingData, walkingData, parking, destinationCoords);
            updateParkingPreview(drivingData, walkingData, parking);
            rt().showStatus(module.getParkingSelectSuccessMessage(), 'success');
        } catch (error) {
            console.error('[Parking] Error selecting parking:', error);
            rt().showStatus('Error: ' + error.message, 'error');
        }
    }

    function displayParkingRoutes(drivingData, walkingData, parking, destination) {
        console.log('[Parking] displayParkingRoutes called');
        console.log('[Parking] drivingData:', drivingData);
        console.log('[Parking] walkingData:', walkingData);

        const parkingModule = MP();
        const map = rt().getMap();

        if (parkingDrivingRoute && typeof parkingDrivingRoute.remove === 'function') parkingDrivingRoute.remove();
        if (parkingWalkingRoute && typeof parkingWalkingRoute.remove === 'function') parkingWalkingRoute.remove();

        if (drivingData && drivingData.geometry) {
            console.log('[Parking] Decoding driving route geometry');
            const drivingCoords = rt().decodePolyline(drivingData.geometry, 5);
            console.log('[Parking] Driving route has', drivingCoords.length, 'points');
            parkingDrivingRoute = MapLibreHelpers.addPolyline(map, drivingCoords, parkingModule.PARKING_DRIVING_ROUTE_POLYLINE);
        }

        if (walkingData && walkingData.geometry) {
            console.log('[Parking] Decoding walking route geometry');
            const walkingCoords = rt().decodePolyline(walkingData.geometry, 5);
            console.log('[Parking] Walking route has', walkingCoords.length, 'points');
            parkingWalkingRoute = MapLibreHelpers.addPolyline(map, walkingCoords, parkingModule.PARKING_WALKING_ROUTE_POLYLINE);
        }

        const allCoords = [];
        if (drivingData && drivingData.geometry) {
            allCoords.push(...rt().decodePolyline(drivingData.geometry, 5));
        }
        if (walkingData && walkingData.geometry) {
            allCoords.push(...rt().decodePolyline(walkingData.geometry, 5));
        }
        if (allCoords.length > 0) {
            console.log('[Parking] Fitting map to', allCoords.length, 'total points');
            MapLibreHelpers.fitMapBounds(map, allCoords, { padding: 50 });
        }
    }

    function updateParkingPreview(drivingData, walkingData, parking) {
        const totals = MP().computeMultimodalLegTotals(drivingData, walkingData);
        const distUnit = rt().getDistanceUnit();
        const convertedDist = rt().convertDistance(totals.totalDistKm);
        const startLabel = document.getElementById('start').value;
        const endLabel = document.getElementById('end').value;
        const routeLabel = MP().buildParkingRouteLabel(startLabel, parking.name, endLabel);
        const breakdown = MP().buildParkingBreakdownHtml({
            drivingDistDisplay: rt().convertDistance(totals.drivingDistKm),
            drivingTimeMin: totals.drivingTimeMin,
            walkingDistDisplay: rt().convertDistance(totals.walkingDistKm),
            walkingTimeMin: totals.walkingTimeMin,
            distUnit: distUnit,
        });

        document.getElementById('previewDistance').textContent = convertedDist + ' ' + distUnit;
        document.getElementById('previewDuration').textContent = Math.round(totals.totalTimeMin) + ' min';
        document.getElementById('previewRoute').innerHTML = MP().buildParkingPreviewRouteHtml(routeLabel, breakdown);
    }

    function clearParkingSelection() {
        selectedParking = null;
        if (parkingDrivingRoute && typeof parkingDrivingRoute.remove === 'function') parkingDrivingRoute.remove();
        if (parkingWalkingRoute && typeof parkingWalkingRoute.remove === 'function') parkingWalkingRoute.remove();
        parkingMarkers.forEach((marker) => {
            if (marker && typeof marker.remove === 'function') marker.remove();
        });
        parkingMarkers = [];

        document.getElementById('parkingSection').style.display = 'none';
        document.getElementById('parkingList').innerHTML = '';

        if (rt().getLastCalculatedRoute()) {
            rt().showRoutePreview(rt().getLastCalculatedRoute());
        }

        rt().showStatus('🗺️ Parking selection cleared', 'info');
    }

    async function setParkingAsDestination(parking) {
        console.log('[Parking] Setting parking as destination:', parking);

        try {
            const endInput = document.getElementById('end');
            if (!endInput) {
                rt().showStatus('Error: Destination input not found', 'error');
                return;
            }

            endInput.value = `${parking.name}`;
            endInput.dataset.lat = parking.lat;
            endInput.dataset.lon = parking.lon;
            endInput.dataset.displayName = parking.name;

            rt().showStatus('🅿️ Recalculating route to parking...', 'loading');
            clearParkingSelection();
            await rt().calculateRoute();
            rt().showStatus(`✅ Route calculated to ${parking.name}`, 'success');
        } catch (error) {
            console.error('[Parking] Error setting parking as destination:', error);
            rt().showStatus('Error: ' + error.message, 'error');
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind,
        collectParkingPreferencesFormState,
        saveParkingPreferences,
        loadParkingPreferences,
        resolveParkingDestinationCoords,
        findParkingNearDestination,
        displayParkingOptions,
        selectParking,
        clearParkingSelection,
        setParkingAsDestination,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrParkingOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
