/**
 * @file GPS speed widget, smoothing, and speed-limit fetch orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var _speedLimitFetchState = null;
    var _lastSpeedWidgetVisible = null;

    function rt() {
        if (!runtime) {
            throw new Error('[SpeedWidget] Orchestration runtime not bound');
        }
        return runtime;
    }

    function SG() { return rt().speedGps(); }
    function SL() { return rt().speedLimitWidget(); }

    function _getSpeedLimitFetchState() {
        const mod = SL();
        if (!_speedLimitFetchState && mod) {
            _speedLimitFetchState = mod.createFetchState();
        }
        return _speedLimitFetchState;
    }

    function smoothGpsSpeedMph(rawMph) {
        const mod = SG();
        const r = mod.stepSmoothGpsSpeedMph(
            {
                smoothedMph: rt().g('_smoothedSpeedMph'),
                initAt: rt().g('_smoothedSpeedInitAt'),
            },
            rawMph,
            Date.now()
        );
        rt().s('_smoothedSpeedMph', r.state.smoothedMph);
        rt().s('_smoothedSpeedInitAt', r.state.initAt);
        return r.value;
    }

    function updateSpeedWidget(currentSpeedInMph, speedLimitInMph) {
        if (speedLimitInMph === undefined) speedLimitInMph = null;
        const widget = document.getElementById('speedWidget');
        if (!widget) return;

        rt().s('currentGpsSpeedMph', currentSpeedInMph);
        rt().s('currentGpsSpeedKmh', currentSpeedInMph * 1.609344);

        const speedGps = SG();
        const speedLimit = SL();
        const displaySpeedUnit = rt().call.getSpeedUnit();
        const gpsDisplay = speedLimit.formatSpeedForWidget(currentSpeedInMph, rt().getSpeedUnit(), speedGps);

        const speedValueEl = document.getElementById('speedValue');
        const speedUnitEl = document.getElementById('speedUnitDisplay');
        if (speedValueEl) {
            speedValueEl.textContent = String(speedLimit.sanitizeWidgetDisplayNumber(gpsDisplay.value));
        }
        if (speedUnitEl) speedUnitEl.textContent = gpsDisplay.unitLabel;

        const limitValueEl = document.getElementById('speedLimitValue');
        const limitUnitEl = document.getElementById('speedLimitUnit');
        if (limitValueEl && limitUnitEl) {
            const resolvedLimit = (speedLimitInMph !== null && speedLimitInMph > 0)
                ? speedLimitInMph
                : null;

            if (resolvedLimit !== null && resolvedLimit > 0) {
                rt().s('currentSpeedLimitMph', resolvedLimit);
                const limitDisplay = speedLimit.formatSpeedForWidget(resolvedLimit, rt().getSpeedUnit(), speedGps);
                limitValueEl.textContent = String(speedLimit.sanitizeWidgetDisplayNumber(limitDisplay.value));
                limitUnitEl.textContent = limitDisplay.unitLabel;
                widget.style.borderLeft = '4px solid #4285F4';
            } else {
                limitValueEl.textContent = '…';
                limitUnitEl.textContent = displaySpeedUnit;
                widget.style.borderLeft = '4px solid #999';
            }
        }

        updateSpeedWidgetVisibility();
    }

    function updateSpeedWidgetVisibility() {
        const widget = document.getElementById('speedWidget');
        if (!widget) return;

        const shouldShow = (rt().getIsTrackingActive() || rt().getRouteInProgress())
            && rt().g('speedWidgetEnabled');
        if (shouldShow !== _lastSpeedWidgetVisible) {
            widget.style.display = shouldShow ? 'block' : 'none';
            _lastSpeedWidgetVisible = shouldShow;
            console.log('[Speed Widget]', shouldShow ? 'Visible' : 'Hidden',
                '(tracking:', rt().getIsTrackingActive(), 'route:', rt().getRouteInProgress(), ')');
        }
    }

    function getCurrentRoadType(maneuverIdxOverride, gpsSpeedMph) {
        return rt().routeGeometry().resolveCurrentRoadType({
            maneuverIdxOverride,
            gpsSpeedMph,
            currentRouteSteps: rt().getCurrentRouteSteps(),
            currentStepIndex: rt().getCurrentStepIndex(),
            lastDetectedRoadType: rt().g('lastDetectedRoadType'),
        });
    }

    function getManeuverStreetLabel(maneuver, preferCurrentRoad) {
        if (preferCurrentRoad === undefined) preferCurrentRoad = false;
        const mod = SG();
        if (mod) return mod.getManeuverStreetLabel(maneuver, preferCurrentRoad);
        return '';
    }

    function normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph) {
        const mod = SG();
        if (mod) return mod.normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph);
        return null;
    }

    function applySpeedLimitFetchOutcomeFromPlan(outcomeApply) {
        if (!outcomeApply || outcomeApply.action !== 'apply') return;

        const patch = outcomeApply.statePatch || {};
        if (patch.lastDetectedRoadType) rt().s('lastDetectedRoadType', patch.lastDetectedRoadType);
        if (patch.lastSpeedLimitRegion) rt().s('lastSpeedLimitRegion', patch.lastSpeedLimitRegion);

        const state = _getSpeedLimitFetchState();
        if (patch.currentLimitMph != null && state) {
            state.currentLimitMph = patch.currentLimitMph;
        }
        if (patch.currentSpeedLimitMph != null) {
            rt().s('currentSpeedLimitMph', patch.currentSpeedLimitMph);
        }

        if (outcomeApply.widgetUpdate) {
            updateSpeedWidget(
                outcomeApply.widgetUpdate.displaySpeedMph,
                outcomeApply.widgetUpdate.shownLimit
            );
        }

        if (outcomeApply.cacheHint) {
            void rt().call.cacheSpeedLimit(
                outcomeApply.cacheHint.lat,
                outcomeApply.cacheHint.lon,
                outcomeApply.cacheHint.limitMph,
                outcomeApply.cacheHint.source || 'api'
            );
        }
    }

    function fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType, valhallaSpeedLimit, headingDeg) {
        if (roadType === undefined) roadType = 'residential';
        if (valhallaSpeedLimit === undefined) valhallaSpeedLimit = null;
        if (headingDeg === undefined) headingDeg = null;

        const speedLimit = SL();
        const speedGps = SG();
        const state = _getSpeedLimitFetchState();
        if (!speedLimit || !state) return;

        const tick = speedLimit.buildSpeedLimitFetchTickPlan({
            lat,
            lon,
            roadType,
            valhallaSpeedLimit,
            headingDeg,
            now: Date.now(),
            fetchState: state,
            calculateDistance: rt().call.calculateDistanceMeters,
            currentSpeedMph,
            currentGpsSpeedMph: rt().g('currentGpsSpeedMph'),
            lastDetectedRoadType: rt().g('lastDetectedRoadType'),
            lastSpeedLimitRegion: rt().g('lastSpeedLimitRegion'),
        });
        if (tick.action === 'skip') return;

        const apply = speedLimit.buildSpeedLimitFetchStateApplyPlan(tick);
        if (apply.action === 'skip') return;

        state.inFlight = apply.statePatch.inFlight;
        state.lastFetchAt = apply.statePatch.lastFetchAt;
        state.lastPosition = apply.statePatch.lastPosition;
        state.seq = apply.statePatch.seq;
        const mySeq = apply.fetch.seq;
        const ctx = apply.context;

        const acceptIfFresh = (outcomeApply) => {
            if (!outcomeApply || outcomeApply.action !== 'apply') return;
            if (mySeq < state.appliedSeq) return;
            state.appliedSeq = mySeq;
            applySpeedLimitFetchOutcomeFromPlan(outcomeApply);
        };

        fetch(apply.fetch.url)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((data) => {
                acceptIfFresh(speedLimit.buildSpeedLimitApiSuccessApplyPlan({
                    data,
                    lat: ctx.lat,
                    lon: ctx.lon,
                    roadType: ctx.roadType,
                    valhallaSpeedLimit: ctx.valhallaSpeedLimit,
                    currentSpeedMph: ctx.currentSpeedMph,
                    currentGpsSpeedMph: ctx.currentGpsSpeedMph,
                    lastSpeedLimitRegion: ctx.lastSpeedLimitRegion,
                    speedGpsModule: speedGps,
                }));
            })
            .catch(async () => {
                let cachedLimitMph = null;
                if (rt().getIsOffline() || !navigator.onLine) {
                    try {
                        const cached = await rt().call.getCachedSpeedLimit(lat, lon);
                        cachedLimitMph = speedLimit.readCachedLimitMph(cached, Date.now());
                    } catch (_) { /* ignore */ }
                }
                acceptIfFresh(speedLimit.buildSpeedLimitFetchFallbackApplyPlan({
                    cachedLimitMph,
                    valhallaSpeedLimit: ctx.valhallaSpeedLimit,
                    roadType: ctx.roadType,
                    lastDetectedRoadType: ctx.lastDetectedRoadType,
                    lastSpeedLimitRegion: ctx.lastSpeedLimitRegion,
                    currentGpsSpeedMph: ctx.currentGpsSpeedMph,
                }));
            })
            .finally(() => {
                state.inFlight = false;
            });
    }

    function applySpeedWidgetToggleUi() {
        const toggle = document.getElementById('speedWidgetToggle');
        rt().toggleUI().applyLabeledToggleButton(toggle, rt().g('speedWidgetEnabled'));
        _lastSpeedWidgetVisible = null;
        updateSpeedWidgetVisibility();
    }

    function toggleSpeedWidget() {
        const next = !rt().g('speedWidgetEnabled');
        rt().s('speedWidgetEnabled', next);
        localStorage.setItem('speedWidgetEnabled', next ? 'true' : 'false');
        applySpeedWidgetToggleUi();
        rt().call.saveAllSettings();
    }

    function getSpeedLimitFetchState() {
        return _getSpeedLimitFetchState();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        smoothGpsSpeedMph: smoothGpsSpeedMph,
        updateSpeedWidget: updateSpeedWidget,
        updateSpeedWidgetVisibility: updateSpeedWidgetVisibility,
        getCurrentRoadType: getCurrentRoadType,
        getManeuverStreetLabel: getManeuverStreetLabel,
        normalizeManeuverSpeedLimitMph: normalizeManeuverSpeedLimitMph,
        applySpeedLimitFetchOutcomeFromPlan: applySpeedLimitFetchOutcomeFromPlan,
        fetchSpeedLimitThrottled: fetchSpeedLimitThrottled,
        applySpeedWidgetToggleUi: applySpeedWidgetToggleUi,
        toggleSpeedWidget: toggleSpeedWidget,
        getSpeedLimitFetchState: getSpeedLimitFetchState,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeedWidgetOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
