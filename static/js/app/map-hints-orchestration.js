/**
 * @file Map icon hints orchestration (touch long-press, hint modal, FAB overlap).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[MapHints] Orchestration runtime not bound');
        }
        return runtime;
    }

    function MC() { return rt().mapControls(); }

    function updateRoadReportFabVisibility() {
        rt().call.syncBottomSheetOverlapFabs();
    }

    function voyagrTouchHintsEnabled() {
        return MC().isTouchHintsEnvironment({
            navigator: typeof navigator !== 'undefined' ? navigator : null,
            window: typeof window !== 'undefined' ? window : null,
        });
    }

    function voyagrShowMapIconHint(message) {
        const mapControls = MC();
        const execute = mapControls.buildShowMapHintToastExecutePlan(message);
        if (!execute.shouldShow) return;

        const el = document.getElementById(execute.toastId);
        if (!el) return;
        el.textContent = execute.message;
        el.removeAttribute('hidden');
        el.classList.add(execute.visibleClass);
        if (execute.clearExistingTimer && window[execute.timerProperty]) {
            clearTimeout(window[execute.timerProperty]);
        }
        window[execute.timerProperty] = setTimeout(() => {
            el.classList.remove(execute.visibleClass);
            el.setAttribute('hidden', '');
        }, execute.autoDismissMs);
    }

    function openMapControlsHintModal() {
        const mapControls = MC();
        const execute = mapControls.buildOpenMapControlsHintModalExecutePlan();
        if (!execute.shouldOpen) return;

        const m = document.getElementById(execute.modalId);
        const ul = document.getElementById(execute.listId);
        if (!m || !ul) return;
        ul.innerHTML = '';

        (execute.sections || []).forEach((sec) => {
            const secTitle = document.createElement('li');
            secTitle.className = execute.sectionTitleClass;
            secTitle.textContent = sec.title;
            ul.appendChild(secTitle);
            const nodes = document.querySelectorAll(sec.selector);
            for (let i = 0; i < nodes.length; i++) {
                const el = nodes[i];
                if (mapControls.shouldSkipMapControlsHintElement(el.id)) continue;
                const hint = el.getAttribute('title') || el.getAttribute('aria-label');
                if (!hint) continue;
                const st = window.getComputedStyle(el);
                if (!mapControls.isMapControlsHintElementVisible(st.display, st.visibility)) continue;
                const li = document.createElement('li');
                li.className = execute.itemClass;
                li.textContent = mapControls.formatMapControlsHintItemLabel(el.textContent, hint);
                ul.appendChild(li);
            }
        });

        const exTitle = document.createElement('li');
        exTitle.className = execute.sectionTitleClass;
        exTitle.textContent = execute.extrasSectionTitle;
        ul.appendChild(exTitle);
        (execute.extras || []).forEach((extra) => {
            const li = document.createElement('li');
            li.className = execute.itemClass;
            li.textContent = extra;
            ul.appendChild(li);
        });

        m.style.display = execute.modalDisplay;
    }

    function closeMapControlsHintModal() {
        const execute = MC().buildCloseMapControlsHintModalExecutePlan();
        if (!execute.shouldClose) return;
        const modal = document.getElementById(execute.modalId);
        if (modal) modal.style.display = execute.modalDisplay;
    }

    function voyagrBindFabLongPressHint(el, initPlan) {
        const mapControls = MC();
        initPlan = initPlan || mapControls.buildInitMobileMapIconHintsPlan({ touchHintsEnabled: true });
        const bind = mapControls.buildFabLongPressHintBindPlan(initPlan);
        if (!bind.shouldBind || !el || el.dataset[bind.datasetKey] === bind.datasetValue) return;
        el.dataset[bind.datasetKey] = bind.datasetValue;

        let timer = null;
        let startX = 0;
        let startY = 0;
        const LONG_MS = bind.longPressMs;
        const MOVE_PX2 = bind.moveThresholdPx2;

        const getHint = () => {
            const t = el.getAttribute('title');
            if (t) return t.trim();
            const a = el.getAttribute('aria-label');
            return a ? a.trim() : '';
        };

        const clearTimer = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        const scheduleHint = (cx, cy) => {
            startX = cx;
            startY = cy;
            clearTimer();
            timer = setTimeout(() => {
                timer = null;
                const hint = getHint();
                if (!hint) return;
                el.dataset[bind.suppressClickDataset] = '1';
                voyagrShowMapIconHint(hint);
                try {
                    if (navigator.vibrate) navigator.vibrate(bind.vibrateMs);
                } catch (_v) {
                    /* ignore */
                }
            }, LONG_MS);
        };

        const onMove = (cx, cy) => {
            if (!timer) return;
            const dx = cx - startX;
            const dy = cy - startY;
            if (dx * dx + dy * dy > MOVE_PX2) clearTimer();
        };

        if (window.PointerEvent) {
            el.addEventListener(
                'pointerdown',
                (e) => {
                    if (!e.isPrimary) return;
                    if (bind.skipMousePointers && e.pointerType === 'mouse') return;
                    scheduleHint(e.clientX, e.clientY);
                },
                { passive: true }
            );
            el.addEventListener(
                'pointermove',
                (e) => {
                    if (!timer || !e.isPrimary) return;
                    onMove(e.clientX, e.clientY);
                },
                { passive: true }
            );
            el.addEventListener('pointerup', clearTimer, { passive: true });
            el.addEventListener('pointercancel', clearTimer, { passive: true });
        } else {
            el.addEventListener(
                'touchstart',
                (e) => {
                    if (bind.singleTouchOnly && e.touches.length !== 1) return;
                    scheduleHint(e.touches[0].clientX, e.touches[0].clientY);
                },
                { passive: true }
            );
            el.addEventListener(
                'touchmove',
                (e) => {
                    if (!e.touches[0]) return;
                    onMove(e.touches[0].clientX, e.touches[0].clientY);
                },
                { passive: true }
            );
            el.addEventListener('touchend', clearTimer, { passive: true });
            el.addEventListener('touchcancel', clearTimer, { passive: true });
        }

        el.addEventListener(
            'click',
            (e) => {
                if (el.dataset[bind.suppressClickDataset] === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    delete el.dataset[bind.suppressClickDataset];
                }
            },
            true
        );
    }

    function initMobileMapIconHints() {
        const mapControls = MC();
        const initPlan = mapControls.buildInitMobileMapIconHintsPlan({
            touchHintsEnabled: voyagrTouchHintsEnabled(),
        });
        if (!initPlan.shouldInit) {
            console.log(initPlan.skipLogMessage);
            return;
        }
        console.log(initPlan.enabledLogMessage);

        for (let r = 0; r < initPlan.rootSelectors.length; r++) {
            const rootEl = document.querySelector(initPlan.rootSelectors[r]);
            if (!rootEl) continue;
            const buttons = rootEl.querySelectorAll(initPlan.buttonSelector);
            for (let i = 0; i < buttons.length; i++) {
                voyagrBindFabLongPressHint(buttons[i], initPlan);
            }
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        updateRoadReportFabVisibility: updateRoadReportFabVisibility,
        voyagrTouchHintsEnabled: voyagrTouchHintsEnabled,
        voyagrShowMapIconHint: voyagrShowMapIconHint,
        openMapControlsHintModal: openMapControlsHintModal,
        closeMapControlsHintModal: closeMapControlsHintModal,
        initMobileMapIconHints: initMobileMapIconHints,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapHintsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
