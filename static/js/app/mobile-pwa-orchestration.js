/**
 * @file Mobile PWA install banner, haptics, and lifecycle orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var deferredInstallPrompt = null;
    var installPromptListenerBound = false;

    function rt() {
        if (!runtime) {
            throw new Error('[MobilePwa] Orchestration runtime not bound');
        }
        return runtime;
    }

    function PWA() { return rt().pwaInstall(); }

    function isStandalonePWA() {
        return (window.matchMedia('(display-mode: standalone)').matches) ||
            (window.navigator.standalone === true) ||
            document.referrer.includes('android-app://');
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    function isAndroid() {
        return /Android/.test(navigator.userAgent);
    }

    function dismissAddToHomeScreenForDays(days) {
        const el = document.getElementById(PWA().PWA_BANNER_ID);
        if (el) el.remove();
        const ms = days * 24 * 60 * 60 * 1000;
        localStorage.setItem('voyagr_add_homescreen_dismiss_until', String(Date.now() + ms));
    }

    function tryShowInstallBanner() {
        if (typeof isStandalonePWA !== 'function' || isStandalonePWA()) return;

        const dismissUntil = parseInt(localStorage.getItem('voyagr_add_homescreen_dismiss_until') || '0', 10);
        if (dismissUntil && Date.now() < dismissUntil) return;

        const ios = typeof isIOS === 'function' && isIOS();
        const deferred = deferredInstallPrompt;
        const mode = ios ? 'ios' : deferred ? 'install' : 'generic';

        const existing = document.getElementById(PWA().PWA_BANNER_ID);
        if (existing) {
            const cur = existing.getAttribute('data-mode');
            if (cur === mode) return;
            if (cur === 'generic' && mode === 'install') {
                existing.remove();
            } else if (cur === 'ios' || cur === 'install') {
                return;
            } else if (cur === 'generic' && mode === 'generic') {
                return;
            }
        }

        if (document.getElementById(PWA().PWA_BANNER_ID)) return;

        const pwa = PWA();
        const bar = document.createElement('div');
        bar.id = pwa.PWA_BANNER_ID;
        bar.setAttribute('data-mode', mode);
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'Add Voyagr to home screen');
        bar.style.cssText = pwa.getPwaInstallBannerStyleCssText();

        const msg = document.createElement('div');
        msg.style.flex = '1';
        msg.style.minWidth = '200px';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.flexShrink = '0';

        const btnLater = document.createElement('button');
        btnLater.type = 'button';
        btnLater.textContent = 'Not now';
        btnLater.style.cssText = pwa.getPwaDismissButtonStyleCssText();
        btnLater.onclick = () => dismissAddToHomeScreenForDays(14);

        if (mode === 'ios') {
            msg.innerHTML = pwa.buildPwaInstallMessageHtml('ios');
            actions.appendChild(btnLater);
        } else if (mode === 'install') {
            msg.innerHTML = pwa.buildPwaInstallMessageHtml('install');
            const btnInstall = document.createElement('button');
            btnInstall.type = 'button';
            btnInstall.textContent = 'Add to Home screen';
            btnInstall.style.cssText = pwa.getPwaPrimaryButtonStyleCssText();
            btnInstall.onclick = async () => {
                const ev = deferredInstallPrompt;
                if (!ev) return;
                try {
                    await ev.prompt();
                    await ev.userChoice;
                } catch (_) { /* ignore */ }
                deferredInstallPrompt = null;
                dismissAddToHomeScreenForDays(365);
            };
            actions.appendChild(btnLater);
            actions.appendChild(btnInstall);
        } else {
            msg.innerHTML = pwa.buildPwaInstallMessageHtml('generic');
            const btnOk = document.createElement('button');
            btnOk.type = 'button';
            btnOk.textContent = 'Got it';
            btnOk.style.cssText = pwa.getPwaPrimaryButtonStyleCssText();
            btnOk.onclick = () => dismissAddToHomeScreenForDays(14);
            actions.appendChild(btnLater);
            actions.appendChild(btnOk);
        }

        bar.appendChild(msg);
        bar.appendChild(actions);
        document.body.appendChild(bar);
    }

    function triggerHaptic(type) {
        if (type === undefined) type = 'light';
        if ('vibrate' in navigator) {
            const durations = {
                selection: 10,
                light: 15,
                medium: 30,
                heavy: 50,
            };
            navigator.vibrate(durations[type] || 15);
        }
    }

    function initMobileEnhancements() {
        console.log('[Mobile] Initializing mobile enhancements');
        console.log('[Mobile] Standalone PWA:', isStandalonePWA());
        console.log('[Mobile] iOS:', isIOS());
        console.log('[Mobile] Android:', isAndroid());

        document.querySelectorAll('.fab, .sheet-icon-btn').forEach((fab) => {
            fab.addEventListener('touchstart', () => {
                triggerHaptic('light');
                fab.classList.add('haptic-feedback');
            }, { passive: true });
            fab.addEventListener('touchend', () => {
                setTimeout(() => fab.classList.remove('haptic-feedback'), 150);
            }, { passive: true });
        });

        document.querySelectorAll('.btn, .quick-btn, .toggle-btn').forEach((btn) => {
            btn.addEventListener('touchstart', () => {
                triggerHaptic('selection');
            }, { passive: true });
        });

        if (isIOS() && isStandalonePWA()) {
            document.body.classList.add('ios-standalone');
            const meta = document.querySelector('meta[name="viewport"]');
            if (meta) {
                meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
            }
        }

        if (isAndroid() && isStandalonePWA()) {
            window.addEventListener('popstate', (e) => {
                const bottomSheet = document.getElementById('bottomSheet');
                if (bottomSheet && bottomSheet.classList.contains('expanded')) {
                    e.preventDefault();
                    rt().call.collapseBottomSheet();
                    history.pushState(null, '', location.href);
                }
            });
            history.pushState(null, '', location.href);
        }

        document.body.addEventListener('touchmove', (e) => {
            // Do not cancel touchmoves on sheet chrome / FABs / controls. Firefox maps
            // preventDefault(touchmove) to pointercancel, which killed bottom-sheet and
            // hamburger gestures while pull-to-refresh blocking was still desired on the map.
            const allowPlan = rt().domHelpers().buildPullToRefreshTouchMoveAllowPlan(e.target);
            if (allowPlan.allowNativeTouchMove) {
                return;
            }
            if (window.scrollY === 0 && e.touches[0] && e.touches[0].clientY > 0) {
                e.preventDefault();
            }
        }, { passive: false });

        const bottomSheetContent = document.querySelector('.bottom-sheet-content');
        const bottomSheetElement = document.getElementById('bottomSheet');

        if (bottomSheetContent && bottomSheetElement) {
            let startY = 0;

            bottomSheetContent.addEventListener('touchstart', (e) => {
                startY = e.touches[0].clientY;
            }, { passive: true });

            bottomSheetContent.addEventListener('touchmove', (e) => {
                const currentY = e.touches[0].clientY;
                const scrollTop = bottomSheetContent.scrollTop;
                const scrollHeight = bottomSheetContent.scrollHeight;
                const clientHeight = bottomSheetContent.clientHeight;
                const isAtTop = scrollTop <= 0;
                const isAtBottom = scrollTop + clientHeight >= scrollHeight;
                const isPullingDown = currentY > startY;
                const isPullingUp = currentY < startY;

                if ((isAtTop && isPullingDown) || (isAtBottom && isPullingUp)) {
                    /* allow sheet drag / boundary bounce */
                }
            }, { passive: true });
        }

        window.addEventListener('orientationchange', () => {
            console.log('[Mobile] Orientation changed:', screen.orientation?.type || window.orientation);
            setTimeout(() => {
                const map = rt().getMap();
                if (map && typeof map.resize === 'function') {
                    map.resize();
                }
            }, 200);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('[Mobile] App came to foreground');
                if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
                    window.__voyagrMapResizeAndRepaint();
                } else {
                    const map = rt().getMap();
                    if (map && typeof map.resize === 'function') {
                        map.resize();
                    }
                }
                // Resume GPS/wake-lock after background or screen-off. Do not call
                // startGPSTracking() here — it toggles off when already active.
                applyNavigationForegroundResume('visibilitychange');
            } else {
                console.log('[Mobile] App went to background');
            }
        });

        window.addEventListener('pageshow', (ev) => {
            if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
                if (ev.persisted) {
                    console.log('[Mobile] pageshow (restored from bfcache) — resyncing map');
                }
                window.__voyagrMapResizeAndRepaint();
            }
            applyNavigationForegroundResume(ev.persisted ? 'pageshow-bfcache' : 'pageshow');
        });

        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
                    window.__voyagrMapResizeAndRepaint();
                }
            }, 350);
        });

        setTimeout(() => {
            document.body.classList.add('transitions-enabled');
        }, 300);

        console.log('[Mobile] Mobile enhancements initialized');
    }

    async function requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persisted();
            console.log('[PWA] Storage persisted:', isPersisted);
            if (!isPersisted) {
                const result = await navigator.storage.persist();
                console.log('[PWA] Persistent storage granted:', result);
            }
        }
    }

    async function checkStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = (estimate.usage / estimate.quota * 100).toFixed(2);
            console.log(`[PWA] Storage used: ${usage}% (${(estimate.usage / 1024 / 1024).toFixed(2)} MB of ${(estimate.quota / 1024 / 1024).toFixed(2)} MB)`);
            return estimate;
        }
        return null;
    }

    /**
     * After returning from another app / screen-off, restore GPS watch and wake lock
     * so the vehicle marker keeps updating through arrival.
     * @param {string} [reason]
     */
    function applyNavigationForegroundResume(reason) {
        try {
            if (typeof rt().call.ensureGPSTracking === 'function') {
                const gpsPlan = rt().call.ensureGPSTracking({
                    documentVisible: true,
                    // Be quicker to revive a stalled watch after another app / screen-off.
                    staleAfterMs: 15000,
                });
                if (gpsPlan && gpsPlan.shouldRestart) {
                    console.log('[Mobile] GPS ensure on', reason || 'resume', gpsPlan.reason);
                }
            }
            if (typeof rt().call.ensureNavWakeLock === 'function') {
                rt().call.ensureNavWakeLock({ documentVisible: true });
            }
            if (typeof rt().call.redrawNavigationVehicleMarker === 'function' &&
                (rt().getRouteInProgress() || rt().getIsTrackingActive())) {
                rt().call.redrawNavigationVehicleMarker(reason || 'foreground resume');
            }
        } catch (e) {
            console.warn('[Mobile] Foreground nav resume failed:', e);
        }
    }

    function initInstallPromptListener() {
        if (installPromptListenerBound || typeof window === 'undefined') return;
        installPromptListenerBound = true;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            tryShowInstallBanner();
        });
    }

    function initOnPageLoad() {
        initMobileEnhancements();
        void requestPersistentStorage();
        void checkStorageUsage();
        setTimeout(() => tryShowInstallBanner(), 2200);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        initInstallPromptListener();
    }

    var api = {
        bind: bind,
        isStandalonePWA: isStandalonePWA,
        isIOS: isIOS,
        isAndroid: isAndroid,
        tryShowInstallBanner: tryShowInstallBanner,
        triggerHaptic: triggerHaptic,
        initMobileEnhancements: initMobileEnhancements,
        initOnPageLoad: initOnPageLoad,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMobilePwaOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
