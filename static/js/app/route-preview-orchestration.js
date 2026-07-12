/**
 * @file Route preview panel, comparison modal, and overview orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[RoutePreview] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RS() { return rt().routeSelection(); }
    function RR() { return rt().routingRequest(); }
    function RSh() { return rt().routeSharing(); }

function applyRouteUpdateDuringNavigation(routeData) {
    const routeSel = RS();
    const activeRoute = rt().call.pickActiveRouteDuringNavigation(routeData.routes, routeData);
    const plan = routeSel.buildRouteUpdateDuringNavigationExecutePlan(
        activeRoute,
        routeData,
        window.lastCalculatedRoute
    );

    console.log(plan.entryLogMessage);

    if (!plan.shouldExecute) {
        rt().call.showStatus(plan.errorStatusMessage, 'error');
        return;
    }

    if (plan.updateRouteOnMap) {
        rt().call.updateRouteOnMap(plan.activeRoute);
    }

    if (plan.patchLastCalculatedRoute) {
        window.lastCalculatedRoute = plan.lastCalculatedRoutePatch;
    }

    rt().call.showStatus(plan.statusMessage, plan.statusType);
}

/**
 * Mount the route comparison modal from a pure DOM apply plan.
 * @param {Object} domPlan - from buildRouteComparisonModalDomApplyPlan
 * @returns {HTMLElement|null}
 */
function applyRouteComparisonModalFromPlan(domPlan) {
    const plan = RS().buildRouteComparisonModalExecutePlan(domPlan);
    if (!plan.shouldExecute) return null;
    if (plan.removeExisting) {
        const existing = document.getElementById(plan.modalId);
        if (existing) existing.remove();
    }
    const modal = document.createElement('div');
    modal.id = plan.modalId;
    modal.style.cssText = plan.overlayStyle;
    modal.innerHTML = plan.innerHtml;
    if (plan.dismissOnOverlayClick) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }
    document.body.appendChild(modal);
    return modal;
}

/**
 * Apply alternative-route preview cards from a pure DOM apply plan.
 * @param {Object} domPlan - from buildAlternativeRoutesPreviewDomApplyPlan
 */
function applyAlternativeRoutesPreviewDomFromPlan(domPlan) {
    const executePlan = RS().buildAlternativeRoutesPreviewDomExecutePlan(domPlan);
    if (!executePlan.shouldExecute) return;

    const container = document.getElementById(executePlan.listContainerId);
    const parentContainer = document.getElementById(executePlan.parentContainerId);
    if (!parentContainer || !container) return;

    if (!executePlan.showContainer) {
        parentContainer.style.display = executePlan.containerDisplay;
        return;
    }

    container.innerHTML = '';
    executePlan.cardPlans.forEach((plan, index) => {
        const div = document.createElement('div');
        div.style.cssText = plan.containerStyle;
        div.innerHTML = plan.html;
        div.onmouseover = () => {
            div.style.borderColor = plan.hoverStyle.borderColor;
            div.style.background = plan.hoverStyle.background;
        };
        div.onmouseout = () => {
            div.style.borderColor = plan.restStyle.borderColor;
            div.style.background = plan.restStyle.background;
        };
        div.onclick = () => {
            rt().call.selectRoute(index);
            rt().call.useRoute(index);
        };
        container.appendChild(div);
    });

    parentContainer.style.display = executePlan.containerDisplay;
}

/**
 * Run post-preview UI actions (tab, sheet, traffic) from a pure plan.
 * @param {Object} afterPlan - from buildRoutePreviewAfterDisplayPlan
 */
