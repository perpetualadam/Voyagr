/**
 * @file Pure route-sharing payload and URL builders (no DOM, no network).
 * @module modules/navigation/route-sharing
 */
(function (root) {
    'use strict';

    /**
     * Build the shareable route payload embedded in share links / QR codes.
     * @param {Object} route
     * @param {string} startLabel
     * @param {string} endLabel
     * @param {boolean} [includeGeometry=true]
     * @returns {Object}
     */
    function buildShareableRoutePayload(route, startLabel, endLabel, includeGeometry) {
        route = route || {};
        var payload = {
            start: startLabel,
            end: endLabel,
            distance: route.distance_km,
            time: route.time,
            fuel_cost: route.fuel_cost,
            toll_cost: route.toll_cost,
            caz_cost: route.caz_cost,
        };
        if (includeGeometry !== false) {
            payload.geometry = route.geometry;
        }
        return payload;
    }

    /**
     * Base64-encode a JSON-serializable payload for URL embedding.
     * @param {Object} payload
     * @returns {string}
     */
    function encodeRoutePayload(payload) {
        var json = JSON.stringify(payload);
        if (typeof btoa !== 'undefined') return btoa(json);
        return Buffer.from(json, 'utf8').toString('base64');
    }

    /**
     * @param {string} origin - e.g. window.location.origin
     * @param {string} encodedRoute
     * @returns {string}
     */
    function buildShareUrl(origin, encodedRoute) {
        return origin + '?route=' + encodedRoute;
    }

    /**
     * Decode a base64 route payload from a share URL.
     * @param {string} encoded
     * @returns {Object|null}
     */
    function decodeRoutePayload(encoded) {
        if (!encoded || typeof encoded !== 'string') return null;
        try {
            var json;
            if (typeof atob !== 'undefined') {
                json = atob(encoded);
            } else {
                json = Buffer.from(encoded, 'base64').toString('utf8');
            }
            var payload = JSON.parse(json);
            return payload && typeof payload === 'object' ? payload : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Read the `route` query param from a URL search string.
     * @param {string} search
     * @returns {string|null}
     */
    function extractRouteParamFromSearch(search) {
        try {
            return new URLSearchParams(search || '').get('route');
        } catch (e) {
            return null;
        }
    }

    /**
     * Remove the `route` query param from a full URL.
     * @param {string} href
     * @returns {string}
     */
    function stripRouteParamFromUrl(href) {
        var url = new URL(href);
        url.searchParams.delete('route');
        return url.pathname + url.search + url.hash;
    }

    /**
     * Parse duration minutes from shared payload time strings.
     * @param {string|number} time
     * @returns {number}
     */
    function parseSharedRouteDurationMinutes(time) {
        if (typeof time === 'number' && Number.isFinite(time)) return time;
        var parsed = parseInt(String(time || '').replace(/\D/g, ''), 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    /**
     * Map a decoded share payload to lastCalculatedRoute fields.
     * @param {Object} payload
     * @returns {Object}
     */
    function buildLastCalculatedRouteFromSharedPayload(payload) {
        payload = payload || {};
        var distanceKm = payload.distance != null ? payload.distance : (payload.distance_km || 0);
        return {
            distance_km: distanceKm,
            time: payload.time,
            duration_minutes: parseSharedRouteDurationMinutes(payload.time),
            fuel_cost: payload.fuel_cost || 0,
            toll_cost: payload.toll_cost || 0,
            caz_cost: payload.caz_cost || 0,
            geometry: payload.geometry || null,
            destination: payload.end,
            destinationName: payload.end,
        };
    }

    /**
     * Display values for the route sharing summary panel.
     * @param {Object} route
     * @param {Object} fmt
     * @param {string} fmt.startLabel
     * @param {string} fmt.endLabel
     * @param {string} fmt.distanceText
     * @param {string} fmt.distUnit
     * @param {string} fmt.currencySymbol
     * @returns {Object}
     */
    function buildRouteShareSummaryValues(route, fmt) {
        route = route || {};
        fmt = fmt || {};
        var totalCost = parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
        return {
            startLabel: fmt.startLabel,
            endLabel: fmt.endLabel,
            distanceText: fmt.distanceText,
            distUnit: fmt.distUnit,
            durationText: route.time || 'N/A',
            totalCostText: fmt.currencySymbol + totalCost.toFixed(2),
            totalCost: totalCost,
        };
    }

    /**
     * WhatsApp share message body.
     * @param {Object} route
     * @param {Object} fmt
     * @returns {string}
     */
    function buildShareWhatsAppMessage(route, fmt) {
        route = route || {};
        fmt = fmt || {};
        var totalCost = parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
        return (
            '📍 Route from ' + fmt.startLabel + ' to ' + fmt.endLabel + '\n' +
            '📏 Distance: ' + fmt.distanceText + ' ' + fmt.distUnit + '\n' +
            '⏱️ Duration: ' + (route.time || 'N/A') + '\n' +
            '💰 Cost: ' + fmt.currencySymbol + totalCost.toFixed(2) + '\n\n' +
            'Shared via Voyagr Navigation'
        );
    }

    /**
     * @param {string} startLabel
     * @param {string} endLabel
     * @returns {string}
     */
    function buildShareEmailSubject(startLabel, endLabel) {
        return 'Route: ' + startLabel + ' to ' + endLabel;
    }

    /**
     * Email share body.
     * @param {Object} route
     * @param {Object} fmt
     * @returns {string}
     */
    function buildShareEmailBody(route, fmt) {
        route = route || {};
        fmt = fmt || {};
        var totalCost = parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
        return (
            "I'm sharing a route with you:\n\n" +
            'From: ' + fmt.startLabel + '\n' +
            'To: ' + fmt.endLabel + '\n' +
            'Distance: ' + fmt.distanceText + ' ' + fmt.distUnit + '\n' +
            'Duration: ' + (route.time || 'N/A') + '\n' +
            'Estimated Cost: ' + fmt.currencySymbol + totalCost.toFixed(2) + '\n\n' +
            'Shared via Voyagr Navigation'
        );
    }

    /**
     * @param {Object} route
     * @returns {number}
     */
    function computeSavedRouteTotalCost(route) {
        route = route || {};
        return parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
    }

    /**
     * @param {Object} route
     * @param {Object} opts
     * @returns {string}
     */
    function buildSavedRouteRowHtml(route, opts) {
        route = route || {};
        opts = opts || {};
        var totalCost = computeSavedRouteTotalCost(route).toFixed(2);
        return (
            '<div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #E91E63;">' +
                '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">' +
                    '<div>' +
                        '<div style="font-weight: 500; font-size: 14px;">' + route.name + '</div>' +
                        '<div style="font-size: 12px; color: #666; margin-top: 4px;">📍 ' + route.start + ' → ' + route.end + '</div>' +
                    '</div>' +
                    '<button onclick="deleteSavedRoute(' + route.id + ')" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">✕</button>' +
                '</div>' +
                '<div style="font-size: 12px; color: #666; margin-bottom: 8px;">' +
                    '📏 ' + opts.distanceText + ' ' + opts.distUnit + ' | ⏱️ ' + route.duration_minutes +
                    ' | 💰 ' + opts.currencySymbol + totalCost +
                '</div>' +
                '<button onclick="useSavedRoute(' + route.id + ')" style="width: 100%; background: #E91E63; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 13px;">🚀 Use This Route</button>' +
            '</div>'
        );
    }

    var QR_CODE_IMAGE_SIZE_PX = 200;

    /**
     * QR Server API image URL for a share link.
     * @param {string} shareLink
     * @param {number} [size=200]
     * @returns {string}
     */
    function buildQrCodeImageUrl(shareLink, size) {
        var px = Number(size) || QR_CODE_IMAGE_SIZE_PX;
        return 'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px +
            '&data=' + encodeURIComponent(shareLink || '');
    }

    /**
     * Inline style for the generated QR code image element.
     * @param {number} [size=200]
     * @returns {string}
     */
    function getQrCodeImageStyleCssText(size) {
        var px = Number(size) || QR_CODE_IMAGE_SIZE_PX;
        return 'width: ' + px + 'px; height: ' + px + 'px;';
    }

    /**
     * @param {Array<Object>} routes
     * @param {Object} opts
     * @returns {string}
     */
    function buildSavedRoutesListHtml(routes, opts) {
        if (!routes || routes.length === 0) {
            return '<div style="text-align: center; padding: 20px; color: #999;">No saved routes yet</div>';
        }
        opts = opts || {};
        var html = '';
        for (var i = 0; i < routes.length; i++) {
            html += buildSavedRouteRowHtml(routes[i], {
                currencySymbol: opts.currencySymbol,
                distUnit: opts.distUnit,
                distanceText: opts.distanceTexts ? opts.distanceTexts[i] : opts.distanceText,
            });
        }
        return html;
    }

    var SAVED_ROUTES_STORAGE_KEY = 'savedRoutes';

    /**
     * Plan for saving the current calculated route to local storage.
     * @param {Object} o
     * @param {Object|null|undefined} o.lastCalculatedRoute
     * @param {string} o.routeName
     * @param {string} o.startLabel
     * @param {string} o.endLabel
     * @param {number} [o.now]
     * @returns {Object}
     */
    function buildSaveCurrentRoutePlan(o) {
        o = o || {};
        if (!o.lastCalculatedRoute) {
            return { ok: false, errorStatusMessage: 'No route calculated yet' };
        }
        var routeName = String(o.routeName || '').trim();
        if (!routeName) {
            return { ok: false, errorStatusMessage: 'Please enter a route name' };
        }
        var route = o.lastCalculatedRoute;
        var now = o.now != null ? o.now : Date.now();
        return {
            ok: true,
            savedRoute: {
                id: now,
                name: routeName,
                start: o.startLabel,
                end: o.endLabel,
                distance_km: route.distance_km,
                duration_minutes: route.time,
                fuel_cost: route.fuel_cost,
                toll_cost: route.toll_cost,
                caz_cost: route.caz_cost,
                geometry: route.geometry,
                timestamp: new Date(now).toISOString(),
            },
            storageKey: SAVED_ROUTES_STORAGE_KEY,
            routeNameInputId: 'routeName',
            successStatusMessage: 'Route "' + routeName + '" saved!',
            reloadList: true,
            persistProfile: true,
        };
    }

    /**
     * Execute plan for saveCurrentRoute side effects.
     * @param {Object} plan - from buildSaveCurrentRoutePlan
     * @returns {Object}
     */
    function buildSaveCurrentRouteExecutePlan(plan) {
        plan = plan || {};
        if (!plan.ok) {
            return {
                shouldSave: false,
                errorStatusMessage: plan.errorStatusMessage,
            };
        }
        return {
            shouldSave: true,
            savedRoute: plan.savedRoute,
            storageKey: plan.storageKey,
            routeNameInputId: plan.routeNameInputId,
            clearRouteNameInput: true,
            successStatusMessage: plan.successStatusMessage,
            reloadList: !!plan.reloadList,
            persistProfile: !!plan.persistProfile,
        };
    }

    /**
     * Input assembly for loadSavedRoutes list HTML.
     * @param {Array<Object>} savedRoutes
     * @param {Object} fmt
     * @param {function(number): string} fmt.convertDistance
     * @param {string} fmt.currencySymbol
     * @param {string} fmt.distUnit
     * @returns {Object}
     */
    function buildLoadSavedRoutesListInputPlan(savedRoutes, fmt) {
        fmt = fmt || {};
        var routes = savedRoutes || [];
        return {
            savedRoutes: routes,
            currencySymbol: fmt.currencySymbol,
            distUnit: fmt.distUnit,
            distanceTexts: routes.map(function (route) {
                return typeof fmt.convertDistance === 'function'
                    ? fmt.convertDistance(route.distance_km)
                    : String(route.distance_km);
            }),
            listContainerId: 'savedRoutesList',
        };
    }

    /**
     * Execute plan for rendering the saved routes list.
     * @param {Object} input - from buildLoadSavedRoutesListInputPlan
     * @returns {Object}
     */
    function buildLoadSavedRoutesExecutePlan(input) {
        input = input || {};
        return {
            shouldRender: true,
            listContainerId: input.listContainerId || 'savedRoutesList',
            listHtml: buildSavedRoutesListHtml(input.savedRoutes, {
                currencySymbol: input.currencySymbol,
                distUnit: input.distUnit,
                distanceTexts: input.distanceTexts,
            }),
        };
    }

    /**
     * Plan for loading a saved route into the navigation form.
     * @param {number|string} routeId
     * @param {Array<Object>} savedRoutes
     * @returns {Object}
     */
    function buildUseSavedRoutePlan(routeId, savedRoutes) {
        var routes = savedRoutes || [];
        var route = null;
        for (var i = 0; i < routes.length; i++) {
            if (routes[i].id === routeId) {
                route = routes[i];
                break;
            }
        }
        if (!route) {
            return { ok: false };
        }
        return {
            ok: true,
            startLabel: route.start,
            endLabel: route.end,
            lastCalculatedRoutePatch: {
                distance_km: route.distance_km,
                time: route.duration_minutes,
                fuel_cost: route.fuel_cost,
                toll_cost: route.toll_cost,
                caz_cost: route.caz_cost,
                geometry: route.geometry,
                destination: route.end,
                destinationName: route.end,
            },
            successStatusMessage: 'Loaded route: ' + route.name,
            switchTab: 'navigation',
        };
    }

    /**
     * Plan for deleting a saved route after user confirmation.
     * @param {number|string} routeId
     * @returns {Object}
     */
    function buildDeleteSavedRoutePlan(routeId) {
        return {
            confirmMessage: 'Delete this saved route?',
            routeId: routeId,
            storageKey: SAVED_ROUTES_STORAGE_KEY,
            successStatusMessage: 'Route deleted',
            reloadList: true,
            persistProfile: true,
        };
    }

    /**
     * Execute plan for deleteSavedRoute persistence side effects.
     * @param {Object} plan - from buildDeleteSavedRoutePlan
     * @param {Array<Object>} savedRoutes
     * @returns {Object}
     */
    function buildDeleteSavedRouteExecutePlan(plan, savedRoutes) {
        plan = plan || {};
        var routes = (savedRoutes || []).filter(function (route) {
            return route.id !== plan.routeId;
        });
        return {
            shouldPersist: true,
            storageKey: plan.storageKey,
            nextRoutes: routes,
            successStatusMessage: plan.successStatusMessage,
            reloadList: !!plan.reloadList,
            persistProfile: !!plan.persistProfile,
        };
    }

    /**
     * Input assembly for prepareRouteSharing summary values.
     * @param {Object} o
     * @returns {Object}
     */
    function buildPrepareRouteSharingInputPlan(o) {
        o = o || {};
        return {
            route: o.route,
            startLabel: o.startLabel,
            endLabel: o.endLabel,
            distanceText: o.distanceText,
            distUnit: o.distUnit,
            currencySymbol: o.currencySymbol,
        };
    }

    /**
     * Execute plan for writing route share summary fields to the DOM.
     * @param {Object} input - from buildPrepareRouteSharingInputPlan
     * @returns {Object}
     */
    function buildPrepareRouteSharingExecutePlan(input) {
        input = input || {};
        if (!input.route) {
            return {
                shouldPrepare: false,
                errorStatusMessage: 'No route calculated yet',
            };
        }
        var summary = buildRouteShareSummaryValues(input.route, input);
        return {
            shouldPrepare: true,
            summary: summary,
            elementPatches: {
                shareStart: 'Start: ' + summary.startLabel,
                shareEnd: 'End: ' + summary.endLabel,
                shareDistance: 'Distance: ' + summary.distanceText + ' ' + summary.distUnit,
                shareTime: 'Duration: ' + summary.durationText,
                shareCost: 'Total Cost: ' + summary.totalCostText,
            },
        };
    }

    /**
     * Input assembly for encoded share link generation.
     * @param {Object} o
     * @returns {Object}
     */
    function buildEncodedShareLinkInputPlan(o) {
        o = o || {};
        return {
            route: o.route,
            startLabel: o.startLabel,
            endLabel: o.endLabel,
            origin: o.origin,
            includeGeometry: o.includeGeometry !== false,
        };
    }

    /**
     * Plan for building an encoded share URL from the current route.
     * @param {Object} input - from buildEncodedShareLinkInputPlan
     * @returns {Object}
     */
    function buildEncodedShareLinkPlan(input) {
        input = input || {};
        if (!input.route) {
            return { ok: false, errorStatusMessage: 'No route calculated yet' };
        }
        var payload = buildShareableRoutePayload(
            input.route,
            input.startLabel,
            input.endLabel,
            input.includeGeometry
        );
        var encodedRoute = encodeRoutePayload(payload);
        return {
            ok: true,
            shareLink: buildShareUrl(input.origin, encodedRoute),
            encodedRoute: encodedRoute,
        };
    }

    /**
     * Execute plan for showing a generated share link in the UI.
     * @param {Object} linkPlan - from buildEncodedShareLinkPlan
     * @returns {Object}
     */
    function buildShareLinkGenerateExecutePlan(linkPlan) {
        linkPlan = linkPlan || {};
        if (!linkPlan.ok) {
            return {
                shouldGenerate: false,
                errorStatusMessage: linkPlan.errorStatusMessage,
            };
        }
        return {
            shouldGenerate: true,
            shareLink: linkPlan.shareLink,
            shareLinkInputId: 'shareLink',
            showContainerId: 'shareLinkContainer',
            hideContainerId: 'qrCodeContainer',
            successStatusMessage: 'Share link generated!',
        };
    }

    /**
     * Execute plan for generating and mounting a route QR code.
     * @param {Object} linkPlan - from buildEncodedShareLinkPlan
     * @returns {Object}
     */
    function buildQrCodeGenerateExecutePlan(linkPlan) {
        linkPlan = linkPlan || {};
        if (!linkPlan.ok) {
            return {
                shouldGenerate: false,
                errorStatusMessage: linkPlan.errorStatusMessage,
            };
        }
        return {
            shouldGenerate: true,
            shareLink: linkPlan.shareLink,
            qrContainerId: 'qrCode',
            qrCodeContainerId: 'qrCodeContainer',
            shareLinkContainerId: 'shareLinkContainer',
            successStatusMessage: 'QR code generated!',
            storeQrImageUrl: true,
        };
    }

    /**
     * Plan for sharing a route via WhatsApp.
     * @param {Object|null|undefined} route
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildShareViaWhatsAppPlan(route, fmt) {
        if (!route) {
            return { ok: false, errorStatusMessage: 'No route calculated yet' };
        }
        return {
            ok: true,
            message: buildShareWhatsAppMessage(route, fmt),
            statusMessage: 'Opening WhatsApp...',
            whatsAppUrlPrefix: 'https://wa.me/?text=',
        };
    }

    /**
     * Plan for sharing a route via email.
     * @param {Object|null|undefined} route
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildShareViaEmailPlan(route, fmt) {
        fmt = fmt || {};
        if (!route) {
            return { ok: false, errorStatusMessage: 'No route calculated yet' };
        }
        return {
            ok: true,
            subject: buildShareEmailSubject(fmt.startLabel, fmt.endLabel),
            body: buildShareEmailBody(route, fmt),
            statusMessage: 'Opening email client...',
            mailtoPrefix: 'mailto:?subject=',
        };
    }

    /**
     * Orchestration plan for loading a shared route from URL query params.
     * @param {string} search
     * @returns {Object}
     */
    function buildLoadSharedRouteFromUrlOrchestrationPlan(search) {
        var encoded = extractRouteParamFromSearch(search);
        if (!encoded) {
            return { shouldLoad: false };
        }
        var payload = decodeRoutePayload(encoded);
        if (!payload || !payload.start || !payload.end) {
            return {
                shouldLoad: false,
                invalidPayloadLog: '[RouteSharing] Invalid shared route payload in URL',
            };
        }
        return {
            shouldLoad: true,
            payload: payload,
            startInputId: 'start',
            endInputId: 'end',
        };
    }

    /**
     * Execute plan after a valid shared-route URL payload is decoded.
     * @param {Object} orch - from buildLoadSharedRouteFromUrlOrchestrationPlan
     * @param {string} href
     * @returns {Object}
     */
    function buildLoadSharedRouteFromUrlExecutePlan(orch, href) {
        orch = orch || {};
        if (!orch.shouldLoad) {
            return { shouldApply: false };
        }
        var lastRoute = buildLastCalculatedRouteFromSharedPayload(orch.payload);
        return {
            shouldApply: true,
            startLabel: orch.payload.start,
            endLabel: orch.payload.end,
            startInputId: orch.startInputId || 'start',
            endInputId: orch.endInputId || 'end',
            lastCalculatedRoute: lastRoute,
            cleanUrl: stripRouteParamFromUrl(href),
            urlCleanupFailedLog: '[RouteSharing] URL cleanup failed:',
            showRoutePreview: !!lastRoute.geometry,
            previewSkipMapDisplay: false,
            successStatusMessage: 'Shared route loaded',
        };
    }

    /**
     * Execute plan for copying the share link input to clipboard.
     * @returns {Object}
     */
    function buildCopyShareLinkExecutePlan() {
        return {
            shouldCopy: true,
            shareLinkInputId: 'shareLink',
            successStatusMessage: 'Link copied to clipboard!',
            successStatusType: 'success',
        };
    }

    var api = {
        buildShareableRoutePayload: buildShareableRoutePayload,
        encodeRoutePayload: encodeRoutePayload,
        decodeRoutePayload: decodeRoutePayload,
        extractRouteParamFromSearch: extractRouteParamFromSearch,
        stripRouteParamFromUrl: stripRouteParamFromUrl,
        parseSharedRouteDurationMinutes: parseSharedRouteDurationMinutes,
        buildLastCalculatedRouteFromSharedPayload: buildLastCalculatedRouteFromSharedPayload,
        buildShareUrl: buildShareUrl,
        buildRouteShareSummaryValues: buildRouteShareSummaryValues,
        buildShareWhatsAppMessage: buildShareWhatsAppMessage,
        buildShareEmailSubject: buildShareEmailSubject,
        buildShareEmailBody: buildShareEmailBody,
        computeSavedRouteTotalCost: computeSavedRouteTotalCost,
        buildSavedRouteRowHtml: buildSavedRouteRowHtml,
        buildSavedRoutesListHtml: buildSavedRoutesListHtml,
        SAVED_ROUTES_STORAGE_KEY: SAVED_ROUTES_STORAGE_KEY,
        buildSaveCurrentRoutePlan: buildSaveCurrentRoutePlan,
        buildSaveCurrentRouteExecutePlan: buildSaveCurrentRouteExecutePlan,
        buildLoadSavedRoutesListInputPlan: buildLoadSavedRoutesListInputPlan,
        buildLoadSavedRoutesExecutePlan: buildLoadSavedRoutesExecutePlan,
        buildUseSavedRoutePlan: buildUseSavedRoutePlan,
        buildDeleteSavedRoutePlan: buildDeleteSavedRoutePlan,
        buildDeleteSavedRouteExecutePlan: buildDeleteSavedRouteExecutePlan,
        buildPrepareRouteSharingInputPlan: buildPrepareRouteSharingInputPlan,
        buildPrepareRouteSharingExecutePlan: buildPrepareRouteSharingExecutePlan,
        buildEncodedShareLinkInputPlan: buildEncodedShareLinkInputPlan,
        buildEncodedShareLinkPlan: buildEncodedShareLinkPlan,
        buildShareLinkGenerateExecutePlan: buildShareLinkGenerateExecutePlan,
        buildQrCodeGenerateExecutePlan: buildQrCodeGenerateExecutePlan,
        buildShareViaWhatsAppPlan: buildShareViaWhatsAppPlan,
        buildShareViaEmailPlan: buildShareViaEmailPlan,
        buildLoadSharedRouteFromUrlOrchestrationPlan: buildLoadSharedRouteFromUrlOrchestrationPlan,
        buildLoadSharedRouteFromUrlExecutePlan: buildLoadSharedRouteFromUrlExecutePlan,
        buildCopyShareLinkExecutePlan: buildCopyShareLinkExecutePlan,
        QR_CODE_IMAGE_SIZE_PX: QR_CODE_IMAGE_SIZE_PX,
        buildQrCodeImageUrl: buildQrCodeImageUrl,
        getQrCodeImageStyleCssText: getQrCodeImageStyleCssText,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSharing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
