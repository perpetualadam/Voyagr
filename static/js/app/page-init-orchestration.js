/**
 * @file Window load initialization orchestration (settings, voice, layers, preferences).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[PageInit] Orchestration runtime not bound');
        }
        return runtime;
    }

    function initRoadLabelsWhenMapReady() {
        const map = rt().getMap();
        const call = rt().call;

        console.log('[Road Labels] Initializing road labels...');
        if (typeof map !== 'undefined' && map) {
            if (map.isStyleLoaded()) {
                call.initializeRoadLabels();
            } else {
                map.once('style.load', () => {
                    call.initializeRoadLabels();
                });
            }
        } else {
            setTimeout(() => {
                const deferredMap = rt().getMap();
                if (typeof deferredMap !== 'undefined' && deferredMap) {
                    call.initializeRoadLabels();
                }
            }, 1000);
        }
    }

    function initPorcupineAutoStart() {
        void (async () => {
            const PW = rt().porcupineWake();
            const autoStart = PW.buildPorcupineInitAutoStartPlan({
                storageEnabled: localStorage.getItem(PW.VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) === 'true',
                configured: rt().call.picovoiceClientConfigured(),
            });
            if (autoStart.shouldStart) {
                await rt().call.startPorcupineWakePipeline();
            }
        })();
    }

    function initOnWindowLoad() {
        const call = rt().call;

        console.log('[Voice] Initializing voice system');
        call.initVoiceRecognition();
        call.setupVoiceCommandProcessing();
        call.initGeocodeCache();

        console.log('[Settings] Loading all persistent settings...');
        call.ensureDefaultTrafficAwareRouting();
        call.loadAllSettings();
        call.applySettingsToUI();

        console.log('[Parking] Loading parking preferences...');
        call.loadParkingPreferences();

        console.log('[Voice] Loading voice preferences...');
        call.loadVoicePreferences();
        call.loadPorcupineWakeUi();
        initPorcupineAutoStart();

        call.loadPreferences();

        console.log('[Traffic] Initializing traffic layer...');
        call.initTrafficLayer();

        console.log('[Weather] Initializing weather layer...');
        call.initWeatherLayer();

        initRoadLabelsWhenMapReady();

        console.log(
            '[Init] Vehicle Type:',
            rt().getCurrentVehicleType(),
            'Routing Mode:',
            rt().getCurrentRoutingMode(),
            'Smart Zoom:',
            rt().getSmartZoomEnabled()
        );
        console.log('[Init] All settings loaded and applied successfully');
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        initOnWindowLoad: initOnWindowLoad,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPageInitOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