function applyRoutePreviewAfterDisplayFromPlan(afterPlan) {
    const plan = RS().buildRoutePreviewAfterDisplayExecutePlan(afterPlan);
    if (!plan.shouldExecute) return;

    if (plan.switchToPreviewTab) {
        rt().call.switchTab('routePreview');
    }
    if (plan.expandBottomSheet) {
        rt().call.expandBottomSheet();
    }
    if (plan.addTrafficLayer) {
        rt().call.addTrafficLayer();
    }
    if (plan.previewTraffic && rt().getRouteOptions() && rt().getRouteOptions().length > 0) {
        const previewPolyline = rt().getRouteOptions()[plan.previewPolylineRouteIndex || 0].polyline;
        if (previewPolyline && previewPolyline.length > 0) {
            rt().setRoutePolyline(previewPolyline);
            if (plan.previewTrafficLogMessage) console.log(plan.previewTrafficLogMessage);
            rt().call.fetchAndDisplayRouteTraffic();
        }
    }
}

function collectShowRoutePreviewInput(routeData, skipMapDisplay) {
    const routeSel = RS();
    const previewRoute = routeSel.resolvePreviewRoute(routeData, rt().getSelectedRouteIndex());
    return {
        routeData,
        skipMapDisplay,
        routeInProgress: rt().getRouteInProgress(),
        selectedRouteIndex: rt().getSelectedRouteIndex(),
        currencySymbol: rt().call.getCurrencySymbol(),
        distanceText: rt().call.convertDistance(routeSel.resolvePreviewDistanceKm(routeData, previewRoute)) + ' ' + rt().call.getDistanceUnit(),
        startLabel: document.getElementById('start').value,
        endLabel: document.getElementById('end').value,
        routingMode: rt().getCurrentRoutingMode(),
        vehicleType: rt().getCurrentVehicleType(),
        distanceUnit: rt().getDistanceUnitValue(),
        preferencesApplied: localStorage.getItem('pref_cameras') !== 'false',
        routeOptionsCount: rt().getRouteOptions() ? rt().getRouteOptions().length : 0,
        routeOptions: rt().getRouteOptions(),
        showTrafficEnabled: rt().getShowTrafficEnabled(),
        hasTrafficLayer: !!rt().getTrafficLayer(),
        routeTrafficEnabled: rt().call.getTrafficSettingsSnapshot().routeTrafficEnabled,
    };
}

function applyShowRoutePreviewFromPlan(apply, routeData, skipMapDisplay) {
    if (!apply || !apply.shouldApply) {
        if (apply && apply.delegateToNavUpdate) {
            applyRouteUpdateDuringNavigation(routeData);
            return;
        }
        if (apply && apply.errorStatusMessage) {
            rt().call.showStatus(apply.errorStatusMessage, 'error');
        }
        if (apply && apply.errorLogMessage) console.error(apply.errorLogMessage);
        return;
    }

    const routeSel = RS();
    if (apply.entryLogMessage) {
        console.log(apply.entryLogMessage, routeData, 'skipMapDisplay:', skipMapDisplay);
    }
    console.log('[Route Preview] Currency:', apply.panelInput.currencySymbol, 'Distance Unit:', rt().call.getDistanceUnit());

    const panelPlan = routeSel.buildRoutePreviewPanelApplyPlan(apply.panelInput);
    const domPlan = routeSel.buildRoutePreviewPanelDomApplyPlan(panelPlan);
    applyRoutePreviewPanelDomFromPlan(domPlan);
    console.log('[Cost] Route preview costs:', domPlan.costLog);

    if (apply.showAlternativeRoutesWhenMultiple && domPlan.previewAlternativeRoutesContainer.showAlternativeRoutes) {
        showAlternativeRoutesInPreview();
        if (apply.alternativeRoutesLogMessage) console.log(apply.alternativeRoutesLogMessage);
    }

    if (apply.showMapRoutes && domPlan.showMapRoutes) {
        rt().call.displayAllRoutesOnMap();
        if (apply.mapRoutesLogMessage) console.log(apply.mapRoutesLogMessage);
    }

    if (apply.switchTabLogMessage) console.log(apply.switchTabLogMessage);
    applyRoutePreviewAfterDisplayFromPlan(routeSel.buildRoutePreviewAfterDisplayPlan(apply.afterDisplayInput));

    if (apply.successLogMessage) console.log(apply.successLogMessage);
    rt().call.showStatus(domPlan.statusMessage, 'success');
}

