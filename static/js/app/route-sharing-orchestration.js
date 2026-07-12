/**
 * @file Route sharing link, QR, and channel orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[RouteSharing] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RS() { return rt().routeSharing(); }

function collectEncodedShareLinkInput(includeGeometry) {
    return RS().buildEncodedShareLinkInputPlan({
        route: window.lastCalculatedRoute,
        startLabel: document.getElementById('start')?.value,
        endLabel: document.getElementById('end')?.value,
        origin: window.location.origin,
        includeGeometry,
    });
}

/**
 * Build encoded share URL from current route (optionally omit geometry for QR).
 * @param {boolean} [includeGeometry=true]
 * @returns {{ ok: boolean, shareLink?: string, encodedRoute?: string, errorStatusMessage?: string }}
 */
function buildEncodedShareLinkPlan(includeGeometry) {
    return RS().buildEncodedShareLinkOrchestrationPlan(
        collectEncodedShareLinkInput(includeGeometry)
    ).plan;
}

function buildEncodedShareLink(includeGeometry) {
    const plan = buildEncodedShareLinkPlan(includeGeometry);
    if (!plan.ok) return null;
    return {
        shareLink: plan.shareLink,
        encodedRoute: plan.encodedRoute,
    };
}

function buildRouteShareFormatInput() {
    const RS = RS();
    return RS.buildRouteShareFormatInputPlan({
        startLabel: document.getElementById('start')?.value,
        endLabel: document.getElementById('end')?.value,
        distanceText: rt().call.convertDistance(window.lastCalculatedRoute?.distance_km || 0),
        distUnit: rt().call.getDistanceUnit(),
        currencySymbol: rt().call.getCurrencySymbol(),
    });
}

function applyLoadSharedRouteFromUrlFromPlan(entry) {
    if (!entry || !entry.shouldLoad) {
        if (entry && entry.invalidPayloadLog) console.warn(entry.invalidPayloadLog);
        return false;
    }

    const execute = entry.execute;
    if (!execute || !execute.shouldApply) return false;

    const startEl = document.getElementById(execute.startInputId);
    const endEl = document.getElementById(execute.endInputId);
    if (startEl) startEl.value = execute.startLabel;
    if (endEl) endEl.value = execute.endLabel;

    window.lastCalculatedRoute = execute.lastCalculatedRoute;
    rt().call.updateTripInfoFromRouteOption(window.lastCalculatedRoute);

    try {
        window.history.replaceState({}, '', execute.cleanUrl);
    } catch (e) {
        console.warn(execute.urlCleanupFailedLog, e);
    }

    if (execute.showRoutePreview) {
        rt().call.showRoutePreview(window.lastCalculatedRoute, execute.previewSkipMapDisplay);
    } else {
        rt().call.showStatus(execute.successStatusMessage, 'success');
    }
    return true;
}

/**
 * Load a shared route from the `?route=` URL query param when present.
 * @returns {boolean} true when a shared route was applied
 */
function loadSharedRouteFromUrl() {
    return applyLoadSharedRouteFromUrlFromPlan(
        RS().buildLoadSharedRouteFromUrlEntryOrchestrationPlan(
            window.location.search,
            window.location.href
        )
    );
}

function collectPrepareRouteSharingInput() {
    const fmt = buildRouteShareFormatInput();
    return RS().buildPrepareRouteSharingInputPlan({
        route: window.lastCalculatedRoute,
        ...fmt,
    });
}

function applyPrepareRouteSharingFromPlan(apply) {
    if (!apply || !apply.shouldApply) {
        if (apply && apply.errorStatusMessage) rt().call.showStatus(apply.errorStatusMessage, 'error');
        return;
    }

    Object.entries(apply.elementPatches).forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });

    if (apply.costLogMessage != null) {
        console.log(apply.costLogMessage, {
            distanceUnit,
            totalCost: apply.costLogTotalCost.toFixed(2),
        });
    }
}

/**
 * prepareRouteSharing function
 * @function prepareRouteSharing
 * @returns {*} Return value description
 */
function prepareRouteSharing() {
    const orch = RS().buildPrepareRouteSharingOrchestrationPlan(
        collectPrepareRouteSharingInput()
    );
    applyPrepareRouteSharingFromPlan(orch.apply);
}

function applyGenerateShareLinkFromPlan(execute) {
    if (!execute || !execute.shouldGenerate) {
        if (execute && execute.errorStatusMessage) rt().call.showStatus(execute.errorStatusMessage, 'error');
        return;
    }

    const shareLinkInput = document.getElementById(execute.shareLinkInputId);
    if (shareLinkInput) shareLinkInput.value = execute.shareLink;
    const linkContainer = document.getElementById(execute.showContainerId);
    if (linkContainer) linkContainer.style.display = execute.showContainerDisplay;
    const qrContainer = document.getElementById(execute.hideContainerId);
    if (qrContainer) qrContainer.style.display = execute.hideContainerDisplay;

    rt().call.showStatus(execute.successStatusMessage, execute.successStatusType);
}

/**
 * generateShareLink function
 * @function generateShareLink
 * @returns {*} Return value description
 */
