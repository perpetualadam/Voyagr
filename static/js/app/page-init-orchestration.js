/**
 * @file Window load initialization orchestration (settings, voice, layers, preferences).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var lifecycleListenersRegistered = false;

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

    function scheduleOpenVolumeHint() {
        try {
            const DE = rt().deviceEnvironment();
            const openHint = DE.buildOpenVolumeHintSchedulePlan({
                alreadyShown: sessionStorage.getItem(DE.OPEN_VOLUME_HINT_SESSION_KEY) === 'true',
            });
            if (openHint.shouldSchedule) {
                sessionStorage.setItem(openHint.sessionStorageKey, openHint.sessionStorageValue);
                setTimeout(() => {
                    try {
                        rt().call.showVolumeHintForNavigation();
                    } catch (e) {
                        console.warn(openHint.errorLogPrefix, e);
                    }
                }, openHint.delayMs);
            }
        } catch (e) {
            console.warn(rt().deviceEnvironment().buildOpenVolumeHintSchedulePlan().scheduleErrorLogPrefix, e);
        }
    }

    function initCoreOnWindowLoad() {
        const call = rt().call;

        console.log('[Voice] Initializing voice system');
        call.initVoiceRecognition();
        call.setupVoiceCommandProcessing();
        call.initGeocodeCache();

        console.log('[Settings] Loading all persistent settings...');
        call.ensureDefaultTrafficAwareRouting();
        call.loadAllSettings();
        call.applySettingsToUI();
        call.initializeDarkMode();
        call.updateThemeButtons();

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

    /**
     * Full window load pipeline (order preserved from legacy scattered listeners).
     */
    function onWindowLoad() {
        const call = rt().call;

        call.loadFavorites();
        call.initPhase3Features();

        call.restoreAppState();
        void call.initSupabaseAuth();
        call.tryResumeNavigation();
        call.initDeviceEnvironmentNotifications();
        scheduleOpenVolumeHint();

        initCoreOnWindowLoad();

        call.initMobilePwaOnPageLoad();
    }

    function handleViewportResize() {
        console.log('[Viewport] Window resized; follow padding recomputed on next frame');
        if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
            window.__voyagrMapResizeAndRepaint();
            return;
        }

        const map = rt().getMap();
        if (map && typeof map.resize === 'function') {
            map.resize();
        }
    }

    function registerPageLifecycleListeners() {
        if (lifecycleListenersRegistered || typeof window === 'undefined') return;
        lifecycleListenersRegistered = true;
        window.addEventListener('resize', handleViewportResize);
        window.addEventListener('load', onWindowLoad);
    }

    /** @deprecated Use onWindowLoad via registerPageLifecycleListeners */
    function initOnWindowLoad() {
        initCoreOnWindowLoad();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        initOnWindowLoad: initOnWindowLoad,
        onWindowLoad: onWindowLoad,
        registerPageLifecycleListeners: registerPageLifecycleListeners,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPageInitOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
