/**
 * @file Best-time-to-leave analysis panel orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[BestTimeLeave] Orchestration runtime not bound');
        }
        return runtime;
    }

    function BTL() { return rt().bestTimeLeave(); }

    function analysebestTimeToLeave() {
        const startInput = document.getElementById('start');
        const endInput = document.getElementById('end');

        if (!startInput || !endInput || !startInput.value || !endInput.value) {
            rt().call.showStatus('Enter start and end locations first', 'error');
            return;
        }

        const startVal = startInput.value.trim();
        const endVal = endInput.value.trim();

        let startLat;
        let startLon;
        let endLat;
        let endLon;

        const startDataLat = startInput.getAttribute('data-lat');
        const startDataLon = startInput.getAttribute('data-lon');
        const endDataLat = endInput.getAttribute('data-lat');
        const endDataLon = endInput.getAttribute('data-lon');

        if (startDataLat && startDataLon) {
            startLat = parseFloat(startDataLat);
            startLon = parseFloat(startDataLon);
        } else {
            const parts = startVal.split(',');
            if (parts.length === 2) {
                startLat = parseFloat(parts[0]);
                startLon = parseFloat(parts[1]);
            }
        }

        if (endDataLat && endDataLon) {
            endLat = parseFloat(endDataLat);
            endLon = parseFloat(endDataLon);
        } else {
            const parts = endVal.split(',');
            if (parts.length === 2) {
                endLat = parseFloat(parts[0]);
                endLon = parseFloat(parts[1]);
            }
        }

        if (!startLat || !endLat) {
            rt().call.showStatus('Geocode locations first (calculate a route)', 'error');
            return;
        }

        rt().call.showStatus('Analysing traffic patterns...', 'loading');

        fetch('/api/best-time-to-leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_lat: startLat,
                start_lon: startLon,
                end_lat: endLat,
                end_lon: endLon,
            }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    const container = document.getElementById('bestTimeResult');
                    const slotsDiv = document.getElementById('bestTimeSlots');
                    if (!container || !slotsDiv) return;

                    const sortedSlots = data.all_slots.slice().sort((a, b) => {
                        const timeA = a.time.split(':').map(Number);
                        const timeB = b.time.split(':').map(Number);
                        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
                    });

                    slotsDiv.innerHTML = BTL().buildBestTimeSlotsPanelHtml(sortedSlots, data.best_time, {
                        source: data.source,
                        analysed_at: data.analysed_at,
                    });
                    container.style.display = 'block';
                    rt().call.showStatus('Traffic analysis complete', 'success');
                } else {
                    rt().call.showStatus(data.error || 'Analysis failed', 'error');
                }
            })
            .catch((err) => {
                console.error('[BestTime] Error:', err);
                rt().call.showStatus('Analysis failed', 'error');
            });
    }

    function applyBestDepartureTime(timeStr) {
        const today = new Date();
        const parts = timeStr.split(':');
        today.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
        const dtInput = document.getElementById('departureTime');
        if (dtInput) {
            const formatted = today.toISOString().slice(0, 16);
            dtInput.value = formatted;
            localStorage.setItem('pref_departureTime', formatted);
            rt().call.showStatus(`Departure time set to ${timeStr}`, 'success');
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        analysebestTimeToLeave: analysebestTimeToLeave,
        applyBestDepartureTime: applyBestDepartureTime,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrBestTimeLeaveOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