function generateShareLink() {
    applyGenerateShareLinkFromPlan(
        RS().buildGenerateShareLinkEntryOrchestrationPlan(
            buildEncodedShareLinkPlan(true)
        ).execute
    );
}

function applyGenerateQrCodeFromPlan(execute) {
    if (!execute || !execute.shouldGenerate) {
        if (execute && execute.errorStatusMessage) rt().call.showStatus(execute.errorStatusMessage, 'error');
        return;
    }

    const qrContainer = document.getElementById(execute.qrContainerId);
    if (!qrContainer) return;
    if (execute.clearQrContainer) qrContainer.innerHTML = '';

    const qrImage = document.createElement('img');
    qrImage.src = execute.qrImageUrl;
    qrImage.alt = execute.imageAlt;
    qrImage.style.cssText = execute.imageStyleCssText;
    qrContainer.appendChild(qrImage);

    if (execute.storeQrImageUrl) window.qrImageUrl = execute.qrImageUrl;

    const qrCodeContainer = document.getElementById(execute.qrCodeContainerId);
    if (qrCodeContainer && execute.showQrCodeContainer) qrCodeContainer.style.display = 'block';
    const shareLinkContainer = document.getElementById(execute.shareLinkContainerId);
    if (shareLinkContainer && execute.hideShareLinkContainer) shareLinkContainer.style.display = 'none';

    rt().call.showStatus(execute.successStatusMessage, execute.successStatusType);
}

/**
 * generateQRCode function
 * @function generateQRCode
 * @returns {*} Return value description
 */
function generateQRCode() {
    applyGenerateQrCodeFromPlan(
        RS().buildGenerateQrCodeEntryOrchestrationPlan(
            buildEncodedShareLinkPlan(false)
        ).execute
    );
}

function collectShareChannelInput() {
    return {
        route: window.lastCalculatedRoute,
        fmt: buildRouteShareFormatInput(),
    };
}

function applyCopyShareLinkFromPlan(execute) {
    if (!execute || !execute.shouldCopy) return;

    const shareLink = document.getElementById(execute.shareLinkInputId);
    if (!shareLink) return;
    shareLink.select();
    document.execCommand('copy');
    rt().call.showStatus(execute.successStatusMessage, execute.successStatusType);
}

/**
 * copyShareLink function
 * @function copyShareLink
 * @returns {*} Return value description
 */
function copyShareLink() {
    applyCopyShareLinkFromPlan(
        RS().buildCopyShareLinkEntryOrchestrationPlan().execute
    );
}

function applyDownloadQrCodeFromPlan(execute) {
    if (!execute || !execute.shouldDownload) {
        if (execute && execute.errorStatusMessage) {
            rt().call.showStatus(execute.errorStatusMessage, execute.errorStatusType);
        }
        return;
    }

    const link = document.createElement('a');
    link.href = execute.imageUrl;
    link.download = execute.downloadFileName;
    link.click();

    rt().call.showStatus(execute.successStatusMessage, execute.successStatusType);
}

/**
 * downloadQRCode function
 * @function downloadQRCode
 * @returns {*} Return value description
 */
function downloadQRCode() {
    applyDownloadQrCodeFromPlan(
        RS().buildDownloadQrCodeEntryOrchestrationPlan(window.qrImageUrl).execute
    );
}

function applyShareViaWhatsAppFromPlan(execute) {
    if (!execute || !execute.shouldShare) {
        if (execute && execute.errorStatusMessage) {
            rt().call.showStatus(execute.errorStatusMessage, execute.errorStatusType);
        }
        return;
    }

    window.open(execute.openUrl, execute.openInNewTab ? '_blank' : '_self');
    rt().call.showStatus(execute.statusMessage, execute.statusType);
}

/**
 * shareViaWhatsApp function
 * @function shareViaWhatsApp
 * @returns {*} Return value description
 */
function shareViaWhatsApp() {
    const input = collectShareChannelInput();
    applyShareViaWhatsAppFromPlan(
        RS().buildShareViaWhatsAppEntryOrchestrationPlan(input.route, input.fmt).execute
    );
}

function applyShareViaEmailFromPlan(execute) {
    if (!execute || !execute.shouldShare) {
        if (execute && execute.errorStatusMessage) {
            rt().call.showStatus(execute.errorStatusMessage, execute.errorStatusType);
        }
        return;
    }

    window.location.href = execute.mailtoUrl;
    rt().call.showStatus(execute.statusMessage, execute.statusType);
}

/**
 * shareViaEmail function
 * @function shareViaEmail
 * @returns {*} Return value description
 */
function shareViaEmail() {
    const input = collectShareChannelInput();
    applyShareViaEmailFromPlan(
        RS().buildShareViaEmailEntryOrchestrationPlan(input.route, input.fmt).execute
    );
}
    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        loadSharedRouteFromUrl: loadSharedRouteFromUrl,
        prepareRouteSharing: prepareRouteSharing,
        generateShareLink: generateShareLink,
        generateQRCode: generateQRCode,
        copyShareLink: copyShareLink,
        downloadQRCode: downloadQRCode,
        shareViaWhatsApp: shareViaWhatsApp,
        shareViaEmail: shareViaEmail,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSharingOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
