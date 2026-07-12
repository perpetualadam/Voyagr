/**
 * @file Lane guidance overlay orchestration (fetch, cache, DOM render).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var lastLaneGuidanceFetch = 0;
    var lastLaneGuidanceManeuver = '';
    var lastLaneGuidancePosition = null;
    var lastLaneVoiceKey = '';
    var laneGuidanceCache = new Map();

    function rt() {
        if (!runtime) {
            throw new Error('[LaneGuidance] Orchestration runtime not bound');
        }
        return runtime;
    }

    function LG() { return rt().laneGuidance(); }

    function pruneLaneGuidanceCache() {
        const laneGuidance = LG();
        const now = Date.now();
        laneGuidanceCache.forEach(function (_v, k) {
            const entry = laneGuidanceCache.get(k);
            if (entry && now - entry.ts > laneGuidance.LANE_GUIDANCE_CACHE_TTL_MS) {
                laneGuidanceCache.delete(k);
            }
        });
        while (laneGuidanceCache.size > laneGuidance.LANE_GUIDANCE_CACHE_MAX_ENTRIES) {
            const firstKey = laneGuidanceCache.keys().next().value;
            laneGuidanceCache.delete(firstKey);
        }
    }

    function renderLaneGuidanceUI(data) {
        const display = document.getElementById('laneGuidanceDisplay');
        const visual = document.getElementById('laneVisual');
        const text = document.getElementById('laneGuidanceText');

        if (!display || !visual || !text) return;

        const domPlan = LG().buildLaneGuidanceDomApplyPlan(data, lastLaneVoiceKey);
        const apply = LG().buildLaneGuidanceDomStateApplyPlan(domPlan, {
            voiceEnabled: rt().getVoiceAnnouncementsEnabled(),
        });

        if (apply.action === 'hide') {
            display.classList.remove('show');
            return;
        }

        const badgeEl = document.getElementById('laneGuidanceBadge');
        if (badgeEl && apply.badge) {
            badgeEl.textContent = apply.badge.text;
            badgeEl.style.display = apply.badge.visible ? 'inline-block' : 'none';
        }

        visual.innerHTML = '';
        (apply.indicators || []).forEach(function (ind) {
            const lane = document.createElement('div');
            lane.className = ind.className;
            lane.innerHTML = ind.innerHtml;
            visual.appendChild(lane);
        });

        display.className = apply.displayClassName;
        if (apply.urgencyClass) display.classList.add(apply.urgencyClass);
        text.textContent = apply.guidanceText;

        if (apply.voice) {
            rt().call.speakMessage(apply.voice.message, apply.voice.priority);
            lastLaneVoiceKey = apply.voice.announceKey;
        }
    }

    function updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount) {
        if (roundaboutExitCount === undefined) roundaboutExitCount = 0;

        const tick = LG().buildLaneGuidanceFetchTickPlan({
            lat: lat,
            lon: lon,
            heading: heading,
            maneuver: maneuver,
            roundaboutExitCount: roundaboutExitCount,
            now: Date.now(),
            lastFetch: lastLaneGuidanceFetch,
            lastPosition: lastLaneGuidancePosition,
            lastManeuver: lastLaneGuidanceManeuver,
            routeSteps: rt().getCurrentRouteSteps(),
            currentStepIndex: rt().getCurrentStepIndex(),
            routePolyline: rt().getRoutePolyline(),
            roadType: rt().call.getCurrentRoadType() || 'unknown',
            calculateDistance: rt().call.calculateDistanceMeters,
            cacheLookup: function (key) { return laneGuidanceCache.get(key); },
        });

        if (tick.action === 'skip') return;

        const apply = LG().buildLaneGuidanceFetchStateApplyPlan(tick);
        if (apply.action === 'skip') return;

        lastLaneGuidanceFetch = apply.statePatch.lastFetch;
        lastLaneGuidanceManeuver = apply.statePatch.lastManeuver;
        lastLaneGuidancePosition = apply.statePatch.lastPosition;

        if (apply.kind === 'render-cached') {
            renderLaneGuidanceUI(apply.renderPayload);
            return;
        }

        const fetchPlan = apply.fetch;
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(function () { controller.abort(); }, fetchPlan.timeoutMs) : null;

        const useFallback = function (reason) {
            const outcome = LG().buildLaneGuidanceFetchOutcomePlan({
                apiSuccess: false,
                errorReason: reason,
                maneuver: fetchPlan.maneuver,
                distToManeuver: fetchPlan.distToManeuver,
                roundaboutExitCount: fetchPlan.roundaboutExitCount,
                roadType: fetchPlan.roadType,
            });
            laneGuidanceCache.set(fetchPlan.cacheKey, outcome.cacheEntry);
            pruneLaneGuidanceCache();
            if (outcome.warnLine) console.warn(outcome.warnLine);
            renderLaneGuidanceUI(outcome.renderData);
        };

        fetch(fetchPlan.url, controller ? { signal: controller.signal } : undefined)
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (timeoutId) clearTimeout(timeoutId);
                const outcome = LG().buildLaneGuidanceFetchOutcomePlan({
                    apiSuccess: !!(data && data.success),
                    apiData: data,
                    maneuver: fetchPlan.maneuver,
                    distToManeuver: fetchPlan.distToManeuver,
                    roundaboutExitCount: fetchPlan.roundaboutExitCount,
                    roadType: fetchPlan.roadType,
                    errorReason: 'no data',
                });
                laneGuidanceCache.set(fetchPlan.cacheKey, outcome.cacheEntry);
                pruneLaneGuidanceCache();
                if (outcome.warnLine) console.warn(outcome.warnLine);
                renderLaneGuidanceUI(outcome.renderData);
            })
            .catch(function (error) {
                if (timeoutId) clearTimeout(timeoutId);
                useFallback((error && error.name === 'AbortError') ? 'timeout' : (error && error.message) || 'error');
            });
    }

    function clearLastLaneVoiceKey() {
        lastLaneVoiceKey = '';
    }

    function getLastLaneVoiceKey() {
        return lastLaneVoiceKey;
    }

    function setLastLaneVoiceKey(val) {
        lastLaneVoiceKey = val || '';
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        updateLaneGuidance: updateLaneGuidance,
        renderLaneGuidanceUI: renderLaneGuidanceUI,
        clearLastLaneVoiceKey: clearLastLaneVoiceKey,
        getLastLaneVoiceKey: getLastLaneVoiceKey,
        setLastLaneVoiceKey: setLastLaneVoiceKey,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLaneGuidanceOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
