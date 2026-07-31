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
    var lockedLaneGuidance = null;
    var lockedLaneStepIndex = -1;

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

    function getRoutingManeuverLanes(stepIndexOverride) {
        var steps = rt().getCurrentRouteSteps();
        var idx = stepIndexOverride != null ? stepIndexOverride : rt().getCurrentStepIndex();
        if (!steps || idx == null || idx < 0 || idx >= steps.length) return null;
        var step = steps[idx];
        return step && step.lanes ? step.lanes : null;
    }

    /**
     * Road class for lane heuristics must track the guidance/lookahead step, not only
     * the active continue — otherwise roundaboutPrefersRightLane sees residential
     * while distance/lanes already target a dual primary/trunk roundabout.
     */
    function resolveGuidanceRoadType(guidanceStepIndex) {
        var idx = guidanceStepIndex != null ? guidanceStepIndex : undefined;
        return rt().call.getCurrentRoadType(idx) || 'unknown';
    }

    function finalizeLaneGuidanceForRender(data, maneuver, roundaboutExitCount, distToManeuver, guidanceStepIndex) {
        var laneGuidance = LG();
        var stepIndex = guidanceStepIndex != null ? guidanceStepIndex : rt().getCurrentStepIndex();
        var roadType = resolveGuidanceRoadType(guidanceStepIndex);
        var routingLanes = getRoutingManeuverLanes(stepIndex);

        var hybrid = laneGuidance.buildHybridLaneGuidance({
            routingManeuverLanes: routingLanes,
            apiData: data && data.success !== false ? data : null,
            maneuver: maneuver,
            distanceToManeuver: distToManeuver,
            roundaboutExitCount: roundaboutExitCount,
            roadType: roadType,
        });

        var stability = laneGuidance.buildLaneGuidanceStabilityPlan({
            newGuidance: hybrid,
            lockedGuidance: lockedLaneGuidance,
            distanceToManeuver: distToManeuver,
            maneuverStepIndex: stepIndex,
            maneuver: maneuver,
            roundaboutExitCount: roundaboutExitCount,
            routeRecalculated: false,
            maneuverCompleted: false,
        });

        if (stability.action === 'clear') {
            lockedLaneGuidance = null;
            lockedLaneStepIndex = -1;
            return null;
        }
        if (stability.lockedGuidance) {
            lockedLaneGuidance = stability.lockedGuidance;
            lockedLaneStepIndex = stability.lockedStepIndex;
        }
        return stability.guidance;
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

    function updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount, guidanceStepIndex) {
        if (roundaboutExitCount === undefined) roundaboutExitCount = 0;
        if (guidanceStepIndex === undefined) guidanceStepIndex = null;

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
            // Prefer the lookahead target step so distance/lanes track the roundabout/exit
            // we are pre-positioning for, not a neutral continue.
            currentStepIndex: guidanceStepIndex != null
                ? guidanceStepIndex
                : rt().getCurrentStepIndex(),
            routePolyline: rt().getRoutePolyline(),
            lastSnappedRouteIndex: rt().getLastSnappedRouteIndex
                ? rt().getLastSnappedRouteIndex()
                : 0,
            // Match finalizeLaneGuidanceForRender: class from the lookahead target step.
            roadType: resolveGuidanceRoadType(guidanceStepIndex),
            calculateDistance: rt().call.calculateDistanceMeters,
            snapToRoutePolyline: rt().routeGeometry
                ? (a, b, c, d) => rt().routeGeometry().snapToRoutePolyline(a, b, c, d)
                : null,
            distanceAlongRouteToVertexMeters: rt().routeGeometry
                ? (poly, snap, idx) => rt().routeGeometry().distanceAlongRouteToVertexMeters(poly, snap, idx)
                : null,
            cacheLookup: function (key) { return laneGuidanceCache.get(key); },
        });

        if (tick.action === 'skip') return;

        const apply = LG().buildLaneGuidanceFetchStateApplyPlan(tick);
        if (apply.action === 'skip') return;

        lastLaneGuidanceFetch = apply.statePatch.lastFetch;
        lastLaneGuidanceManeuver = apply.statePatch.lastManeuver;
        lastLaneGuidancePosition = apply.statePatch.lastPosition;

        if (apply.kind === 'render-cached') {
            var cachedFinal = finalizeLaneGuidanceForRender(
                apply.renderPayload,
                maneuver,
                roundaboutExitCount,
                apply.renderPayload.distance_to_maneuver,
                guidanceStepIndex
            );
            renderLaneGuidanceUI(cachedFinal);
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
                routingManeuverLanes: getRoutingManeuverLanes(guidanceStepIndex),
            });
            laneGuidanceCache.set(fetchPlan.cacheKey, outcome.cacheEntry);
            pruneLaneGuidanceCache();
            if (outcome.warnLine) console.warn(outcome.warnLine);
            var finalData = finalizeLaneGuidanceForRender(
                outcome.renderData,
                fetchPlan.maneuver,
                fetchPlan.roundaboutExitCount,
                fetchPlan.distToManeuver,
                guidanceStepIndex
            );
            renderLaneGuidanceUI(finalData);
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
                    routingManeuverLanes: getRoutingManeuverLanes(guidanceStepIndex),
                });
                laneGuidanceCache.set(fetchPlan.cacheKey, outcome.cacheEntry);
                pruneLaneGuidanceCache();
                if (outcome.warnLine) console.warn(outcome.warnLine);
                var finalData = finalizeLaneGuidanceForRender(
                    outcome.renderData,
                    fetchPlan.maneuver,
                    fetchPlan.roundaboutExitCount,
                    fetchPlan.distToManeuver,
                    guidanceStepIndex
                );
                renderLaneGuidanceUI(finalData);
            })
            .catch(function (error) {
                if (timeoutId) clearTimeout(timeoutId);
                useFallback((error && error.name === 'AbortError') ? 'timeout' : (error && error.message) || 'error');
            });
    }

    function resetLaneGuidanceForNewRoute() {
        lockedLaneGuidance = null;
        lockedLaneStepIndex = -1;
        laneGuidanceCache.clear();
        lastLaneGuidanceFetch = 0;
        lastLaneGuidanceManeuver = '';
        lastLaneGuidancePosition = null;
        clearLastLaneVoiceKey();
        renderLaneGuidanceUI(null);
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
        resetLaneGuidanceForNewRoute: resetLaneGuidanceForNewRoute,
        clearLastLaneVoiceKey: clearLastLaneVoiceKey,
        getLastLaneVoiceKey: getLastLaneVoiceKey,
        setLastLaneVoiceKey: setLastLaneVoiceKey,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLaneGuidanceOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
