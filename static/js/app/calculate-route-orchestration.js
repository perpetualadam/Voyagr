/**
 * @file Calculate-route orchestration (preflight, fetch, preview map, in-nav reroute).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    var routeLayer = null;
    var startMarker = null;
    var endMarker = null;

    function getRouteLayer() { return routeLayer; }
    function setRouteLayer(val) { routeLayer = val; }
    function getStartMarker() { return startMarker; }
    function setStartMarker(val) { startMarker = val; }
    function getEndMarker() { return endMarker; }
    function setEndMarker(val) { endMarker = val; }

    function rt() {
        if (!runtime) {
            throw new Error('[CalculateRoute] Orchestration runtime not bound');
        }
        return runtime;
    }

    function polylineCodecModule() { return rt().polylineCodec(); }

    function decodePolyline(encoded, precision) {
        if (precision === undefined) precision = 6;
        if (!encoded || typeof encoded !== 'string') {
            console.warn('[decodePolyline] Invalid input:', encoded);
            return [];
        }
        return polylineCodecModule().decodePolyline(encoded, precision);
    }

    function applyMapClickLocationPickerFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        var inputEl = document.getElementById(apply.inputId);
        if (inputEl) inputEl.value = apply.inputValue;

        if (apply.removeExistingMarker) {
            var startMarker = rt().getStartMarker();
            var endMarker = rt().getEndMarker();
            if (apply.markerTarget === 'start' && startMarker && typeof startMarker.remove === 'function') {
                startMarker.remove();
            }
            if (apply.markerTarget === 'end' && endMarker && typeof endMarker.remove === 'function') {
                endMarker.remove();
            }
        }

        var map = rt().getMap();
        var marker = rt().getMapLibreHelpers().createCircleMarker(apply.lat, apply.lon, apply.markerOptions).addTo(map);
        if (apply.markerTarget === 'start') {
            rt().setStartMarker(marker);
        } else {
            rt().setEndMarker(marker);
        }

        if (apply.clearMapPickerMode) rt().setMapPickerMode(null);
        if (apply.collapseBottomSheet) rt().call.collapseBottomSheet();
        rt().call.showStatus(apply.successStatusMessage, apply.successStatusType);
    }

    function setupMapClickHandler() {
        var map = rt().getMap();
        if (!map) {
            console.log('[Map] Map not initialized yet, deferring click handler setup');
            return;
        }

        var GL = rt().geocodingLocations();
        map.on('click', function (e) {
            var dispatch = GL.buildMapClickDispatchPlan({
                addingViaPoint: rt().call.getAddingViaPoint(),
                addingStop: rt().call.getAddingStop(),
                mapPickerMode: rt().getMapPickerMode(),
                lat: e.lngLat.lat,
                lon: e.lngLat.lng,
            });

            if (dispatch.action === 'waypoint') {
                rt().call.handleMapClickForWaypoints(e);
                return;
            }

            if (dispatch.action === 'location_picker') {
                applyMapClickLocationPickerFromPlan(
                    GL.buildMapClickLocationPickerApplyPlan(dispatch)
                );
            }
        });
    }

    function applyRouteProgressShowFromPlan(apply) {
        if (!apply || !apply.shouldShow) return;

        var progressContainer = document.getElementById(apply.containerId);

        if (!progressContainer && apply.mountIfMissing) {
            progressContainer = document.createElement('div');
            progressContainer.id = apply.containerId;
            progressContainer.style.cssText = apply.containerStyleCssText;
            progressContainer.innerHTML = apply.innerHtml;

            if (apply.animationStyleId && apply.animationKeyframes &&
                !document.getElementById(apply.animationStyleId)) {
                var style = document.createElement('style');
                style.id = apply.animationStyleId;
                style.textContent = apply.animationKeyframes;
                document.head.appendChild(style);
            }

            document.body.appendChild(progressContainer);
        }

        if (progressContainer) progressContainer.style.display = 'block';
        if (apply.showLogMessage) console.log(apply.showLogMessage);
    }

    function showRouteProgressBar() {
        applyRouteProgressShowFromPlan(
            rt().routeProgress().buildRouteProgressShowOrchestrationPlan().apply
        );
    }

    function applyRouteProgressHideFromPlan(apply) {
        if (!apply || !apply.shouldHide) return;

        var progressContainer = document.getElementById(apply.containerId);
        if (progressContainer) progressContainer.style.display = 'none';
        if (apply.hideLogMessage) console.log(apply.hideLogMessage);
    }

    function hideRouteProgressBar() {
        applyRouteProgressHideFromPlan(
            rt().routeProgress().buildRouteProgressHideOrchestrationPlan().apply
        );
    }

    function applyCalculateRouteInNavRerouteFromPlan(plan) {
        if (!plan || !plan.shouldApply) {
            if (plan && plan.noRouteErrorMessage) {
                rt().call.showStatus(plan.noRouteErrorMessage, 'error');
            }
            return;
        }

        if (plan.hideRouteProgressBar) hideRouteProgressBar();
        if (plan.updateRouteOnMap) rt().call.updateRouteOnMap(plan.activeRoute);

        window.lastCalculatedRoute = Object.assign({}, window.lastCalculatedRoute, plan.lastCalculatedRoutePatch);

        if (plan.speakMessage) {
            rt().call.speakMessage(plan.speakMessage, 'high');
        }

        rt().call.showStatus(plan.statusMessage, plan.statusType);
        if (plan.recentDestination) {
            try {
                rt().call.recordRecentDestination(
                    plan.recentDestination.label,
                    plan.recentDestination.lat,
                    plan.recentDestination.lon,
                    plan.recentDestination.kind
                );
            } catch (_e) { /* ignore */ }
        }
    }

    function applyCalculateRouteInNavRerouteOutcome(data, geocodedEnd, end) {
        var RS = rt().routeSelection();
        var orch = RS.buildCalculateRouteInNavRerouteOrchestrationPlan({
            activeRoute: rt().call.pickActiveRouteDuringNavigation(data.routes, data),
            data: data,
            geocodedEnd: geocodedEnd,
            destinationLabel: end,
            voiceOpts: rt().getVoiceAnnouncementsEnabled()
                ? { enabled: true, convertDistance: rt().call.convertDistance, distUnit: rt().call.getDistanceUnit() }
                : { enabled: false },
        });
        applyCalculateRouteInNavRerouteFromPlan(orch.execute);
    }

    function applyCalculateRouteIdleUiFromPlan(idleUiPlan, data) {
        var plan = rt().routeSelection().buildCalculateRouteIdleUiOrchestrationPlan(idleUiPlan).execute;
        if (!plan.shouldExecute) return;

        var delayMs = plan.delayedPreview?.delayMs ?? 300;
        setTimeout(function () {
            rt().call.showRoutePreview(data);
            if (plan.updateArButtonVisibility) {
                rt().call.updateARButtonVisibility();
            }
        }, delayMs);

        if (plan.hideRouteProgressBar) hideRouteProgressBar();

        if (plan.showStartNavButtons) {
            (plan.startNavButtonIds || []).forEach(function (id) {
                var btn = document.getElementById(id);
                if (btn) btn.style.display = 'block';
            });
        }
        if (plan.updateRoadReportFabVisibility) {
            rt().call.updateRoadReportFabVisibility();
        }

        var notification = plan.notification;
        if (notification) {
            console.log(plan.notificationLogPrefix, notification.message);
            rt().call.sendNotification(notification.title, notification.message, notification.type);
        }

        try {
            (plan.recentDestinations || []).forEach(function (dest) {
                rt().call.recordRecentDestination(dest.label, dest.lat, dest.lon, dest.kind);
            });
        } catch (_e) { /* ignore */ }
    }

    function applyRoutePreviewMapFromPlan(plan) {
        var executePlan = rt().previewMarker().buildRoutePreviewMapExecutePlan(plan);
        if (!executePlan.shouldExecute) return false;

        var startMarker = rt().getStartMarker();
        var endMarker = rt().getEndMarker();
        var routeLayer = rt().getRouteLayer();

        if (executePlan.removeExistingMarkers) {
            if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
            if (endMarker && typeof endMarker.remove === 'function') endMarker.remove();
            if (routeLayer && typeof routeLayer.remove === 'function') routeLayer.remove();
        }

        var map = rt().getMap();
        var mapLibre = rt().getMapLibreHelpers();
        var createEndpointMarker = function (markerPlan) {
            var opts = markerPlan.options;
            var marker = mapLibre.createCircleMarker(markerPlan.lat, markerPlan.lon, {
                radius: opts.radius,
                fillColor: opts.fillColor,
                color: opts.color,
                weight: opts.weight,
                fillOpacity: opts.fillOpacity,
            }).addTo(map);
            marker.bindPopup(opts.popup);
            return marker;
        };

        if (executePlan.startMarker) {
            rt().setStartMarker(createEndpointMarker(executePlan.startMarker));
        }
        if (executePlan.endMarker) {
            rt().setEndMarker(createEndpointMarker(executePlan.endMarker));
        }

        if (executePlan.pathLog) {
            if (executePlan.pathLog.level === 'error') {
                console.error(executePlan.pathLog.message);
            } else {
                console.log(executePlan.pathLog.message);
            }
        }

        if (executePlan.requiresMap && !map) {
            console.error(executePlan.mapMissingLogMessage);
            rt().call.showStatus(executePlan.mapMissingStatusMessage, 'error');
            return false;
        }

        if (executePlan.fitBounds && map) {
            mapLibre.fitMapBounds(map, executePlan.fitBounds.routePath, { padding: executePlan.fitBounds.padding });
            rt().setLastZoomLevel(map.getZoom());
        }

        return true;
    }

    function applyCalculateRouteIdlePreviewErrorFromPlan(postMap) {
        if (!postMap || postMap.shouldApply) return false;
        rt().call.showStatus(postMap.errorStatusMessage, 'error');
        if (postMap.hideRouteProgressBarOnError) hideRouteProgressBar();
        return true;
    }

    function applyCalculateRouteIdlePreviewRouteOptionsFromPlan(routeOpts, data) {
        if (!routeOpts || !routeOpts.shouldBuild) return;

        var RS = rt().routeSelection();
        if (routeOpts.multiRouteLogMessage) {
            console.log(routeOpts.multiRouteLogMessage);
            rt().setRouteOptions(RS.buildRouteOptionsFromApiResponse(
                data, rt().call.decodePolyline, routeOpts.routePath
            ));
            console.log(
                routeOpts.loadedRoutesLogPrefix + rt().getRouteOptions().length +
                ' real routes from ' + data.source + ':',
                rt().getRouteOptions().map(function (r) { return r.name; })
            );
            return;
        }

        rt().setRouteOptions(RS.buildRouteOptionsFromApiResponse(
            data, rt().call.decodePolyline, routeOpts.routePath
        ));
        if (routeOpts.fallbackRouteLogMessage) console.log(routeOpts.fallbackRouteLogMessage);
    }

    function applyCalculateRouteIdlePreviewPostMapFromPlan(postMap, data, idleUiApplyPlan) {
        if (!postMap || !postMap.shouldApply) return;

        if (postMap.multiDropStopLogMessage) console.log(postMap.multiDropStopLogMessage);
        rt().call.updateTripInfo(
            postMap.tripInfo.distance,
            postMap.tripInfo.displayTime,
            postMap.tripInfo.fuelCost,
            postMap.tripInfo.tollCost
        );
        rt().call.showStatus(postMap.statusMessage, 'success');

        if (postMap.showMultiDropLegs) rt().call.displayMultiDropLegs(data);
        if (postMap.storeLastRouteApiResponse) window.lastRouteApiResponse = data;
        window.lastCalculatedRoute = postMap.lastCalculatedRoutePatch;
        if (postMap.durationLogMessage) console.log(postMap.durationLogMessage);
        if (postMap.displayPrimaryHazards) rt().call.displayHazardMarkers(postMap.primaryHazards);

        applyCalculateRouteIdlePreviewRouteOptionsFromPlan(postMap.routeOptionsApply, data);
        applyCalculateRouteIdleUiFromPlan(idleUiApplyPlan, data);
    }

    function applyCalculateRouteIdlePreviewFromPlan(orch, data) {
        var postMap = orch.postMapApply
            || rt().routeSelection().buildCalculateRouteIdlePreviewPostMapApplyPlan(orch.execute);
        if (applyCalculateRouteIdlePreviewErrorFromPlan(postMap)) return;

        var mapApplied = applyRoutePreviewMapFromPlan(
            rt().previewMarker().buildRoutePreviewMapApplyPlan(orch.mapApplyInput)
        );
        if (!mapApplied) return;

        applyCalculateRouteIdlePreviewPostMapFromPlan(postMap, data, orch.idleUiApplyPlan);
    }

    function applyCalculateRouteIdlePreviewOutcome(data, labels) {
        try {
            var GL = rt().geocodingLocations();
            var orch = rt().routeSelection().buildCalculateRouteIdlePreviewOrchestrationPlan({
                input: {
                    geocodedStart: labels.geocodedStart,
                    geocodedEnd: labels.geocodedEnd,
                    startLabel: labels.start,
                    endLabel: labels.end,
                    data: data,
                    parseLatLonPair: GL.parseLatLonPairString.bind(GL),
                    invalidFormatMessage: GL.getInvalidCoordinatesFormatStatusMessage(),
                    invalidCoordsMessage: GL.getInvalidCoordinatesStatusMessage(),
                    decodePolyline: rt().call.decodePolyline,
                    convertDistance: rt().call.convertDistance,
                    distUnit: rt().call.getDistanceUnit(),
                    currencySymbol: rt().call.getCurrencySymbol(),
                    parseDurationMinutes: rt().routeSharing().parseSharedRouteDurationMinutes,
                },
                data: data,
            });
            applyCalculateRouteIdlePreviewFromPlan(orch, data);
        } catch (e) {
            var errApply = rt().routeSelection().buildCalculateRouteIdlePreviewParseErrorApplyPlan(e);
            rt().call.showStatus(errApply.statusMessage, errApply.statusType);
            console.error(errApply.logPrefix, e);
            if (errApply.hideRouteProgressBar) hideRouteProgressBar();
        }
    }

    function applyCalculateRouteResponseFromPlan(apply, data, labels) {
        if (!apply || !apply.shouldApply) return;

        console.log(apply.responseLogPrefix, apply.responseLogMeta);

        if (apply.degradedLogWarning) {
            console.warn(
                apply.degradedLogWarning.warning,
                apply.degradedLogWarning.engines
            );
        }
        if (apply.degradedStatusMessage) {
            rt().call.showStatus(apply.degradedStatusMessage, 'warning');
        }

        if (apply.branch === 'error') {
            rt().call.showStatus(apply.statusMessage, apply.statusType);
            if (apply.hideRouteProgressBar) hideRouteProgressBar();
            return;
        }

        if (apply.branch === 'in_nav_reroute') {
            if (apply.inNavRerouteLogMessage) console.log(apply.inNavRerouteLogMessage);
            applyCalculateRouteInNavRerouteOutcome(data, labels.geocodedEnd, labels.end);
            return;
        }

        applyCalculateRouteIdlePreviewOutcome(data, labels);
    }

    function applyCalculateRoutePreflightFromPlan(preflightApply) {
        if (!preflightApply) return false;

        console.log(preflightApply.entryLogMessage);
        (preflightApply.debugLogs || []).forEach(function (entry) {
            console.log(entry.prefix, entry.value);
        });

        if (!preflightApply.shouldProceed) {
            rt().call.showStatus(preflightApply.statusMessage, preflightApply.statusType);
            if (preflightApply.missingInputsLogMessage) {
                console.error(preflightApply.missingInputsLogMessage);
            } else if (preflightApply.geocodingBusyLogMessage) {
                console.warn(preflightApply.geocodingBusyLogMessage);
            }
            return false;
        }

        console.log(preflightApply.geocodeCallLogMessage);
        return true;
    }

    function applyCalculateRouteLoadingFromPlan(loadingApply) {
        if (!loadingApply || !loadingApply.shouldApply) return;
        rt().call.showStatus(loadingApply.statusMessage, loadingApply.statusType);
        if (loadingApply.showRouteProgressBar) showRouteProgressBar();
    }

    async function applyCalculateRouteFetchHttpResponse(response, fetchPlan) {
        var RR = rt().routingRequest();
        var plan = RR.buildCalculateRouteFetchHttpResponsePlan({
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
        }, fetchPlan);

        console.log(plan.statusLogPrefix, response.status);

        if (plan.action === 'reject_non_json') {
            var text = await response.text();
            console.error(plan.nonJsonErrorLogPrefix, plan.contentType);
            console.error(plan.responseTextLogPrefix, text.substring(0, 200));
            throw new Error(RR.buildNonJsonRouteApiErrorMessage(plan.status, text));
        }

        if (plan.action === 'reject_http_error') {
            var errText = await response.text();
            throw new Error(RR.parseRouteApiErrorMessage(plan.status, errText));
        }

        return response.json();
    }

    function collectCalculateRouteApiInput(geocodedStart, geocodedEnd) {
        return rt().routingRequest().buildCalculateRouteApiInputCollectPlan({
            storage: localStorage,
            geocodedStart: geocodedStart,
            geocodedEnd: geocodedEnd,
            viaPoints: rt().call.getViaPoints(),
            stops: rt().call.getStops(),
            routingMode: rt().getCurrentRoutingMode(),
            vehicleType: rt().getCurrentVehicleType(),
            costParams: rt().call.getRouteCostParams(rt().getCurrentVehicleType()),
            avoidTolls: rt().call.isAvoidTollsEnabled(),
            routePrefs: rt().call.getRoutePreferences(),
            routeInProgress: rt().getRouteInProgress(),
            isTrackingActive: rt().getIsTrackingActive(),
            trackingHistory: rt().getTrackingHistory(),
            currentLat: rt().getCurrentLat(),
            currentLon: rt().getCurrentLon(),
        });
    }

    function applyCalculateRouteFetchErrorFromPlan(errApply, error) {
        if (!errApply) return;
        rt().call.showStatus(errApply.statusMessage, errApply.statusType);
        console.error(errApply.logPrefix, error);
        if (errApply.hideRouteProgressBar) hideRouteProgressBar();
    }

    async function calculateRoute() {
        var RR = rt().routingRequest();
        var startInput = document.getElementById('start');
        var endInput = document.getElementById('end');
        var preflightOrch = RR.buildCalculateRoutePreflightOrchestrationPlan(
            RR.buildCalculateRouteInputCollectPlan({ startInput: startInput, endInput: endInput }),
            rt().getIsGeocoding()
        );

        if (!applyCalculateRoutePreflightFromPlan(preflightOrch.apply)) return;

        var start = preflightOrch.collect.start;
        var end = preflightOrch.collect.end;

        var geocodedResult = await rt().call.geocodeLocations(start, end);
        if (!geocodedResult) {
            console.error('[calculateRoute] ERROR: geocodeLocations returned null');
            return;
        }

        var geocodedStart = geocodedResult.start;
        var geocodedEnd = geocodedResult.end;

        console.log('[calculateRoute] Geocoded start:', geocodedStart);
        console.log('[calculateRoute] Geocoded end:', geocodedEnd);

        applyCalculateRouteLoadingFromPlan(
            RR.buildCalculateRouteLoadingApplyPlan(RR.buildCalculateRouteLoadingExecutePlan())
        );

        var apiOrch = RR.buildCalculateRouteApiOrchestrationPlan(
            collectCalculateRouteApiInput(geocodedStart, geocodedEnd)
        );
        var routePlan = apiOrch.routePlan;
        var fetchPlan = apiOrch.fetchPlan;
        var requestLog = apiOrch.requestLog;

        console.log(requestLog.requestLogPrefix, fetchPlan.body);
        console.log(requestLog.viaPointsLogMessage);
        console.log(requestLog.multiDropLogMessage);

        return fetch(fetchPlan.apiPath, {
            method: fetchPlan.method,
            headers: fetchPlan.headers,
            body: JSON.stringify(fetchPlan.body),
        })
            .then(function (response) { return applyCalculateRouteFetchHttpResponse(response, fetchPlan); })
            .then(function (data) {
                applyCalculateRouteResponseFromPlan(
                    RR.buildCalculateRouteResponseApplyPlan(
                        RR.buildCalculateRouteResponseExecutePlan(data, rt().getRouteInProgress())
                    ),
                    data,
                    { geocodedStart: geocodedStart, geocodedEnd: geocodedEnd, start: start, end: end }
                );
            })
            .catch(function (error) {
                applyCalculateRouteFetchErrorFromPlan(
                    RR.buildCalculateRouteFetchErrorApplyPlan(error),
                    error
                );
            });
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        getRouteLayer: getRouteLayer,
        setRouteLayer: setRouteLayer,
        getStartMarker: getStartMarker,
        setStartMarker: setStartMarker,
        getEndMarker: getEndMarker,
        setEndMarker: setEndMarker,
        decodePolyline: decodePolyline,
        setupMapClickHandler: setupMapClickHandler,
        calculateRoute: calculateRoute,
        showRouteProgressBar: showRouteProgressBar,
        hideRouteProgressBar: hideRouteProgressBar,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrCalculateRouteOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
