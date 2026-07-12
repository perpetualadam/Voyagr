/**
 * @file Live data refresh + nav ETA announcement orchestration (intervals, fetch, voice).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var trafficRefreshInterval = null;
    var etaRefreshInterval = null;
    var weatherRefreshInterval = null;
    var hazardRefreshInterval = null;

    var lastETAAnnouncementTime = 0;
    var lastAnnouncedETA = null;
    var initialETAMovementRetries = 0;
    var initialETAAnnouncementTimeoutId = null;
    var lastNavTrafficFetchAt = 0;
    var ETA_CHANGE_THRESHOLD_MS = 300000;
    var ETA_MIN_INTERVAL_MS = 60000;

    function getLastETAAnnouncementTime() { return lastETAAnnouncementTime; }
    function setLastETAAnnouncementTime(val) { lastETAAnnouncementTime = val; }
    function getLastAnnouncedETA() { return lastAnnouncedETA; }
    function setLastAnnouncedETA(val) { lastAnnouncedETA = val; }
    function getInitialETAMovementRetries() { return initialETAMovementRetries; }
    function setInitialETAMovementRetries(val) { initialETAMovementRetries = val; }
    function getInitialETAAnnouncementTimeoutId() { return initialETAAnnouncementTimeoutId; }
    function setInitialETAAnnouncementTimeoutId(val) { initialETAAnnouncementTimeoutId = val; }
    function getLastNavTrafficFetchAt() { return lastNavTrafficFetchAt; }
    function setLastNavTrafficFetchAt(val) { lastNavTrafficFetchAt = val; }
    function getEtaChangeThresholdMs() { return ETA_CHANGE_THRESHOLD_MS; }
    function getEtaMinIntervalMs() { return ETA_MIN_INTERVAL_MS; }

    function rt() {
        if (!runtime) {
            throw new Error('[LiveDataRefresh] Orchestration runtime not bound');
        }
        return runtime;
    }

    function LDR() {
        return rt().liveDataRefresh();
    }

    function ETA() {
        return rt().eta();
    }

    function startLiveDataRefresh() {
        const execute = LDR().buildStartLiveDataRefreshExecutePlan({
            routeInProgress: rt().getRouteInProgress(),
            batteryLevel: rt().getCurrentBatteryLevel(),
            hasBatteryApi: 'getBattery' in navigator,
        });
        if (!execute.shouldStart) return;

        if (execute.stopExistingFirst) stopLiveDataRefresh();

        trafficRefreshInterval = setInterval(() => {
            refreshTrafficData();
        }, execute.intervals.traffic);

        etaRefreshInterval = setInterval(() => {
            updateETACalculation().then(() => announceETAIfNeeded());
        }, execute.intervals.eta);

        weatherRefreshInterval = setInterval(() => {
            refreshWeatherData();
        }, execute.intervals.weather);

        hazardRefreshInterval = setInterval(() => {
            const lat = rt().getCurrentLat();
            const lon = rt().getCurrentLon();
            if (lat && lon) {
                rt().call.processNavigationHazardAlerts(lat, lon);
            }
        }, execute.intervals.hazard);

        console.log(execute.startLogMessage);
    }

    function stopLiveDataRefresh() {
        const execute = LDR().buildStopLiveDataRefreshExecutePlan();
        if (!execute.shouldStop) return;

        clearInterval(trafficRefreshInterval);
        clearInterval(etaRefreshInterval);
        clearInterval(weatherRefreshInterval);
        clearInterval(hazardRefreshInterval);
        console.log(execute.stopLogMessage);
    }

    function refreshTrafficData() {
        const preflight = LDR().buildRefreshTrafficDataPreflightPlan({
            routeInProgress: rt().getRouteInProgress(),
            lat: rt().getCurrentLat(),
            lon: rt().getCurrentLon(),
        });
        if (!preflight.shouldFetch) return;

        fetch(preflight.url)
            .then((r) => r.json())
            .then((data) => {
                const notify = LDR().buildRefreshTrafficDataNotificationPlan(data);
                if (notify.shouldNotify) {
                    rt().call.sendNotification(
                        notify.notification.title,
                        notify.notification.message,
                        notify.notification.type
                    );
                }
            })
            .catch((e) => console.log(preflight.errorLogPrefix, e));
    }

    async function updateETACalculation() {
        const base = rt().call.computeBaseNavigationETAMinutes();
        const tick = ETA().buildUpdateETACalculationTickPlan({
            routeInProgress: rt().getRouteInProgress(),
            hasRoute: !!rt().getLastCalculatedRoute(),
            hasPolyline: !!rt().getRoutePolyline(),
            baseRemainingMinutes: base ? base.timeRemainingMinutes : null,
            progressPercent: base ? base.progressPercent : null,
            applyTrafficAware: ETA().shouldApplyTrafficAwareETA(localStorage, rt().getCurrentRoutingMode()),
            trafficLevel: window.navETASnapshot.trafficLevel,
            congestionPercent: window.navETASnapshot.congestionPercent,
        });
        if (tick.action !== 'update') {
            if (tick.warnLog) console.warn(tick.warnLog);
            return;
        }

        const renderPanel = () => {
            const adjusted = tick.applyTrafficAware
                ? rt().call.applyTrafficRatioToBaseRemaining(tick.timeRemainingMinutes)
                : null;
            rt().call.renderTurnInfoETAPanel(
                tick.timeRemainingMinutes,
                adjusted,
                tick.progressPercent,
                tick.trafficLevel,
                tick.congestionPercent
            );
        };

        renderPanel();
        await rt().call.refreshNavTrafficETAIfDue(tick.timeRemainingMinutes, tick.progressPercent, false);
        renderPanel();
    }

    function announceETAIfNeeded() {
        const base = rt().call.computeBaseNavigationETAMinutes();
        const tick = ETA().buildAnnounceETAIfNeededPlan({
            routeInProgress: rt().getRouteInProgress(),
            hasRoute: !!rt().getLastCalculatedRoute(),
            voiceEnabled: rt().getVoiceAnnouncementsEnabled(),
            now: Date.now(),
            lastETAAnnouncementTime: getLastETAAnnouncementTime(),
            baseRemainingMinutes: base ? base.timeRemainingMinutes : null,
            applyTrafficRatio: rt().call.applyTrafficRatioToBaseRemaining,
        });
        if (tick.action !== 'announce') {
            if (tick.warnLog) console.warn(tick.warnLog);
            return;
        }

        const eta = new Date(tick.etaMs);
        const message = ETA().buildETAVoiceMessage(tick.timeRemainingMinutes, eta);
        console.log(`${tick.logPrefix} ${message}`);
        rt().call.speakMessage(message);
        setLastETAAnnouncementTime(tick.updateLastETAAnnouncementTime);
        setLastAnnouncedETA(eta);
    }

    async function speakInitialETAAnnouncement() {
        const movement = ETA().buildInitialETAMovementDeferPlan({
            hasStartedMoving: rt().call.hasUserStartedMoving(),
            retries: getInitialETAMovementRetries(),
        });
        if (movement.action === 'defer') {
            setInitialETAMovementRetries(movement.retries);
            const timeoutId = getInitialETAAnnouncementTimeoutId();
            if (timeoutId) {
                clearTimeout(timeoutId);
                setInitialETAAnnouncementTimeoutId(null);
            }
            const nextId = setTimeout(() => {
                setInitialETAAnnouncementTimeoutId(null);
                void speakInitialETAAnnouncement();
            }, movement.retryDelayMs);
            setInitialETAAnnouncementTimeoutId(nextId);
            console.log(movement.logMessage);
            return;
        }
        if (movement.action === 'skip') {
            console.log(movement.logMessage);
            return;
        }

        const base = rt().call.computeBaseNavigationETAMinutes();
        const lat = rt().getCurrentLat();
        const lon = rt().getCurrentLon();
        const execute = ETA().buildInitialETAAnnouncementExecutePlan({
            routeInProgress: rt().getRouteInProgress(),
            hasRoute: !!rt().getLastCalculatedRoute(),
            voiceEnabled: rt().getVoiceAnnouncementsEnabled(),
            baseRemainingMinutes: base ? base.timeRemainingMinutes : null,
            applyTrafficRatio: rt().call.applyTrafficRatioToBaseRemaining,
            refreshTrafficIfDue: ETA().shouldApplyTrafficAwareETA(localStorage, rt().getCurrentRoutingMode())
                && lat != null
                && lon != null,
            now: Date.now(),
        });
        if (!execute.shouldAnnounce) return;

        if (execute.resetMovementRetries) setInitialETAMovementRetries(0);
        if (execute.refreshTrafficIfDue && base) {
            await rt().call.refreshNavTrafficETAIfDue(base.timeRemainingMinutes, base.progressPercent, true);
        }

        const eta = new Date(execute.etaMs);
        const message = ETA().buildETAVoiceMessage(execute.timeRemainingMinutes, eta);
        console.log(`${execute.logPrefix} ${message}`);
        rt().call.speakMessage(message);
        setLastETAAnnouncementTime(execute.updateLastETAAnnouncementTime);
        setLastAnnouncedETA(eta);
    }

    function scheduleInitialETAAnnouncement() {
        const schedule = ETA().buildScheduleInitialETAAnnouncementPlan();
        if (!schedule.shouldSchedule) return;
        const existingId = getInitialETAAnnouncementTimeoutId();
        if (schedule.clearExisting && existingId) {
            clearTimeout(existingId);
            setInitialETAAnnouncementTimeoutId(null);
        }
        const nextId = setTimeout(() => {
            setInitialETAAnnouncementTimeoutId(null);
            speakInitialETAAnnouncement();
        }, schedule.delayMs);
        setInitialETAAnnouncementTimeoutId(nextId);
    }

    function clearInitialETAAnnouncement() {
        const timeoutId = getInitialETAAnnouncementTimeoutId();
        if (timeoutId) {
            clearTimeout(timeoutId);
            setInitialETAAnnouncementTimeoutId(null);
        }
    }

    function refreshWeatherData() {
        const preflight = LDR().buildRefreshWeatherDataPreflightPlan({
            lat: rt().getCurrentLat(),
            lon: rt().getCurrentLon(),
        });
        if (!preflight.shouldFetch) return;

        fetch(preflight.url)
            .then((r) => r.json())
            .then((data) => {
                const notify = LDR().buildRefreshWeatherDataNotificationPlan(data);
                if (notify.shouldNotify) {
                    rt().call.sendNotification(
                        notify.notification.title,
                        notify.notification.message,
                        notify.notification.type
                    );
                }
            })
            .catch((e) => console.log(preflight.errorLogPrefix, e));
    }

    function getAdaptiveRefreshInterval(baseInterval) {
        return LDR().buildAdaptiveRefreshIntervalPlan(
            baseInterval,
            rt().getCurrentBatteryLevel(),
            'getBattery' in navigator
        ).intervalMs;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        startLiveDataRefresh: startLiveDataRefresh,
        stopLiveDataRefresh: stopLiveDataRefresh,
        refreshTrafficData: refreshTrafficData,
        updateETACalculation: updateETACalculation,
        announceETAIfNeeded: announceETAIfNeeded,
        speakInitialETAAnnouncement: speakInitialETAAnnouncement,
        scheduleInitialETAAnnouncement: scheduleInitialETAAnnouncement,
        clearInitialETAAnnouncement: clearInitialETAAnnouncement,
        refreshWeatherData: refreshWeatherData,
        getAdaptiveRefreshInterval: getAdaptiveRefreshInterval,
        getLastETAAnnouncementTime: getLastETAAnnouncementTime,
        setLastETAAnnouncementTime: setLastETAAnnouncementTime,
        getLastAnnouncedETA: getLastAnnouncedETA,
        setLastAnnouncedETA: setLastAnnouncedETA,
        getInitialETAMovementRetries: getInitialETAMovementRetries,
        setInitialETAMovementRetries: setInitialETAMovementRetries,
        getInitialETAAnnouncementTimeoutId: getInitialETAAnnouncementTimeoutId,
        setInitialETAAnnouncementTimeoutId: setInitialETAAnnouncementTimeoutId,
        getLastNavTrafficFetchAt: getLastNavTrafficFetchAt,
        setLastNavTrafficFetchAt: setLastNavTrafficFetchAt,
        getEtaChangeThresholdMs: getEtaChangeThresholdMs,
        getEtaMinIntervalMs: getEtaMinIntervalMs,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLiveDataRefreshOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
