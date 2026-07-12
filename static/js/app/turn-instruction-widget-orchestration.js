/**
 * @file Turn instruction widget orchestration (panel, preview markers, GPS tick updates).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var instructionsPanelExpanded = false;
    var previewMarker = null;

    function rt() {
        if (!runtime) {
            throw new Error('[TurnInstructionWidget] Orchestration runtime not bound');
        }
        return runtime;
    }

    function TI() { return rt().turnInstructions(); }

    function toggleInstructionsList() {
        const panel = document.getElementById('instructionsPanel');
        const expandIcon = document.getElementById('expandIcon');
        const expandIndicator = document.querySelector('.expand-indicator');

        if (!panel) return;

        instructionsPanelExpanded = !instructionsPanelExpanded;

        if (instructionsPanelExpanded) {
            panel.style.display = 'block';
            if (expandIndicator) expandIndicator.classList.add('expanded');
            if (expandIcon) expandIcon.textContent = '▲';
            populateInstructionsList();
        } else {
            panel.style.display = 'none';
            if (expandIndicator) expandIndicator.classList.remove('expanded');
            if (expandIcon) expandIcon.textContent = '▼';
        }

        console.log('[Turn Widget] Instructions panel:', instructionsPanelExpanded ? 'expanded' : 'collapsed');
    }

    function showTurnInstructionWidget() {
        const widget = document.getElementById('turnInstructionWidget');
        if (widget) {
            widget.style.display = 'block';
            console.log('[Turn Widget] Displayed');
        }
    }

    function hideTurnInstructionWidget() {
        const widget = document.getElementById('turnInstructionWidget');
        if (widget) {
            widget.style.display = 'none';
            instructionsPanelExpanded = false;
            const panel = document.getElementById('instructionsPanel');
            if (panel) panel.style.display = 'none';
            const hintEl = document.getElementById('nextTurnLaneHint');
            if (hintEl) {
                hintEl.innerHTML = '';
                hintEl.style.display = 'none';
            }
            const thenEl = document.getElementById('nextTurnThen');
            if (thenEl) thenEl.style.display = 'none';
            console.log('[Turn Widget] Hidden');
        }
    }

    function updateThenRow(maneuverIndex, currentDistance) {
        const thenEl = document.getElementById('nextTurnThen');
        if (!thenEl) return;
        const iconEl = document.getElementById('nextTurnThenIcon');
        const textEl = document.getElementById('nextTurnThenText');
        const follow = getFollowingManeuver(maneuverIndex);
        const plan = TI().buildThenRowDisplayPlan(
            maneuverIndex,
            currentDistance,
            follow,
            rt().getDistanceUnit(),
            follow && follow.direction === 'roundabout'
                ? effectiveRoundaboutExitCount(follow.index)
                : 0
        );

        if (plan.visible) {
            if (iconEl) iconEl.textContent = plan.icon;
            if (textEl) textEl.textContent = plan.text;
        }
        thenEl.style.display = plan.visible ? 'flex' : 'none';
    }

    function updateTurnInstructionDisplay(turnInfo) {
        const distanceEl = document.getElementById('nextTurnDistance');
        const instructionEl = document.getElementById('nextTurnInstruction');
        const streetEl = document.getElementById('nextTurnStreet');
        const iconEl = document.getElementById('nextTurnIcon');
        const hintEl = document.getElementById('nextTurnLaneHint');

        if (!distanceEl || !instructionEl) return;

        const roadClass = turnInfo && turnInfo.maneuver
            ? (turnInfo.maneuver.road_class || rt().routeGeometry().inferRoadClassFromManeuver(turnInfo.maneuver))
            : null;
        const plan = TI().buildTurnWidgetRowDisplayPlan(turnInfo, rt().getDistanceUnit(), {
            roundaboutExitCount: turnInfo && turnInfo.maneuverIndex != null
                ? effectiveRoundaboutExitCount(turnInfo.maneuverIndex)
                : 0,
            roadClass: roadClass,
        });

        distanceEl.textContent = plan.distanceText;
        instructionEl.textContent = plan.instructionText;

        if (streetEl) {
            if (plan.streetVisible) {
                streetEl.textContent = plan.streetText;
                streetEl.style.display = 'block';
            } else {
                streetEl.style.display = 'none';
            }
        }

        if (iconEl) iconEl.textContent = TI().getTurnIcon(plan.iconType);

        if (hintEl) {
            if (plan.hintVisible) {
                hintEl.innerHTML = plan.hintHtml;
                hintEl.style.display = 'block';
            } else {
                hintEl.innerHTML = '';
                hintEl.style.display = 'none';
            }
        }

        updateThenRow(plan.maneuverIndex, plan.distance);

        if (instructionsPanelExpanded) {
            populateInstructionsList();
        }

        rt().call.updateARInstruction(turnInfo);
    }

    function populateInstructionsList() {
        const listEl = document.getElementById('instructionsList');
        const countEl = document.getElementById('instructionsCount');
        const plan = TI().buildInstructionsListHtml(
            rt().getCurrentRouteSteps(),
            rt().getCurrentStepIndex(),
            {
                getTurnIcon: TI().getTurnIcon.bind(TI()),
                effectiveRoundaboutExitCountFromSteps: TI().effectiveRoundaboutExitCountFromSteps,
            }
        );

        if (countEl) countEl.textContent = plan.countText;
        if (!listEl) return;

        listEl.innerHTML = plan.html;

        const currentItem = listEl.querySelector('.instruction-item.current');
        if (currentItem) {
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function hidePreviewMarker() {
        if (previewMarker) {
            previewMarker.remove();
            previewMarker = null;
        }
    }

    function showPreviewMarker(lat, lon, label) {
        hidePreviewMarker();

        const map = rt().getMap();
        if (!map) return;

        const PM = rt().previewMarker();
        const el = document.createElement('div');
        el.className = PM.PREVIEW_MARKER_CLASS;
        el.innerHTML = PM.buildPreviewMarkerInnerHtml(label);
        el.style.cssText = PM.getPreviewMarkerStyleCssText();

        previewMarker = new maplibregl.Marker({ element: el })
            .setLngLat([lon, lat])
            .addTo(map);
    }

    function previewInstructionOnMap(stepIndex, shapeIndex) {
        const routePolyline = rt().getRoutePolyline();
        if (!routePolyline || shapeIndex >= routePolyline.length) {
            console.log('[Instructions] Cannot preview: invalid polyline index');
            return;
        }

        const point = routePolyline[shapeIndex];
        if (!point) return;

        const step = rt().getCurrentRouteSteps()[stepIndex];
        const instruction = step?.instruction || 'Maneuver';

        console.log('[Instructions] Previewing step ' + stepIndex + ': "' + instruction + '" at [' + point[0].toFixed(4) + ', ' + point[1].toFixed(4) + ']');

        const wasFollowing = rt().getMapFollowingActive();
        rt().setMapFollowingActive(false);

        const map = rt().getMap();
        if (map) {
            map.flyTo({
                center: [point[1], point[0]],
                zoom: 17,
                duration: 1000,
            });
            showPreviewMarker(point[0], point[1], instruction);
        }

        setTimeout(() => {
            if (wasFollowing) {
                rt().setMapFollowingActive(true);
                hidePreviewMarker();
            }
        }, 5000);

        rt().call.showStatus('📍 Previewing: ' + instruction, 'info');
    }

    function updateTurnWidgetFromPosition(lat, lon, turnInfo) {
        const RG = rt().routeGeometry();
        const SG = rt().speedGps();

        const resolvedTurnInfo = turnInfo !== undefined
            ? turnInfo
            : rt().call.detectUpcomingTurn(lat, lon);

        const tick = TI().buildTurnWidgetTickPlan({
            routeInProgress: rt().getRouteInProgress(),
            routeSteps: rt().getCurrentRouteSteps(),
            routePolyline: rt().getRoutePolyline(),
            lat: lat,
            lon: lon,
            lastSnappedRouteIndex: rt().getLastSnappedRouteIndex(),
            currentRoadDisplayName: rt().call.getCurrentRoadDisplayName(),
            turnInfo: resolvedTurnInfo,
            getActiveRouteManeuverIndex: SG ? SG.getActiveRouteManeuverIndex.bind(SG) : null,
            buildBetweenTurnDisplay: SG ? SG.buildBetweenTurnDisplay.bind(SG) : null,
            snapToRoutePolyline: (a, b, c, d) => RG.snapToRoutePolyline(a, b, c, d),
            distanceAlongRouteToVertexMeters: RG.distanceAlongRouteToVertexMeters.bind(RG),
        });

        if (tick.action === 'skip') return;
        if (tick.action === 'clear') {
            updateTurnInstructionDisplay(null);
            return;
        }
        updateTurnInstructionDisplay(tick.displayPayload);
    }

    function getFollowingManeuver(currentIndex) {
        const RG = rt().routeGeometry();
        return TI().findFollowingManeuver(
            rt().getCurrentRouteSteps(),
            currentIndex,
            rt().getRoutePolyline(),
            {
                cumulativeDistanceBetweenVertices: RG.cumulativeDistanceBetweenVertices,
                getManeuverStreetLabel: rt().call.getManeuverStreetLabel,
                resolveRoadClass: (step) => step.road_class || RG.inferRoadClassFromManeuver(step),
            }
        );
    }

    function effectiveRoundaboutExitCount(stepIndex) {
        return TI().effectiveRoundaboutExitCountFromSteps(rt().getCurrentRouteSteps(), stepIndex);
    }

    function refineManeuverDirectionForRoute(type, direction, maneuver) {
        const roadClass = maneuver && (maneuver.road_class || rt().routeGeometry().inferRoadClassFromManeuver(maneuver));
        return TI().refineManeuverDirection(type, direction, roadClass);
    }

    function buildTurnDisplayInstruction(turnInfo) {
        if (!turnInfo) return 'Continue on current road';
        return TI().buildTurnDisplayInstruction(
            turnInfo.direction,
            turnInfo.instruction,
            turnInfo.valhallaType,
            turnInfo.roundabout_exit_count
        );
    }

    function detectUpcomingTurn(userLat, userLon) {
        const RG = rt().routeGeometry();
        const tick = TI().buildDetectUpcomingTurnTickPlan({
            routeInProgress: rt().getRouteInProgress(),
            routePolyline: rt().getRoutePolyline(),
            routeSteps: rt().getCurrentRouteSteps(),
            userLat: userLat,
            userLon: userLon,
            lastTurnDetectRouteVertexIndex: rt().getLastTurnDetectRouteVertexIndex(),
            snapToRoutePolyline: (lat, lon, poly, idx) => RG.snapToRoutePolyline(lat, lon, poly, idx),
            distanceAlongRouteToVertexMeters: RG.distanceAlongRouteToVertexMeters.bind(RG),
            bearing: RG.bearing.bind(RG),
            getManeuverStreetLabel: rt().call.getManeuverStreetLabel,
            resolveRoadClass: (step) => step.road_class || RG.inferRoadClassFromManeuver(step),
            effectiveRoundaboutExitCountFromSteps: TI().effectiveRoundaboutExitCountFromSteps,
        });
        if (tick.action === 'skip') return null;

        const apply = TI().buildDetectUpcomingTurnStateApplyPlan(tick);
        if (apply.action === 'skip') return null;

        if (apply.statePatch.lastTurnDetectRouteVertexIndex != null) {
            rt().setLastTurnDetectRouteVertexIndex(apply.statePatch.lastTurnDetectRouteVertexIndex);
        }
        if (apply.statePatch.currentStepIndex != null) {
            rt().setCurrentStepIndex(apply.statePatch.currentStepIndex);
        }
        if (apply.persistRoute) rt().call.schedulePersistRoute();
        if (apply.logLine) console.log(apply.logLine);

        return apply.turnInfo;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleInstructionsList: toggleInstructionsList,
        showTurnInstructionWidget: showTurnInstructionWidget,
        hideTurnInstructionWidget: hideTurnInstructionWidget,
        updateTurnInstructionDisplay: updateTurnInstructionDisplay,
        updateThenRow: updateThenRow,
        populateInstructionsList: populateInstructionsList,
        previewInstructionOnMap: previewInstructionOnMap,
        showPreviewMarker: showPreviewMarker,
        hidePreviewMarker: hidePreviewMarker,
        updateTurnWidgetFromPosition: updateTurnWidgetFromPosition,
        getFollowingManeuver: getFollowingManeuver,
        effectiveRoundaboutExitCount: effectiveRoundaboutExitCount,
        refineManeuverDirectionForRoute: refineManeuverDirectionForRoute,
        buildTurnDisplayInstruction: buildTurnDisplayInstruction,
        detectUpcomingTurn: detectUpcomingTurn,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTurnInstructionWidgetOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
