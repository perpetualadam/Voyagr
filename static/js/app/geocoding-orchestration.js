/**
 * @file Geocoding cache, autocomplete, and location resolution orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var geocodingCache = {};
    var GEOCODING_CACHE_KEY = 'voyagr_geocoding_cache';
    var NOMINATIM_API = '/api/geocode';
    var autocompleteTimeout = null;
    var autocompleteCache = {};
    var mapPickerMode = null;
    var isGeocoding = false;

    function getMapPickerMode() { return mapPickerMode; }
    function setMapPickerMode(val) { mapPickerMode = val; }
    function getIsGeocoding() { return isGeocoding; }
    function setIsGeocoding(val) { isGeocoding = !!val; }

    function rt() {
        if (!runtime) {
            throw new Error('[Geocoding] Orchestration runtime not bound');
        }
        return runtime;
    }

    function htmlModule() { return rt().html(); }

    function escapeHtml(s) {
        return htmlModule().escapeHtml(s);
    }

    function GL() { return rt().geocodingLocations(); }
    function SA() { return rt().searchAutocomplete(); }

    function initGeocodeCache() {
    try {
        const cached = localStorage.getItem(GEOCODING_CACHE_KEY);
        if (cached) {
            geocodingCache = JSON.parse(cached);
            console.log('[Geocoding] Cache loaded with', Object.keys(geocodingCache).length, 'entries');
        }
    } catch (e) {
        console.log('[Geocoding] Cache load error:', e);
        geocodingCache = {};
    }
}

/**
 * saveGeocodeCache function
 * @function saveGeocodeCache
 * @returns {*} Return value description
 */
function saveGeocodeCache() {
    try {
        localStorage.setItem(GEOCODING_CACHE_KEY, JSON.stringify(geocodingCache));
    } catch (e) {
        console.log('[Geocoding] Cache save error:', e);
    }
    }

    function getAutocompleteDropdown(fieldId) {
    const mapping = {
        'start': 'autocompleteStart',
        'end': 'autocompleteEnd',
        'viaPointAddress': 'autocompleteViaPoint',
        'stopAddress': 'autocompleteStop'
    };
    return document.getElementById(mapping[fieldId] || `autocomplete_${fieldId}`);
}