/**
 * showRoutePreview function
 * @function showRoutePreview
 * @param {*} routeData - Route data to display in preview
 * @param {boolean} skipMapDisplay - If true, skip displayAllRoutesOnMap (used when selecting a specific route)
 * @returns {*} Return value description
 */
function showRoutePreview(routeData, skipMapDisplay = false) {
    const orch = RS().buildShowRoutePreviewOrchestrationPlan(
        collectShowRoutePreviewInput(routeData, skipMapDisplay)
    );
    applyShowRoutePreviewFromPlan(orch.apply, routeData, skipMapDisplay);
}

function collectShowAlternativeRoutesPreviewInput() {
    return {
        routeCount: rt().getRouteOptions() ? rt().getRouteOptions().length : 0,
        routeOptions: rt().getRouteOptions(),
        routeColors: rt().call.routeColors(),
        currencySymbol: rt().call.getCurrencySymbol(),
        distUnit: rt().call.getDistanceUnit(),
        fuelUnit: rt().getCurrentVehicleType() === 'electric' ? 'kWh' : 'L',
        convertDistance: rt().call.convertDistance,
    };
}

/**
 * showAlternativeRoutesInPreview function
 * @function showAlternativeRoutesInPreview
 * @returns {*} Return value description
 */
function showAlternativeRoutesInPreview() {
    const orch = RS().buildShowAlternativeRoutesPreviewEntryOrchestrationPlan(
        collectShowAlternativeRoutesPreviewInput()
    );
    if (!orch.shouldShow) return;
    applyAlternativeRoutesPreviewDomFromPlan(orch.apply);
}

function collectShowRouteComparisonInput() {
    return {
        routeCount: rt().getRouteOptions() ? rt().getRouteOptions().length : 0,
        routeOptions: rt().getRouteOptions(),
        currencySymbol: rt().call.getCurrencySymbol(),
        distUnit: rt().call.getDistanceUnit(),
        convertDistance: rt().call.convertDistance,
    };
}

function applyShowRouteComparisonEntryFromPlan(apply) {
    if (!apply) return false;
    if (apply.entryLogMessage) console.log(apply.entryLogMessage);
    (apply.debugLogs || []).forEach((log) => console.log(log.prefix, log.value));
    if (!apply.shouldProceed) {
        if (apply.errorLogMessage) console.error(apply.errorLogMessage, apply.routeCount);
        if (apply.errorStatusMessage) rt().call.showStatus(apply.errorStatusMessage, 'error');
        return false;
    }
    if (apply.singleRouteWarning) {
        if (apply.singleRouteLogMessage) console.warn(apply.singleRouteLogMessage);
        if (apply.singleRouteStatusMessage) rt().call.showStatus(apply.singleRouteStatusMessage, 'info');
    }
    return true;
}

async function applyShowRouteComparisonFetchHttpResponse(response) {
    const routingReq = RR();
    const routeSel = RS();
    const contentType = response.headers.get('content-type');
    const plan = routeSel.buildShowRouteComparisonFetchHttpResponsePlan({
        status: response.status,
        ok: response.ok,
        contentType,
        isJson: routingReq.isRouteApiJsonContentType(contentType),
    });

    console.log(plan.statusLogPrefix, response.status);

    if (plan.action === 'reject_non_json') {
        const text = await response.text();
        console.error(plan.nonJsonErrorLogPrefix, plan.contentType);
        console.error(plan.responseTextLogPrefix, text.substring(0, 200));
        throw new Error(routingReq.buildNonJsonRouteApiErrorMessage(plan.status, text));
    }

    if (plan.action === 'reject_http_error') {
        const text = await response.text();
        throw new Error(routingReq.parseRouteApiErrorMessage(plan.status, text));
    }

    return response.json();
}

