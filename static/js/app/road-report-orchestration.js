/**
 * @file Road report modal orchestration (open, close, submit hazard reports).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[RoadReport] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RR() { return rt().roadReport(); }

    function openRoadReportModal() {
        const execute = RR().buildOpenRoadReportModalExecutePlan();
        if (!execute.shouldOpen) return;
        const m = document.getElementById(execute.modalId);
        if (!m) return;
        const notes = document.getElementById(execute.notesId);
        if (notes && execute.clearNotes) notes.value = '';
        m.style.display = execute.modalDisplay;
    }

    function closeRoadReportModal() {
        const execute = RR().buildCloseRoadReportModalExecutePlan();
        if (!execute.shouldClose) return;
        const m = document.getElementById(execute.modalId);
        if (m) m.style.display = execute.modalDisplay;
    }

    async function submitRoadReport() {
        const roadReport = RR();
        const collected = roadReport.buildSubmitRoadReportCollectPlan({
            lat: rt().getCurrentLat(),
            lon: rt().getCurrentLon(),
        });
        if (!collected.hasGpsFix) {
            const fetchPlan = roadReport.buildSubmitRoadReportFetchPlan();
            rt().call.showStatus(fetchPlan.gpsRequiredStatusMessage, fetchPlan.gpsRequiredStatusType);
            return;
        }

        const typeEl = document.getElementById(roadReport.ROAD_REPORT_TYPE_ID);
        const hazard_type = typeEl ? typeEl.value : 'other';
        const notesEl = document.getElementById(roadReport.ROAD_REPORT_NOTES_ID);
        const description = (notesEl && notesEl.value) || '';
        const fetchPlan = roadReport.buildSubmitRoadReportFetchPlan({
            lat: collected.lat,
            lon: collected.lon,
            hazardType: hazard_type,
            description: description,
        });

        try {
            const r = await fetch(fetchPlan.url, {
                method: fetchPlan.method,
                headers: fetchPlan.headers,
                body: JSON.stringify(fetchPlan.body),
            });
            const data = await r.json();
            if (data.success) {
                rt().call.showStatus(fetchPlan.successStatusMessage, fetchPlan.successStatusType);
                if (fetchPlan.closeModalOnSuccess) closeRoadReportModal();
            } else {
                rt().call.showStatus(data.error || fetchPlan.errorStatusPrefix, 'error');
            }
        } catch (e) {
            rt().call.showStatus(fetchPlan.errorStatusPrefix + ': ' + e.message, 'error');
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        openRoadReportModal: openRoadReportModal,
        closeRoadReportModal: closeRoadReportModal,
        submitRoadReport: submitRoadReport,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoadReportOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
