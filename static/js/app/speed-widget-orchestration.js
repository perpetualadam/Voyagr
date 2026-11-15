/**
 * @file GPS speed widget, smoothing, and speed-limit fetch orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var _speedLimitFetchState = null;
    var _lastSpeedWidgetVisible = null;
    var _lastSpeedWidgetUpdateAt = 0;

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

    function updateSpeedWidget(currentSpeedInMph, speedLimitInMph, evidence, observation) {
        if (speedLimitInMph === undefined) speedLimitInMph = null;
        const widget = document.getElementById('speedWidget');
        if (!widget) return;

        _lastSpeedWidgetUpdateAt = Date.now();
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
        const mappedLabel = document.getElementById('speedLimitMappedLabel');
        const resolution = speedLimit.resolveSpeedDisplay({
            legalEvidence: evidence, legalLimitMph: speedLimitInMph,
            mappedObservation: observation && observation.evidence_state === 'MAPPED_OBSERVATION' ? observation : null,
            routeObservation: observation && observation.evidence_state === 'ROUTE_OBSERVATION' ? observation : null,
        });
        if (mappedLabel) {
            mappedLabel.hidden = !resolution.badge;
            mappedLabel.textContent = resolution.badge;
            mappedLabel.title = resolution.title;
        }
        const circle = document.getElementById('speedLimitCircle');
        if (circle) {
            circle.style.borderColor = resolution.badge ? '#777' : '#E53935';
            circle.title = resolution.title;
        }
        // Display-only observations never populate the limit used by alerts.
        setCurrentSpeedLimitMph(resolution.legalLimitMph);
        if (limitValueEl && limitUnitEl) {
            const display = resolution.limitMph === null ? null
                : speedLimit.formatSpeedForWidget(resolution.limitMph, rt().getSpeedUnit(), speedGps);
            limitValueEl.textContent = display ? String(speedLimit.sanitizeWidgetDisplayNumber(display.value)) : '—';
            limitUnitEl.textContent = display ? display.unitLabel : displaySpeedUnit;
            widget.style.borderLeft = resolution.kind === 'LEGAL' ? '4px solid #4285F4' : '4px solid #999';
        }

        updateSpeedWidgetVisibility();
    }

    function updateSpeedWidgetVisibility() {
        const widget = document.getElementById('speedWidget');
        if (!widget) return;

        const active = rt().getIsTrackingActive() || rt().getRouteInProgress();
        const shouldShow = getSpeedWidgetEnabled();
        const gpsButton = document.getElementById('speedWidgetUseGps');
        if (gpsButton) gpsButton.hidden = !!active;
        const state = document.getElementById('speedWidgetState');
        const unit = rt().call.getSpeedUnit();
        if (!active) {
            _lastSpeedWidgetUpdateAt = 0;
            setCurrentSpeedLimitMph(null);
            for (const id of ['speedValue','speedLimitValue']) {
                const el=document.getElementById(id);if(el)el.textContent='—';
            }
            for (const id of ['speedUnitDisplay','speedLimitUnit']) {
                const el=document.getElementById(id);if(el)el.textContent=unit;
            }
            const mapped=document.getElementById('speedLimitMappedLabel');if(mapped)mapped.hidden=true;
            const circle=document.getElementById('speedLimitCircle');if(circle){circle.style.borderColor='#777';circle.title='Enable GPS to check your current location';}
            widget.style.borderLeft='4px solid #999';
            if(state)state.textContent='GPS off';
        } else if(state) {
            const value=document.getElementById('speedLimitValue')?.textContent;
            state.textContent=!_lastSpeedWidgetUpdateAt ? 'Waiting for GPS' : value==='—' ? 'Limit unavailable' : '';
        }
        if (state) state.hidden = !state.textContent;
        if (shouldShow !== _lastSpeedWidgetVisible) {
            widget.style.display = shouldShow ? 'block' : 'none';
            _lastSpeedWidgetVisible = shouldShow;
        }
    }

    function useGpsForSpeedWidget() {
        // Reuse the existing GPS owner, and never toggle an active watch off.
        if (!rt().getIsTrackingActive()) root.VoyagrGpsOrchestration?.startGPSTracking();
        updateSpeedWidgetVisibility();
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
        if (Object.prototype.hasOwnProperty.call(patch,'currentLimitMph') && state) {
            state.currentLimitMph = patch.currentLimitMph;
        }
        if (Object.prototype.hasOwnProperty.call(patch,'currentSpeedLimitMph')) {
            setCurrentSpeedLimitMph(patch.currentSpeedLimitMph);
        }

        if (outcomeApply.widgetUpdate) {
            updateSpeedWidget(
                outcomeApply.widgetUpdate.displaySpeedMph,
                outcomeApply.widgetUpdate.shownLimit, outcomeApply.legalEvidence, outcomeApply.speedObservation
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

    function updateSpeedLimitStatus(known, observation, routeLimit) {
        const el=document.getElementById('routeSpeedLimitStatus');
        if (!el) return;
        const gps=root.VoyagrGpsOrchestration;
        const position=gps && gps.getNavigationPositionEvidence ? gps.getNavigationPositionEvidence() : null;
        const fix=gps && gps.getAcceptedOriginFix ? gps.getAcceptedOriginFix() : null;
        const source=known ? 'mapped road' : observation && observation.evidence_state==='ROUTE_OBSERVATION' ? (observation.position_uncertain ? 'route estimate (GPS imprecise)' : 'selected route')
            : observation ? (observation.source==='TomTom' ? 'primary provider estimate (road uncertain)' : observation.position_uncertain ? 'mapped estimate (road uncertain)' : 'mapped observation') : 'unavailable';
        let text='Speed display: '+source+'. Route-section limit: '+(observation && observation.evidence_state==='ROUTE_OBSERVATION' || Number.isFinite(routeLimit) && routeLimit>0 ? 'available' : 'not supplied')+'.';
        text+=' GPS route position: '+(position && position.state || 'waiting')+'.';
        if (position && position.reason && source==='unavailable') text+=' '+position.reason+'.';
        if (fix && Number.isFinite(fix.accuracy) && fix.accuracy>=0 && root.VoyagrUnits) {
            text+=' GPS accuracy: '+root.VoyagrUnits.formatPreferredDistanceMeters(fix.accuracy)+'.';
        }
        el.textContent=text;
        const dataStatus=document.getElementById('routeSpeedDataStatus');
        if(dataStatus)try{
            const suppliedSteps=typeof rt().getCurrentRouteSteps==='function' ? rt().getCurrentRouteSteps() : null;
            const steps=Array.isArray(suppliedSteps)?suppliedSteps:[];
            const count=steps.filter(step=>step&&Number.isFinite(step.speed_limit)&&step.speed_limit>0&&step.speed_limit<=100).length;
            const shape=position&&position.snap&&position.snap.index;
            const idx=Number.isInteger(shape)&&shape>=0 ? SG().getActiveRouteManeuverIndex(steps,shape) : -1;
            const owner=root.VoyagrRoadMatchOrchestration;
            const context=owner&&owner.getSpeedContextStatus ? owner.getSpeedContextStatus() : null;
            let detail='Navigation active: '+(rt().getRouteInProgress()?'yes':'no')+'. Route steps carrying limits: '+count+'/'+steps.length+'.';
            detail+=' GPS-derived step: '+(idx>=0?String(idx+1):'unavailable')+'.';
            if(context)detail+=' Road data: '+context.state+' ('+context.roadCount+' ways). Road match: '+context.matchState+'. '+context.matchReason+'.';
            if(owner&&owner.getPrimarySpeedStatus)detail+=' Primary provider: '+owner.getPrimarySpeedStatus()+'.';
            if(context&&context.speedReasonCode)detail+=' Mapped observation: '+context.speedReason+' ('+context.speedReasonCode+').';
            dataStatus.textContent=detail;
        }catch(_){dataStatus.textContent='Speed details unavailable.';}
        const mapStatus=document.getElementById('routeMapRenderStatus');
        if(mapStatus && typeof root.__voyagrMapGetDiagnostics==='function') {
            try {
                const state=root.__voyagrMapGetDiagnostics();
                mapStatus.textContent='Map renderer: '+(state.contextLost===true ? 'graphics context lost' : state.contextLost!==false ? 'graphics status unavailable' : state.canvas && (!state.canvas.width || !state.canvas.height) ? 'canvas has no size' : state.isStyleLoaded ? 'style loaded' : 'style loading')+'.';
            } catch(_){mapStatus.textContent='Map renderer: status unavailable.';}
        }
    }

    function refreshFromNavigationPosition() {
        const gps=root.VoyagrGpsOrchestration;
        const fix=gps && gps.getAcceptedOriginFix();
        const position=gps && gps.getNavigationPositionEvidence();
        if (!fix || !rt().getIsTrackingActive() && !rt().getRouteInProgress()) return false;
        const age=Date.now()-fix.timestamp;
        if (!Number.isFinite(age) || age< -1000 || age>15000) return false;
        const speed=getCurrentGpsSpeedMph();
        const steps=rt().getCurrentRouteSteps();
        const idx=position && position.state==='RELIABLE' && position.snap
            ? SG().getActiveRouteManeuverIndex(steps,position.snap.index) : -1;
        const step=steps && steps[idx];
        const roadType=step && step.road_class || 'unknown';
        const limit=step ? normalizeManeuverSpeedLimitMph(step.speed_limit,roadType,speed) : null;
        fetchSpeedLimitThrottled(fix.lat,fix.lon,speed,roadType,limit,null);
        return !!root.VoyagrRoadMatchOrchestration;
    }

    function fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType, valhallaSpeedLimit, headingDeg) {
        if (root.VoyagrRoadMatchOrchestration) {
            var legal=null;
            var selection=SL().resolveSpeedSources({
                primary:function(){
                    var owner=root.VoyagrRoadMatchOrchestration;
                    var observation=owner.getPrimarySpeedObservation ? owner.getPrimarySpeedObservation() : null;
                    if(observation&&SG().isPlausibleEdgeSpeedLimitMph&&!SG().isPlausibleEdgeSpeedLimitMph(observation.speed_limit_mph,roadType,currentSpeedMph))return null;
                    return observation;
                },
                legal:function(){
                    var bundle=root.VoyagrRoadMatchOrchestration.getAttributes();
                    legal=bundle && bundle.speed;return legal;
                },
                mapped:function(){
                    var owner=root.VoyagrRoadMatchOrchestration;
                    return owner.getSpeedObservation ? owner.getSpeedObservation() : null;
                },
                route:function(){
                    var gps=root.VoyagrGpsOrchestration;
                    return gps && gps.getRouteSpeedObservation ? gps.getRouteSpeedObservation(valhallaSpeedLimit) : null;
                }
            });
            var known=selection.kind==='LEGAL';
            applySpeedLimitFetchOutcomeFromPlan(SL().buildSpeedSelectionApplyPlan(selection,legal,currentSpeedMph));
            updateSpeedLimitStatus(known,selection.observation,valhallaSpeedLimit);
            return;
        }
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
                const p=data && data.success && data.data;
                const selection=SL().resolveSpeedApiResponse(data);
                acceptIfFresh(SL().buildSpeedSelectionApplyPlan(selection,p,ctx.currentGpsSpeedMph));
            })
            .catch(() => {
                acceptIfFresh(SL().buildSpeedSelectionApplyPlan(null,null,ctx.currentGpsSpeedMph));
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
        useGpsForSpeedWidget: useGpsForSpeedWidget,
        getCurrentRoadType: getCurrentRoadType,
        getManeuverStreetLabel: getManeuverStreetLabel,
        normalizeManeuverSpeedLimitMph: normalizeManeuverSpeedLimitMph,
        applySpeedLimitFetchOutcomeFromPlan: applySpeedLimitFetchOutcomeFromPlan,
        fetchSpeedLimitThrottled: fetchSpeedLimitThrottled,
        refreshFromNavigationPosition: refreshFromNavigationPosition,
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