function applyShowRouteComparisonSuccessFromPlan(successApply) {
    if (!successApply || !successApply.shouldApply) {
        if (successApply && successApply.errorLogMessage) {
            console.error(successApply.errorLogMessage, ...(successApply.errorLogArgs || []));
        }
        if (successApply && successApply.errorStatusMessage) {
            rt().call.showStatus(successApply.errorStatusMessage, 'error');
        }
        return;
    }
    applyRouteComparisonModalFromPlan(successApply.domApplyPlan);
    rt().call.showStatus(successApply.successStatusMessage, 'success');
}

async function showRouteComparison() {
    const routeSel = RS();
    const input = collectShowRouteComparisonInput();
    const orch = routeSel.buildShowRouteComparisonOrchestrationPlan(input.routeCount);
    if (!applyShowRouteComparisonEntryFromPlan(
        routeSel.buildShowRouteComparisonEntryApplyPlan(orch, input)
    )) return;

    try {
        const requestOrch = routeSel.buildShowRouteComparisonRequestOrchestrationPlan(input.routeOptions);
        console.log(orch.routesLogPrefix, requestOrch.routesForComparison);

        const fetchPlan = requestOrch.fetchPlan;
        const response = await fetch(fetchPlan.apiPath, {
            method: fetchPlan.method,
            headers: fetchPlan.headers,
            body: JSON.stringify(fetchPlan.body),
        });

        const data = await applyShowRouteComparisonFetchHttpResponse(response);
        const successPlan = routeSel.buildShowRouteComparisonApiResultExecutePlan(data, {
            currencySymbol: input.currencySymbol,
            distUnit: input.distUnit,
            convertDistance: input.convertDistance,
        });

        if (successPlan.responseLogPrefix) console.log(successPlan.responseLogPrefix, data);

        applyShowRouteComparisonSuccessFromPlan(
            routeSel.buildShowRouteComparisonSuccessApplyPlan(successPlan)
        );
    } catch (error) {
        const errExecute = routeSel.buildShowRouteComparisonErrorExecutePlan(error);
        rt().call.showStatus(errExecute.statusMessage, 'error');
        console.error(errExecute.errorLogPrefix, ...(errExecute.logArgs || []));
    }
}

function applyRouteOverviewFromPlan(apply) {
    const map = rt().getMap();
    if (!apply || !apply.shouldApply) {
        if (apply && apply.statusMessage) rt().call.showStatus(apply.statusMessage, apply.statusType);
        if (apply && apply.errorLogMessage) console.error(apply.errorLogMessage);
        return;
    }

    try {
        rt().getMapLibreHelpers().fitMapBounds(map, apply.routePath, apply.fitBounds);
        rt().call.showStatus(apply.statusMessage, apply.statusType);
        if (apply.successLogPrefix) {
            console.log(apply.successLogPrefix, apply.routePath.length, 'points');
        }
    } catch (error) {
        rt().call.showStatus((apply.catchErrorStatusPrefix || '') + error.message, 'error');
        if (apply.catchErrorLogPrefix) console.error(apply.catchErrorLogPrefix, error);
    }
}

/**
 * overviewRoute function
 * @function overviewRoute
 * @returns {*} Return value description
 */
function overviewRoute() {
    const routeSel = RS();
    const orch = routeSel.buildRouteOverviewOrchestrationPlan(window.lastCalculatedRoute, rt().call.decodePolyline);
    applyRouteOverviewFromPlan(routeSel.buildRouteOverviewApplyPlan(orch));
}

function collectStartNavigationFromPreviewInput() {
    return {
        lastCalculatedRoute: window.lastCalculatedRoute,
        noRouteMessage: 'No route available',
        syncFromSelection: true,
        selectedRouteIndex: rt().getSelectedRouteIndex(),
    };
}

