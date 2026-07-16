/**
 * @file Journey summary bar and end-of-trip modal orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var journeySummaryUpdateInterval = null;

    function rt() {
        if (!runtime) {
            throw new Error('[JourneySummary] Orchestration runtime not bound');
        }
        return runtime;
    }

    function ETA() { return rt().eta(); }
    function RG() { return rt().routeGeometry(); }
    function MD() { return rt().movementDetection(); }
    function UN() { return rt().units(); }

    function hasUserStartedMoving() {
        return MD().hasUserStartedMoving({
            trackingHistory: rt().getTrackingHistory(),
            haversineDistanceMeters: RG().haversineDistanceMeters,
            log: console.log.bind(console),
        });
    }

    function showJourneySummaryBar() {
        const bar = document.getElementById('journeySummaryBar');
        if (bar) {
            bar.style.display = 'flex';
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.add('voyagr-journey-summary-visible');
            }
            console.log('[Journey Summary] Displayed');
            startJourneySummaryUpdates();
        }
    }

    function hideJourneySummaryBar() {
        const bar = document.getElementById('journeySummaryBar');
        if (bar) {
            bar.style.display = 'none';
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.remove('voyagr-journey-summary-visible');
            }
            console.log('[Journey Summary] Hidden');
        }
        if (journeySummaryUpdateInterval) {
            clearInterval(journeySummaryUpdateInterval);
            journeySummaryUpdateInterval = null;
        }
    }

    function startJourneySummaryUpdates() {
        updateJourneySummaryBar();
        if (journeySummaryUpdateInterval) {
            clearInterval(journeySummaryUpdateInterval);
        }
        journeySummaryUpdateInterval = setInterval(updateJourneySummaryBar, 5000);
    }

    function updateJourneySummaryBar() {
        if (!rt().getRouteInProgress() || !rt().getRoutePolyline() || rt().getRoutePolyline().length === 0) {
            return;
        }

        const routePolyline = rt().getRoutePolyline();
        const distanceEl = document.getElementById('remainingDistance');
        const timeEl = document.getElementById('remainingTime');
        const etaEl = document.getElementById('etaTime');

        if (!distanceEl || !timeEl || !etaEl) return;

        const userHasStartedMoving = hasUserStartedMoving();
        let remainingDistanceMeters = 0;
        if (routePolyline.length >= 2) {
            const currentLat = rt().getCurrentLat();
            const currentLon = rt().getCurrentLon();
            if (userHasStartedMoving && currentLat != null && currentLon != null) {
                remainingDistanceMeters = RG().computeRemainingDistanceAlongRoute(
                    currentLat, currentLon, routePolyline, rt().getLastSnappedRouteIndex()
                );
            } else {
                remainingDistanceMeters = RG().totalPolylineLengthMeters(routePolyline);
            }
        }

        const eta = ETA();
        const polylineTotalM = RG().totalPolylineLengthMeters(routePolyline);
        const plan = eta.buildJourneySummaryBarApplyPlan({
            remainingDistanceMeters,
            distanceUnit: rt().getDistanceUnit(),
            formatRemainingDistance: (m, unit) => UN().formatRemainingDistanceText(m, unit),
            lastCalculatedRoute: window.lastCalculatedRoute,
            routeDurationMin: eta.normalizeRouteDurationMinutes(window.lastCalculatedRoute),
            userHasStartedMoving,
            polylineTotalM,
            applyTrafficRatio: rt().call.applyTrafficRatioToBaseRemaining,
            use24HourFormat: localStorage.getItem('use24HourFormat') !== 'false',
        });

        distanceEl.textContent = plan.distanceText;
        timeEl.textContent = plan.timeText;
        etaEl.textContent = plan.etaText;

        if (userHasStartedMoving && polylineTotalM > 0) {
            console.log(`[ETA] Progress-based: ${(1 - remainingDistanceMeters / polylineTotalM).toFixed(2)} complete, ${plan.remainingTimeMinutes.toFixed(1)} min remaining`);
        } else if (!userHasStartedMoving) {
            console.log(`[ETA] Pre-movement: Using original duration ${plan.remainingTimeMinutes.toFixed(1)} min`);
        }
        console.log(`[Journey Summary] Distance: ${plan.distanceText}, Time: ${plan.timeText}, ETA: ${plan.etaText}`);
    }

    function buildTraveledJourneyRoute(route) {
        const result = ETA().buildTraveledJourneyRoutePatch(
            route,
            rt().getNavTraveledMeters(),
            rt().getNavStartedAt()
        );
        if (!result.patch) return route;
        const out = { ...result.patch };
        if ('distance' in out) {
            try {
                out.distance = `${rt().call.convertDistance(out.distance_km)} ${rt().call.getDistanceUnit()}`;
            } catch (_e) {
                delete out.distance;
            }
        }
        if ('time' in out) out.time = `${out.duration_minutes} minutes`;
        return out;
    }

    function showJourneySummary(routeData) {
        const eta = ETA();
        const execute = eta.buildJourneySummaryModalExecutePlan(
            eta.buildJourneySummaryModalApplyPlan(routeData, {
                traveledMeters: rt().getNavTraveledMeters(),
                navStartedAt: rt().getNavStartedAt(),
                convertDistance: rt().call.convertDistance,
                distUnit: rt().call.getDistanceUnit(),
                convertSpeed: rt().call.convertSpeed,
                speedUnit: rt().call.getSpeedUnit(),
                currencySymbol: rt().call.getCurrencySymbol(),
                adjustCost: rt().call.adjustCostForUnits,
            })
        );
        if (!execute.shouldShow) return;

        const modal = document.getElementById(execute.modalId);
        if (!modal) return;

        const distanceEl = document.getElementById(execute.elementIds.summaryDistance);
        const timeEl = document.getElementById(execute.elementIds.summaryTime);
        const costEl = document.getElementById(execute.elementIds.summaryCost);
        const speedEl = document.getElementById(execute.elementIds.summaryAvgSpeed);
        if (distanceEl) distanceEl.textContent = execute.distanceText;
        if (timeEl) timeEl.textContent = execute.timeText;
        if (costEl) costEl.textContent = execute.costText;
        if (speedEl) speedEl.textContent = execute.avgSpeedText;

        modal.style.display = 'block';
        if (execute.expandBottomSheet) rt().call.expandBottomSheet();
        if (execute.logMessage) console.log(execute.logMessage);
    }

    function closeJourneySummary() {
        const execute = ETA().buildCloseJourneySummaryExecutePlan();
        if (!execute.shouldClose) return;

        const modal = document.getElementById(execute.modalId);
        if (modal) modal.style.display = 'none';

        if (execute.switchTab) rt().call.switchTab(execute.switchTab);
        if (execute.clearForm) rt().call.clearForm();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        hasUserStartedMoving: hasUserStartedMoving,
        showJourneySummaryBar: showJourneySummaryBar,
        hideJourneySummaryBar: hideJourneySummaryBar,
        startJourneySummaryUpdates: startJourneySummaryUpdates,
        updateJourneySummaryBar: updateJourneySummaryBar,
        buildTraveledJourneyRoute: buildTraveledJourneyRoute,
        showJourneySummary: showJourneySummary,
        closeJourneySummary: closeJourneySummary,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrJourneySummaryOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