async function showAutocomplete(fieldId) {
    const mod = SA();
    const input = document.getElementById(fieldId);
    const dropdown = getAutocompleteDropdown(fieldId);
    if (!input || !dropdown) return;

    // Live GPS owns the start field; don't run search or wipe dataset coords on focus/input.
    if (fieldId === 'start' && rt().getAutoGpsEnabled()) {
        dropdown.classList.remove('show');
        return;
    }

    const query = input.value.trim();

    if (input.dataset.lat || input.dataset.lon) {
        console.log(`[Autocomplete] Clearing stored coordinates for ${fieldId} - user is typing`);
        delete input.dataset.lat;
        delete input.dataset.lon;
        delete input.dataset.displayName;
    }

    if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
    }

    if (!query || query.length < 2) {
        // Start and Destination both offer "pick a previous location" when empty. (The Start
        // field only reaches here when auto-GPS is off — the guard above hands the field to
        // live GPS otherwise.)
        if (fieldId === 'end' || fieldId === 'start') {
            const histEl = document.getElementById('searchHistoryDropdown');
            if (histEl) {
                histEl.classList.remove('show');
                histEl.innerHTML = '';
            }
            dropdown.innerHTML = mod.buildAutocompleteLoadingHtml(mod.AUTOCOMPLETE_LOADING_RECENT_TEXT);
            dropdown.classList.add('show');
            renderEndDestinationSuggestions(dropdown, fieldId).catch((err) => {
                console.error('[Recent locations]', err);
                dropdown.innerHTML = mod.buildAutocompleteNoResultsHtml(mod.AUTOCOMPLETE_RECENT_LOAD_ERROR_MESSAGE);
            });
            return;
        }
        dropdown.classList.remove('show');
        return;
    }

    dropdown.innerHTML = mod.buildAutocompleteLoadingHtml(mod.AUTOCOMPLETE_SEARCHING_TEXT);
    dropdown.classList.add('show');

    autocompleteTimeout = setTimeout(async () => {
        try {
            if (autocompleteCache[query]) {
                displayAutocompleteResults(fieldId, autocompleteCache[query]);
                return;
            }

            const response = await fetch(
                `${NOMINATIM_API}?q=${encodeURIComponent(query)}&limit=8`,
                {
                    headers: {
                        'User-Agent': 'Voyagr-PWA/1.0'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const results = await response.json();

            autocompleteCache[query] = results;

            displayAutocompleteResults(fieldId, results);
        } catch (error) {
            console.error('[Autocomplete] Error:', error);
            dropdown.innerHTML = mod.buildAutocompleteNoResultsHtml(mod.AUTOCOMPLETE_SEARCH_FAILED_MESSAGE);
        }
    }, 300); // 300ms debounce
}
/**
 * displayAutocompleteResults function
 * @function displayAutocompleteResults
 * @param {*} fieldId - Parameter description
 * @param {*} results - Parameter description
 * @returns {*} Return value description
 */
function displayAutocompleteResults(fieldId, results) {
    const mod = SA();
    const dropdown = getAutocompleteDropdown(fieldId);
    if (!dropdown) return;

    if (!results || results.length === 0) {
        dropdown.innerHTML = mod.buildAutocompleteNoResultsHtml('No results found');
        return;
    }

    dropdown.innerHTML = '';

    results.forEach((result) => {
        const icon = mod.getLocationIcon(result);
        const name = mod.resolveGeocodeResultDisplayName(result);
        const shortAddress = mod.resolveGeocodeResultShortAddress(result);
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = mod.buildGeocodeAutocompleteItemHtml(icon, name, shortAddress);
        item.onclick = () => selectAutocompleteResult(fieldId, lat, lon, name);

        dropdown.appendChild(item);
    });
}
/**
 * selectAutocompleteResult function
 * @function selectAutocompleteResult
 * @param {*} fieldId - Parameter description
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} name - Parameter description
 * @returns {*} Return value description
 */
function selectAutocompleteResult(fieldId, lat, lon, name) {
    const input = document.getElementById(fieldId);
    const dropdown = getAutocompleteDropdown(fieldId);

    if (fieldId === 'viaPointAddress') {
        rt().call.addViaPoint(lat, lon, name);
        if (input) input.value = '';
        if (dropdown) dropdown.classList.remove('show');
        return;
    }
    if (fieldId === 'stopAddress') {
        rt().call.addStop(lat, lon, name);
        if (input) input.value = '';
        if (dropdown) dropdown.classList.remove('show');
        return;
    }

    input.value = name;
    input.dataset.lat = lat;
    input.dataset.lon = lon;
    input.dataset.displayName = name;

    if (dropdown) dropdown.classList.remove('show');

    // Save the chosen place for either endpoint so it can be re-picked from the recent
    // locations list in the Start or Destination field next time.
    if (fieldId === 'end' || fieldId === 'start') {
        rt().call.recordRecentDestination(name, lat, lon, 'search');
    }

    rt().call.showStatus(`✅ Selected: ${name}`, 'success');

    console.log(`[Autocomplete] Selected ${fieldId}: ${name} (${lat}, ${lon})`);
}

function collectGeocodePlusCodeDecodeState(trimmed) {
    const gl = GL();
    const runtime = gl.buildGeocodePlusCodeRuntimePlan({
        plusCodesEnabledStorage: localStorage.getItem('googlePlusCodesEnabled'),
        hasPlusCodeService: typeof GooglePlusCodesService !== 'undefined',
    });
    const state = {
        plusCodesEnabled: runtime.plusCodesEnabled,
        hasPlusCodeService: runtime.hasPlusCodeService,
        trimmed,
        isValidCode: false,
        decoded: null,
        errorMessage: null,
    };

    if (runtime.plusCodesEnabled && runtime.hasPlusCodeService) {
        try {
            const service = new GooglePlusCodesService();
            if (service.isValidCode(trimmed)) {
                state.isValidCode = true;
                state.decoded = service.decode(trimmed);
            }
        } catch (error) {
            state.errorMessage = error.message;
            console.log('[Geocoding] Plus Code decode error:', error.message);
        }
    }

    return gl.buildGeocodePlusCodeDecodeStatePlan(state);
}

async function geocodeAddress(address) {
    const gl = GL();
    let lookup = gl.buildGeocodeAddressLookupPlan({
        address,
        cache: geocodingCache,
        nominatimBaseUrl: NOMINATIM_API,
        limit: 8,
    });
    let orch = gl.buildGeocodeAddressOrchestrationPlan(lookup);

    if (orch.branch === 'empty') {
        return null;
    }

    if (orch.branch === 'resolve') {
        const resolve = gl.buildGeocodeAddressResolveExecutePlan(orch);
        console.log(resolve.resolveLogPrefix, resolve.trimmed);
        return resolve.result;
    }

    const trimmedAddress = orch.trimmed;
    const plusPlan = gl.buildGeocodePlusCodeLookupPlan(
        collectGeocodePlusCodeDecodeState(trimmedAddress)
    );
    if (plusPlan.action === 'resolve') {
        const plusLog = gl.buildGeocodePlusCodeResolveLogPlan(trimmedAddress);
        console.log(plusLog.detectLogMessage, trimmedAddress);
        console.log(plusLog.decodeLogPrefix, plusPlan.result.lat, plusPlan.result.lon);
        return plusPlan.result;
    }

    lookup = gl.buildGeocodeAddressLookupPlan({
        address: trimmedAddress,
        cache: geocodingCache,
        nominatimBaseUrl: NOMINATIM_API,
        limit: 8,
    });
    orch = gl.buildGeocodeAddressOrchestrationPlan(lookup);
    if (orch.branch === 'resolve') {
        const resolve = gl.buildGeocodeAddressResolveExecutePlan(orch);
        console.log('[Geocoding] Cache hit for:', resolve.trimmed);
        return resolve.result;
    }

    try {
        const fetchPlan = gl.buildGeocodeNominatimFetchRequestPlan(lookup);
        console.log('[Geocoding] Fetching:', fetchPlan.trimmed);
        const response = await fetch(fetchPlan.url, {
            headers: fetchPlan.headers,
        });

        if (!response.ok) {
            const httpErr = gl.buildGeocodeHttpErrorPlan(response.status);
            throw new Error(httpErr.errorMessage);
        }

        const outcome = gl.buildGeocodeNominatimResponsePlan(
            gl.parseNominatimFetchPayload(await response.json()),
            fetchPlan.trimmed
        );
        if (!outcome.ok) {
            if (outcome.branch === 'api_error') {
                throw new Error(outcome.errorMessage);
            }
            const empty = gl.buildGeocodeNominatimEmptyExecutePlan(outcome);
            console.log(empty.emptyLogPrefix, empty.trimmed);
            return null;
        }

        const success = gl.buildGeocodeNominatimSuccessExecutePlan(outcome, fetchPlan);
        geocodingCache = gl.writeGeocodeCacheEntry(geocodingCache, success.cacheKey, success.cacheEntry);
        saveGeocodeCache();

        console.log(success.successLogPrefix, success.trimmed, '→', success.result.lat, success.result.lon);
        return success.result;
    } catch (error) {
        const fetchErr = gl.buildGeocodeAddressFetchErrorExecutePlan(error.message);
        console.log(fetchErr.errorLogPrefix, fetchErr.errorMessage);
        return null;
    }
}

async function resolveGeocodeEndpoint(GL, endpointPlan, which, fallbackAddress) {
    const gl = GL();
    const resolvePlan = gl.buildGeocodeEndpointResolveExecutePlan(which, endpointPlan);
    if (resolvePlan.useStored) {
        console.log(resolvePlan.storedLogPrefix, resolvePlan.storedResult);
        return { ok: true, result: resolvePlan.storedResult };
    }

    const result = await geocodeAddress(resolvePlan.fetchAddress);
    if (!result) {
        return {
            ok: false,
            failure: gl.buildGeocodeEndpointFailurePlan(which, fallbackAddress),
        };
    }
    return { ok: true, result };
}

async function geocodeLocations(startAddress, endAddress) {
    const gl = GL();
    const orch = gl.buildGeocodeLocationsOrchestrationPlan();
    if (orch.setGeocodingFlag) setIsGeocoding(true);

    const startInput = document.getElementById(orch.startInputId);
    const endInput = document.getElementById(orch.endInputId);
    const pairPlans = gl.buildGeocodeLocationsInputPlan({
        startStored: gl.readStoredLocationFromDataset(startInput?.dataset, startAddress),
        startAddress,
        endStored: gl.readStoredLocationFromDataset(endInput?.dataset, endAddress),
        endAddress,
    });
    rt().call.showStatus(pairPlans.loadingStatusMessage, 'loading');

    try {
        const startResolved = await resolveGeocodeEndpoint(GL, pairPlans.startPlan, 'start', startAddress);
        if (!startResolved.ok) {
            return applyGeocodeEndpointFailureFromPlan(
                gl.buildGeocodeEndpointFailureApplyPlan(
                    gl.buildGeocodeEndpointFailureExecutePlan(startResolved.failure)
                )
            );
        }

        const endResolved = await resolveGeocodeEndpoint(GL, pairPlans.endPlan, 'end', endAddress);
        if (!endResolved.ok) {
            return applyGeocodeEndpointFailureFromPlan(
                gl.buildGeocodeEndpointFailureApplyPlan(
                    gl.buildGeocodeEndpointFailureExecutePlan(endResolved.failure)
                )
            );
        }

        return applyGeocodePairOutcomeFromPlan(
            gl.buildGeocodePairOutcomeApplyPlan(
                gl.buildGeocodePairOutcomeExecutePlan(
                    gl.buildGeocodePairSuccessOutcomePlan(startResolved.result, endResolved.result)
                )
            )
        );
    } catch (error) {
        const execute = gl.buildGeocodePairOutcomeExecutePlan(
            gl.buildGeocodePairErrorOutcomePlan(error.message)
        );
        if (execute.errorLogPrefix) console.log(execute.errorLogPrefix, error);
        return applyGeocodePairOutcomeFromPlan(
            gl.buildGeocodePairOutcomeApplyPlan(execute)
        );
    }
}

function applyGeocodeEndpointFailureFromPlan(apply) {
    if (!apply || !apply.shouldApply) return null;
    rt().call.showStatus(apply.statusMessage, apply.statusType);
    if (apply.clearGeocodingFlag) setIsGeocoding(false);
    return apply.returnValue;
}

function applyGeocodePairOutcomeFromPlan(apply) {
    if (!apply || !apply.shouldApply) return null;
    rt().call.showStatus(apply.statusMessage, apply.statusType);
    if (apply.clearGeocodingFlag) setIsGeocoding(false);
    return apply.returnValue;
}

    function pickLocationFromMap(field) {
        const execute = GL().buildPickLocationFromMapExecutePlan(field);
        if (!execute.shouldPick) return;

        setMapPickerMode(execute.mapPickerMode);
        if (execute.collapseBottomSheet) rt().call.collapseBottomSheet();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    async function renderEndDestinationSuggestions(dropdown, fieldId = 'end') {
    if (!dropdown) return;

    const mod = SA();
    const recent = rt().call.loadRecentDestinations();
    dropdown.innerHTML = '';

    const appendSectionTitle = (text) => {
        dropdown.insertAdjacentHTML('beforeend', mod.buildAutocompleteSectionTitleHtml(text));
    };

    if (recent.length) {
        appendSectionTitle('Recent locations');
        recent.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = mod.buildRecentDestinationItemHtml(item, { escapeHtml: rt().call.escapeHtml });
            div.onclick = () => selectAutocompleteResult(fieldId, item.lat, item.lon, item.label);
            dropdown.appendChild(div);
        });
    }

    let serverCount = 0;
    try {
        const { res, data } = await rt().call.fetchJsonWithAuth('/api/search-history');
        if (res.status !== 401 && data.success && data.history && data.history.length > 0) {
            appendSectionTitle('Saved searches');
            data.history.forEach((item) => {
                const built = mod.buildServerSearchHistoryItemHtml(item, { escapeHtml: rt().call.escapeHtml });
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = built.html;
                if (built.hasCoords) {
                    div.onclick = () => selectAutocompleteResult(fieldId, built.lat, built.lon, item.result_name || item.query);
                } else {
                    div.onclick = () => {
                        const fieldInput = document.getElementById(fieldId);
                        if (fieldInput) fieldInput.value = item.query || '';
                        dropdown.classList.remove('show');
                    };
                }
                dropdown.appendChild(div);
                serverCount++;
            });
        }
    } catch (e) {
        console.error('[Search history]', e);
    }

    if (!recent.length && serverCount === 0) {
        dropdown.innerHTML = mod.buildAutocompleteNoResultsHtml();
    }
    dropdown.classList.add('show');
}

function showSearchHistory() {
    const dropdown = getAutocompleteDropdown('end');
    if (!dropdown) return;
    renderEndDestinationSuggestions(dropdown).catch((e) => console.error('Error loading search history:', e));
}
    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        escapeHtml: escapeHtml,
        initGeocodeCache: initGeocodeCache,
        saveGeocodeCache: saveGeocodeCache,
        showAutocomplete: showAutocomplete,
        displayAutocompleteResults: displayAutocompleteResults,
        selectAutocompleteResult: selectAutocompleteResult,
        geocodeAddress: geocodeAddress,
        geocodeLocations: geocodeLocations,
        pickLocationFromMap: pickLocationFromMap,
        renderEndDestinationSuggestions: renderEndDestinationSuggestions,
        showSearchHistory: showSearchHistory,
        getAutocompleteDropdown: getAutocompleteDropdown,
        getMapPickerMode: getMapPickerMode,
        setMapPickerMode: setMapPickerMode,
        getIsGeocoding: getIsGeocoding,
        setIsGeocoding: setIsGeocoding,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGeocodingOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