function applyStartNavigationFromPreviewFromPlan(apply) {
    if (!apply || !apply.shouldApply) {
        if (apply && apply.errorStatusMessage) rt().call.showStatus(apply.errorStatusMessage, 'error');
        return;
    }

    if (apply.syncFromSelection) {
        rt().call.syncLastCalculatedRouteFromSelection(apply.selectedRouteIndex);
    }

    apply.hideStartNavButtonIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
    });

    rt().call.startTurnByTurnNavigation(window.lastCalculatedRoute);

    if (apply.collapseBottomSheet) rt().call.collapseBottomSheet();
}

/**
 * startNavigationFromPreview function
 * @function startNavigationFromPreview
 * @returns {*} Return value description
 */
function startNavigationFromPreview() {
    const input = collectStartNavigationFromPreviewInput();
    const orch = RS().buildStartNavigationOrchestrationPlan(
        input.lastCalculatedRoute,
        input
    );
    applyStartNavigationFromPreviewFromPlan(orch.apply);
}
function applyRoutePreviewPanelDomFromPlan(domPlan) {
    const executePlan = RS().buildRoutePreviewPanelDomExecutePlan(domPlan);
    if (!executePlan.shouldExecute) return;

    const ids = executePlan.elementIds;
    const patches = executePlan.patches;

    const previewDistanceEl = document.getElementById(ids.previewDistance);
    if (previewDistanceEl && patches.previewDistance) {
        previewDistanceEl.dataset.km = patches.previewDistance.datasetKm;
        previewDistanceEl.textContent = patches.previewDistance.textContent;
    }

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text != null) el.textContent = text;
    };
    setText(ids.previewDuration, patches.previewDuration && patches.previewDuration.textContent);
    setText(ids.previewRoute, patches.previewRoute && patches.previewRoute.textContent);
    setText(ids.previewFuelCost, patches.previewFuelCost && patches.previewFuelCost.textContent);
    setText(ids.previewTollCost, patches.previewTollCost && patches.previewTollCost.textContent);
    setText(ids.previewCAZCost, patches.previewCAZCost && patches.previewCAZCost.textContent);
    setText(ids.previewTotalCost, patches.previewTotalCost && patches.previewTotalCost.textContent);
    setText(ids.previewRoutingMode, patches.previewRoutingMode && patches.previewRoutingMode.textContent);
    setText(ids.previewVehicleType, patches.previewVehicleType && patches.previewVehicleType.textContent);

    const fuelLitresEl = document.getElementById(ids.previewFuelLitres);
    if (fuelLitresEl && patches.previewFuelLitres) {
        if (patches.previewFuelLitres.visible) {
            fuelLitresEl.textContent = patches.previewFuelLitres.textContent;
            fuelLitresEl.style.display = patches.previewFuelLitres.display;
        } else {
            fuelLitresEl.style.display = patches.previewFuelLitres.display;
        }
    }

    const cazStatusContainer = document.getElementById(ids.cazStatusContainer);
    if (cazStatusContainer && patches.cazStatusContainer) {
        if (patches.cazStatusContainer.visible) {
            cazStatusContainer.innerHTML = patches.cazStatusContainer.innerHtml;
            cazStatusContainer.style.display = patches.cazStatusContainer.display;
        } else {
            cazStatusContainer.style.display = patches.cazStatusContainer.display;
        }
    }

    const hazardContainer = document.getElementById(ids.hazardInfoContainer);
    if (hazardContainer && patches.hazardInfoContainer) {
        const plan = patches.hazardInfoContainer;
        const hazardTitleEl = hazardContainer.querySelector('h4');
        const hazardCountLabel = hazardContainer.querySelector('[data-hazard-count-label]');
        const penaltyRow = hazardContainer.querySelector('#previewHazardPenalty')?.closest('div');
        const countEl = document.getElementById('previewHazardCount');
        const penaltyEl = document.getElementById('previewHazardPenalty');
        if (plan.visible && countEl) {
            countEl.textContent = plan.count;
            if (hazardCountLabel) hazardCountLabel.textContent = plan.countLabel;
            if (hazardTitleEl) hazardTitleEl.textContent = plan.title;
            if (penaltyRow) penaltyRow.style.display = plan.penaltyRowDisplay;
            if (penaltyEl && plan.penaltyText) {
                penaltyEl.textContent = plan.penaltyText;
            }
            hazardContainer.style.background = plan.containerBackground;
            hazardContainer.style.borderLeftColor = plan.containerBorderLeftColor;
            hazardContainer.style.display = plan.containerDisplay;
        } else {
            hazardContainer.style.display = plan.containerDisplay;
        }
    }

    const altContainer = document.getElementById(ids.previewAlternativeRoutesContainer);
    if (altContainer && patches.previewAlternativeRoutesContainer
        && patches.previewAlternativeRoutesContainer.display != null) {
        altContainer.style.display = patches.previewAlternativeRoutesContainer.display;
    }
}
function updateTripInfo(distance, time, fuelCost, tollCost) {
    const tripInfo = document.getElementById('tripInfo');
    const plan = RS().buildTripInfoApplyPlan(
        distance,
        time,
        fuelCost,
        tollCost,
        {
            distanceText: rt().call.convertDistance(parseFloat(distance) || 0),
            distUnit: rt().call.getDistanceUnit(),
            currencySymbol: rt().call.getCurrencySymbol(),
        },
        RSh().parseSharedRouteDurationMinutes
    );
    if (!plan.visible || !tripInfo) return;

    rt().call.applyTripInfoDomFromPlan(RS().buildTripInfoDomApplyPlan(plan.display));
    if (plan.dashFuel) {
        const fuelEl = document.getElementById('fuelCost');
        if (fuelEl) fuelEl.textContent = '-';
    }
    if (plan.dashToll) {
        const tollEl = document.getElementById('tollCost');
        if (tollEl) tollEl.textContent = '-';
    }
    tripInfo.classList.add('show');
    if (plan.showAlongRouteSearch) {
        const alongRouteBtn = document.getElementById('alongRouteSearch');
        if (alongRouteBtn) alongRouteBtn.style.display = 'block';
    }
}
    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        applyAlternativeRoutesPreviewDomFromPlan: applyAlternativeRoutesPreviewDomFromPlan,
        applyRouteComparisonModalFromPlan: applyRouteComparisonModalFromPlan,
        applyRouteOverviewFromPlan: applyRouteOverviewFromPlan,
        applyRoutePreviewAfterDisplayFromPlan: applyRoutePreviewAfterDisplayFromPlan,
        applyRoutePreviewPanelDomFromPlan: applyRoutePreviewPanelDomFromPlan,
        applyRouteUpdateDuringNavigation: applyRouteUpdateDuringNavigation,
        applyShowRouteComparisonEntryFromPlan: applyShowRouteComparisonEntryFromPlan,
        applyShowRouteComparisonSuccessFromPlan: applyShowRouteComparisonSuccessFromPlan,
        applyShowRoutePreviewFromPlan: applyShowRoutePreviewFromPlan,
        applyStartNavigationFromPreviewFromPlan: applyStartNavigationFromPreviewFromPlan,
        collectShowAlternativeRoutesPreviewInput: collectShowAlternativeRoutesPreviewInput,
        collectShowRouteComparisonInput: collectShowRouteComparisonInput,
        collectShowRoutePreviewInput: collectShowRoutePreviewInput,
        collectStartNavigationFromPreviewInput: collectStartNavigationFromPreviewInput,
        overviewRoute: overviewRoute,
        showAlternativeRoutesInPreview: showAlternativeRoutesInPreview,
        showRoutePreview: showRoutePreview,
        startNavigationFromPreview: startNavigationFromPreview,
        updateTripInfo: updateTripInfo,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoutePreviewOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
