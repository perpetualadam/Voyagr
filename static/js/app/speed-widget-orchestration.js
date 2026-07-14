/**
 * @file GPS speed widget, smoothing, and speed-limit fetch orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var _speedLimitFetchState = null;
    var _lastSpeedWidgetVisible = null;

    var speedWidgetEnabled = localStorage.getItem('speedWidgetEnabled') !== 'false';
    var currentGpsSpeedMph = 0;
    var currentGpsSpeedKmh = 0;
    var currentSpeedLimitMph = null;
    var lastDetectedRoadType = null;
    var lastSpeedLimitRegion = 'uk';
    var lastActiveManeuverIdx = -1;
    var smoothedSpeedMph = 0;
    var smoothedSpeedInitAt = 0;
    var lastGoodRawPickMph = 0;
    var consecutiveDisplacementMoves = 0;

    function getSpeedWidgetEnabled() { return speedWidgetEnabled; }
    function setSpeedWidgetEnabled(val) { speedWidgetEnabled = !!val; }
    function getCurrentGpsSpeedMph() { return currentGpsSpeedMph; }
    function setCurrentGpsSpeedMph(val) { currentGpsSpeedMph = val; }
    function getCurrentGpsSpeedKmh() { return currentGpsSpeedKmh; }
    function setCurrentGpsSpeedKmh(val) { currentGpsSpeedKmh = val; }
    function getCurrentSpeedLimitMph() { return currentSpeedLimitMph; }
    function setCurrentSpeedLimitMph(val) { currentSpeedLimitMph = val; }
    function getLastDetectedRoadType() { return lastDetectedRoadType; }
    function setLastDetectedRoadType(val) { lastDetectedRoadType = val; }
    function getLastSpeedLimitRegion() { return lastSpeedLimitRegion; }
    function setLastSpeedLimitRegion(val) { lastSpeedLimitRegion = val; }
    function getLastActiveManeuverIdx() { return lastActiveManeuverIdx; }
    function setLastActiveManeuverIdx(val) { lastActiveManeuverIdx = val; }
    function getSmoothedSpeedMph() { return smoothedSpeedMph; }
    function setSmoothedSpeedMph(val) { smoothedSpeedMph = val; }
    function getSmoothedSpeedInitAt() { return smoothedSpeedInitAt; }
    function setSmoothedSpeedInitAt(val) { smoothedSpeedInitAt = val; }
    function getLastGoodRawPickMph() { return lastGoodRawPickMph; }
    function setLastGoodRawPickMph(val) { lastGoodRawPickMph = val; }
    function getConsecutiveDisplacementMoves() { return consecutiveDisplacementMoves; }
    function setConsecutiveDisplacementMoves(val) { consecutiveDisplacementMoves = val; }

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
                smoothedMph: getSmoothedSpeedMph(),
                initAt: getSmoothedSpeedInitAt(),
            },
            rawMph,
            Date.now()
        );
        setSmoothedSpeedMph(r.state.smoothedMph);
        setSmoothedSpeedInitAt(r.state.initAt);
        return r.value;
    }

    function updateSpeedWidget(currentSpeedInMph, speedLimitInMph) {
        if (speedLimitInMph === undefined) speedLimitInMph = null;
        const widget = document.getElementById('speedWidget');
        if (!widget) return;

        setCurrentGpsSpeedMph(currentSpeedInMph);
        setCurrentGpsSpeedKmh(currentSpeedInMph * 1.609344);

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
                setCurrentSpeedLimitMph(resolvedLimit);
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
            && getSpeedWidgetEnabled();
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
            lastDetectedRoadType: getLastDetectedRoadType(),
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
        if (patch.lastDetectedRoadType) setLastDetectedRoadType(patch.lastDetectedRoadType);
        if (patch.lastSpeedLimitRegion) setLastSpeedLimitRegion(patch.lastSpeedLimitRegion);

        const state = _getSpeedLimitFetchState();
        if (patch.currentLimitMph != null && state) {
            state.currentLimitMph = patch.currentLimitMph;
        }
        if (patch.currentSpeedLimitMph != null) {
            setCurrentSpeedLimitMph(patch.currentSpeedLimitMph);
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
            currentGpsSpeedMph: getCurrentGpsSpeedMph(),
            lastDetectedRoadType: getLastDetectedRoadType(),
            lastSpeedLimitRegion: getLastSpeedLimitRegion(),
            lastFetchedRoadType: state.lastFetchedRoadType || null,
        });
        if (tick.action === 'skip') return;

        const apply = speedLimit.buildSpeedLimitFetchStateApplyPlan(tick);
        if (apply.action === 'skip') return;

        state.inFlight = apply.statePatch.inFlight;
        state.lastFetchAt = apply.statePatch.lastFetchAt;
        state.lastPosition = apply.statePatch.lastPosition;
        if (apply.statePatch.lastFetchedRoadType) {
            state.lastFetchedRoadType = apply.statePatch.lastFetchedRoadType;
        }
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
        rt().toggleUI().applyLabeledToggleButton(toggle, getSpeedWidgetEnabled());
        _lastSpeedWidgetVisible = null;
        updateSpeedWidgetVisibility();
    }

    function toggleSpeedWidget() {
        const next = !getSpeedWidgetEnabled();
        setSpeedWidgetEnabled(next);
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
        getSpeedWidgetEnabled: getSpeedWidgetEnabled,
        setSpeedWidgetEnabled: setSpeedWidgetEnabled,
        getCurrentGpsSpeedMph: getCurrentGpsSpeedMph,
        setCurrentGpsSpeedMph: setCurrentGpsSpeedMph,
        getCurrentGpsSpeedKmh: getCurrentGpsSpeedKmh,
        setCurrentGpsSpeedKmh: setCurrentGpsSpeedKmh,
        getCurrentSpeedLimitMph: getCurrentSpeedLimitMph,
        setCurrentSpeedLimitMph: setCurrentSpeedLimitMph,
        getLastDetectedRoadType: getLastDetectedRoadType,
        setLastDetectedRoadType: setLastDetectedRoadType,
        getLastSpeedLimitRegion: getLastSpeedLimitRegion,
        setLastSpeedLimitRegion: setLastSpeedLimitRegion,
        getLastActiveManeuverIdx: getLastActiveManeuverIdx,
        setLastActiveManeuverIdx: setLastActiveManeuverIdx,
        getSmoothedSpeedMph: getSmoothedSpeedMph,
        setSmoothedSpeedMph: setSmoothedSpeedMph,
        getSmoothedSpeedInitAt: getSmoothedSpeedInitAt,
        setSmoothedSpeedInitAt: setSmoothedSpeedInitAt,
        getLastGoodRawPickMph: getLastGoodRawPickMph,
        setLastGoodRawPickMph: setLastGoodRawPickMph,
        getConsecutiveDisplacementMoves: getConsecutiveDisplacementMoves,
        setConsecutiveDisplacementMoves: setConsecutiveDisplacementMoves,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeedWidgetOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
