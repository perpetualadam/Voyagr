if (typeof window !== 'undefined' && window.ethereum) {
    try {
        Object.defineProperty(window, 'ethereum', {
            value: window.ethereum,
            writable: false,
            configurable: false
        });
    } catch (e) {
        // Ignore if property is already defined by extension
        console.log('[Init] Ethereum property already defined by extension');
    }
}

// Note: All global variables are declared in voyagr-core.js
// This file contains all the application logic and functions
// Variables: map, routeLayer, startMarker, endMarker, mapPickerMode
// Unit variables: distanceUnit, currencyUnit, speedUnit, temperatureUnit
// Currency symbols: currencySymbols
//
// VoyagrModules (modules/voyagr-modules.js) is the central registry for extracted
// navigation/UI modules. App-layer wrappers below inject live prefs from voyagr-core.

// ===== ROUTE PREFERENCE MIGRATION =====
// Toll pref migration runs in modules/navigation/route-prefs.js on module load.

function isAvoidTollsEnabled() {
    return _routePrefs().isAvoidTollsEnabled(localStorage);
}
window.isAvoidTollsEnabled = isAvoidTollsEnabled;

function getRouteCostParams(vehicleType) {
    const vt = vehicleType || (typeof currentVehicleType !== 'undefined' ? currentVehicleType : null);
    return _routePrefs().getRouteCostParams(vt, localStorage);
}
window.getRouteCostParams = getRouteCostParams;

// Note: All global variables are declared below
// ===== BOTTOM SHEET VARIABLES =====
let bottomSheetStartY = 0;
let bottomSheetCurrentY = 0;
let bottomSheetIsExpanded = false; // Tracks logical state (expanded or collapsed)

// ===== RECENT DESTINATIONS ORCHESTRATION =====
// Orchestration lives in static/js/app/recent-destinations-orchestration.js (bound at file end).

function getRecentDestinationsOrchestrationRuntime() {
    return {
        recentDestinations: () => _recentDestinations(),
    };
}

function loadRecentDestinations() {
    return VoyagrRecentDestinationsOrchestration.loadRecentDestinations();
}
function recordRecentDestination(label, lat, lon, kind) {
    return VoyagrRecentDestinationsOrchestration.recordRecentDestination(label, lat, lon, kind);
}

// ===== DEBUG SCROLL FUNCTION =====
window.debugScrollIssue = function() {
    const bsc = document.querySelector('.bottom-sheet-content');
    const rpt = document.getElementById('routePreviewTab');
    const navTab = document.getElementById('navigationTab');
    const settingsTab = document.getElementById('settingsTab');

    console.log('=== SCROLL DEBUG ===');
    console.log('bottom-sheet-content:', bsc ? {
        scrollHeight: bsc.scrollHeight,
        clientHeight: bsc.clientHeight,
        scrollTop: bsc.scrollTop,
        offsetHeight: bsc.offsetHeight,
        overflowY: getComputedStyle(bsc).overflowY,
        maxHeight: getComputedStyle(bsc).maxHeight,
        display: getComputedStyle(bsc).display
    } : 'NOT FOUND');

    console.log('routePreviewTab:', rpt ? {
        scrollHeight: rpt.scrollHeight,
        clientHeight: rpt.clientHeight,
        display: rpt.style.display,
        computedDisplay: getComputedStyle(rpt).display,
        overflow: getComputedStyle(rpt).overflow
    } : 'NOT FOUND');

    console.log('navigationTab:', navTab ? {
        display: navTab.style.display,
        computedDisplay: getComputedStyle(navTab).display
    } : 'NOT FOUND');

    console.log('settingsTab:', settingsTab ? {
        display: settingsTab.style.display,
        computedDisplay: getComputedStyle(settingsTab).display
    } : 'NOT FOUND');

    // Check all tabs
    const allTabs = document.querySelectorAll('.bottom-sheet-content > div[id$="Tab"]');
    console.log('All tabs:', Array.from(allTabs).map(t => ({
        id: t.id,
        display: t.style.display,
        computedDisplay: getComputedStyle(t).display,
        height: t.offsetHeight
    })));

    return 'Debug info logged above';
};

// ===== UNIT CONVERSION ORCHESTRATION =====
// Wrappers delegate to static/js/app/units-preferences-orchestration.js (bound at file end).

function convertDistance(km) { return VoyagrUnitsPreferencesOrchestration.convertDistance(km); }
function getDistanceUnit() { return VoyagrUnitsPreferencesOrchestration.getDistanceUnit(); }
function convertSpeed(kmh) { return VoyagrUnitsPreferencesOrchestration.convertSpeed(kmh); }
function getSpeedUnit() { return VoyagrUnitsPreferencesOrchestration.getSpeedUnit(); }
function convertTemperature(celsius) { return VoyagrUnitsPreferencesOrchestration.convertTemperature(celsius); }
function getTemperatureUnit() { return VoyagrUnitsPreferencesOrchestration.getTemperatureUnit(); }
function getCurrencySymbol() { return VoyagrUnitsPreferencesOrchestration.getCurrencySymbol(); }
function adjustCostForUnits(cost, costType = 'fuel') {
    return VoyagrUnitsPreferencesOrchestration.adjustCostForUnits(cost, costType);
}
function getFuelEfficiencyInUnits(liters_per_100km) {
    return VoyagrUnitsPreferencesOrchestration.getFuelEfficiencyInUnits(liters_per_100km);
}
function getFuelEfficiencyLabel() { return VoyagrUnitsPreferencesOrchestration.getFuelEfficiencyLabel(); }

// ===== NAVIGATION VARIABLES =====
let isTrackingActive = false;
let gpsWatchId = null;
let currentUserMarker = null;
let trackingHistory = [];
let lastZoomLevel = 13;
let smartZoomEnabled = (typeof VoyagrSmartZoom !== 'undefined'
    ? VoyagrSmartZoom.resolveSmartZoomEnabledFromStorage(localStorage.getItem('smartZoomEnabled'))
    : (localStorage.getItem('smartZoomEnabled') === null
        ? true
        : localStorage.getItem('smartZoomEnabled') === '1'));
// Navigation tracking state (global)
// These are now initialized in voyagr-core.js to prevent redeclaration errors
// let zoomAndFollowEnabled = ...;
// let mapFollowingActive = ...;
let navigationActive = false;

window.addEventListener('resize', () => {
    console.log('[Viewport] Window resized; follow padding recomputed on next frame');
    if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
        window.__voyagrMapResizeAndRepaint();
    } else if (typeof map !== 'undefined' && map && typeof map.resize === 'function') {
        map.resize();
    }
});

// ===== DARK MODE ORCHESTRATION =====
// Orchestration lives in static/js/app/dark-mode-orchestration.js (bound at file end).

function getDarkModeOrchestrationRuntime() {
    return {
        theme: () => _theme(),
        call: {
            showStatus,
            saveAllSettings,
        },
    };
}

function initializeDarkMode() { VoyagrDarkModeOrchestration.initializeDarkMode(); }
function applyTheme(theme) { VoyagrDarkModeOrchestration.applyTheme(theme); }
function toggleDarkMode() { VoyagrDarkModeOrchestration.toggleDarkMode(); }
function setTheme(theme) { VoyagrDarkModeOrchestration.setTheme(theme); }
function updateThemeButtons() { VoyagrDarkModeOrchestration.updateThemeButtons(); }

// Track previous tab for back navigation (state lives in tab-navigation-orchestration.js)

// ===== TAB NAVIGATION ORCHESTRATION =====
// Orchestration lives in static/js/app/tab-navigation-orchestration.js (bound at file end).

function getTabNavigationOrchestrationRuntime() {
    return {
        units: () => _units(),
        getDistanceUnit: () => distanceUnit,
        getCurrencyUnit: () => currencyUnit,
        getSpeedUnit: () => speedUnit,
        getTemperatureUnit: () => temperatureUnit,
        call: {
            applyDomSelectsFromPlan,
            loadRoutePreferences,
            loadMultiDropPreferences,
            loadVoicePreferences,
            loadPorcupineWakeUi,
            loadCameraAlertPreferences,
            loadAvoidancePreferences,
            loadHazardCameraTogglesFromApi,
            loadPromoEntitlementStatus,
            loadTripHistory,
            displayRouteComparison,
            prepareRouteSharing,
            loadRouteAnalytics,
            loadSavedRoutes,
        },
    };
}

function switchTab(tab) { VoyagrTabNavigationOrchestration.switchTab(tab); }
function getCurrentVisibleTab() { return VoyagrTabNavigationOrchestration.getCurrentVisibleTab(); }
function goBackToPreviousTab() { VoyagrTabNavigationOrchestration.goBackToPreviousTab(); }
function loadUnitPreferences() { VoyagrTabNavigationOrchestration.loadUnitPreferences(); }

// ===== UNITS PREFERENCES ORCHESTRATION =====
// Orchestration lives in static/js/app/units-preferences-orchestration.js (bound at file end).

function getUnitsPreferencesOrchestrationRuntime() {
    return {
        units: () => _units(),
        speedGps: () => _speedGps(),
        getDistanceUnit: () => distanceUnit,
        setDistanceUnit: (val) => { distanceUnit = val; },
        getCurrencyUnit: () => currencyUnit,
        setCurrencyUnit: (val) => { currencyUnit = val; },
        getSpeedUnit: () => speedUnit,
        setSpeedUnit: (val) => { speedUnit = val; },
        getTemperatureUnit: () => temperatureUnit,
        setTemperatureUnit: (val) => { temperatureUnit = val; },
        call: {
            updateAllDistanceDisplays,
            updateAllCostDisplays,
            updateAllSpeedDisplays,
            updateAllTemperatureDisplays,
            saveAllSettings,
            showStatus,
        },
    };
}

function updateDistanceUnit() { VoyagrUnitsPreferencesOrchestration.updateDistanceUnit(); }
function updateCurrencyUnit() { VoyagrUnitsPreferencesOrchestration.updateCurrencyUnit(); }
function updateSpeedUnit() { VoyagrUnitsPreferencesOrchestration.updateSpeedUnit(); }
function updateTemperatureUnit() { VoyagrUnitsPreferencesOrchestration.updateTemperatureUnit(); }
function saveUnitSettingsToBackend() { VoyagrUnitsPreferencesOrchestration.saveUnitSettingsToBackend(); }

// ===== COMPREHENSIVE PERSISTENT SETTINGS SYSTEM =====

// =============================================================================
// Multi-profile local storage (guest vs signed-in user)
// =============================================================================
// Orchestration lives in static/js/app/profile-store-orchestration.js (bound at file end).

function getProfileStoreOrchestrationRuntime() {
    return {
        getSupabaseClient: () => supabaseClient,
        call: {
            loadAllSettings,
            applySettingsToUI,
            loadSavedRoutes,
        },
    };
}

function getProfileStore() {
    return VoyagrProfileStoreOrchestration.getProfileStore();
}

function persistActiveProfile() {
    return VoyagrProfileStoreOrchestration.persistActiveProfile();
}

function ensureProfileExists(profileId) {
    return VoyagrProfileStoreOrchestration.ensureProfileExists(profileId);
}

function switchActiveProfile(profileId, options) {
    return VoyagrProfileStoreOrchestration.switchActiveProfile(profileId, options);
}

function scheduleSupabaseProfileSync() {
    return VoyagrProfileStoreOrchestration.scheduleSupabaseProfileSync();
}

async function pullProfileSnapshotFromSupabase(profileId) {
    return VoyagrProfileStoreOrchestration.pullProfileSnapshotFromSupabase(profileId);
}

// =============================================================================
// Support: Stripe subscription (link or Checkout) + BMC/Patreon tips from /api/config
// =============================================================================
function openVoyagerPremiumSection() {
    try {
        if (typeof expandBottomSheet === 'function') {
            expandBottomSheet();
        }
        switchTab('settings');
        setTimeout(() => {
            const el = document.getElementById('supportVoyagrSection');
            if (!el) return;
            if (el.style.display === 'none') {
                showStatus('Voyager Premium is not configured on this server yet (add Stripe or tip URLs in .env).', 'info');
                return;
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    } catch (e) {
        console.warn('[Voyager Premium] open section failed', e);
    }
}

function applySupportLinksFromConfig(cfg) {
    const section = document.getElementById('supportVoyagrSection');
    if (!section || !cfg) return;

    const pl = (cfg.stripe_payment_link_url || '').trim();
    const bmc = (cfg.buy_me_a_coffee_url || '').trim();
    const pat = (cfg.patreon_url || '').trim();
    const checkout = !!(cfg.stripe_subscription_checkout_available || cfg.stripe_checkout_available);

    const btnStripe = document.getElementById('supportStripePremiumBtn');
    const btnBmc = document.getElementById('supportBmcBtn');
    const btnPat = document.getElementById('supportPatreonBtn');

    const regionNote = (cfg.service_region_note || '').trim();

    const stripePremium = !!(pl || checkout);
    const show = !!(stripePremium || bmc || pat || regionNote);
    section.style.display = show ? 'block' : 'none';

    const regionEl = document.getElementById('serviceRegionNote');
    if (regionEl) {
        if (regionNote) {
            regionEl.style.display = 'block';
            regionEl.textContent = regionNote;
        } else {
            regionEl.style.display = 'none';
            regionEl.textContent = '';
        }
    }

    const trialNote = document.getElementById('supportStripeTrialNote');
    const trialDays = parseInt(cfg.stripe_subscription_trial_days, 10);
    const usesCheckout = !pl && checkout;
    if (trialNote) {
        if (Number.isFinite(trialDays) && trialDays > 0 && usesCheckout) {
            trialNote.style.display = 'block';
            trialNote.textContent =
                `Voyager Premium checkout includes a ${trialDays}-day free trial; billing starts after that. Set STRIPE_SUCCESS_URL to your public site (domain B) if you want users to land there after checkout.`;
        } else {
            trialNote.style.display = 'none';
            trialNote.textContent = '';
        }
    }

    if (btnStripe) {
        btnStripe.style.display = stripePremium ? 'block' : 'none';
        if (pl) {
            btnStripe.onclick = () => { window.open(pl, '_blank', 'noopener,noreferrer'); };
        } else if (checkout) {
            btnStripe.onclick = () => { void startStripeSubscriptionCheckout(); };
        } else {
            btnStripe.onclick = null;
        }
    }
    if (btnBmc) {
        btnBmc.style.display = bmc ? 'block' : 'none';
        btnBmc.onclick = bmc ? () => { window.open(bmc, '_blank', 'noopener,noreferrer'); } : null;
    }
    if (btnPat) {
        btnPat.style.display = pat ? 'block' : 'none';
        btnPat.onclick = pat ? () => { window.open(pat, '_blank', 'noopener,noreferrer'); } : null;
    }
}

async function startStripeSubscriptionCheckout(sessionOpt) {
    try {
        showStatus('Opening subscription checkout…', 'info');
        const origin = window.location.origin;
        let session = sessionOpt;
        if (session == null && supabaseClient) {
            const { data } = await supabaseClient.auth.getSession();
            session = data?.session || null;
        }
        const body = {
            success_url: `${origin}/?subscribe=success`,
            cancel_url: `${origin}/?subscribe=cancelled`,
        };
        if (session?.user?.email) body.customer_email = session.user.email;
        if (session?.user?.id) body.supabase_user_id = session.user.id;
        const res = await fetch('/api/support/stripe-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || !data.success || !data.url) {
            showStatus(data.error || 'Subscription checkout unavailable', 'error');
            return;
        }
        window.location.href = data.url;
    } catch (e) {
        console.error('[Support] Stripe subscription checkout failed', e);
        showStatus('Could not start subscription checkout', 'error');
    }
}

// =============================================================================
// Supabase Auth (optional) — Option C: map first; soft banner invites sign-in.
// =============================================================================

const _SOFT_AUTH_BANNER_DISMISS_KEY = 'voyagr_soft_auth_banner_dismissed';

/** Soft banner only on public production hosts (not staging, localhost, or raw IPs). */
function voyagrSoftAuthBannerAllowedHost() {
    try {
        const h = String(window.location.hostname || '').toLowerCase();
        return h === 'vibevoyager.org' || h === 'www.vibevoyager.org';
    } catch (e) {
        return false;
    }
}

function voyagrDismissSoftAuthBanner() {
    try {
        sessionStorage.setItem(_SOFT_AUTH_BANNER_DISMISS_KEY, 'true');
    } catch (e) { /* ignore */ }
    syncSoftAuthBannerVisibility(false);
}

function voyagrOpenSignInFromBanner() {
    try {
        if (typeof expandBottomSheet === 'function') {
            expandBottomSheet();
        }
        switchTab('settings');
        setTimeout(() => {
            const el = document.getElementById('accountSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
    } catch (e) {
        console.warn('[Auth] Open sign-in from banner failed:', e);
    }
}

/** Show when Supabase is configured and user is signed out; hide if dismissed this tab session. */
function syncSoftAuthBannerVisibility(wantGuestPrompt) {
    const el = document.getElementById('softAuthBanner');
    if (!el) return;
    if (!wantGuestPrompt) {
        el.style.display = 'none';
        return;
    }
    if (!voyagrSoftAuthBannerAllowedHost()) {
        el.style.display = 'none';
        return;
    }
    try {
        if (sessionStorage.getItem(_SOFT_AUTH_BANNER_DISMISS_KEY) === 'true') {
            el.style.display = 'none';
            return;
        }
    } catch (e) { /* ignore */ }
    el.style.display = 'flex';
}

let supabaseClient = null;
let supabasePublicConfig = null;
let _authGateStripeOffer = null;

const _STRIPE_ONBOARD_SKIP_PREFIX = 'voyagr_skip_stripe_onboard:';

function _stripeOnboardSkipKey(userId) {
    return userId ? `${_STRIPE_ONBOARD_SKIP_PREFIX}${userId}` : null;
}

/** Subscription offer for post-auth gate (trial length from STRIPE_SUBSCRIPTION_TRIAL_DAYS /api/config). */
function getStripeOnboardingOffer(cfg) {
    if (!cfg) return null;
    const pl = (cfg.stripe_payment_link_url || '').trim();
    const checkout = !!(cfg.stripe_subscription_checkout_available || cfg.stripe_checkout_available);
    const trialDays = parseInt(cfg.stripe_subscription_trial_days, 10);
    const hasTrial = Number.isFinite(trialDays) && trialDays > 0;
    if (checkout && !pl) {
        return { kind: 'checkout', trialDays: hasTrial ? trialDays : 0 };
    }
    if (pl) {
        return { kind: 'payment_link', trialDays: hasTrial ? trialDays : 0, url: pl };
    }
    return null;
}

function consumeStripeReturnQueryForUser(userId) {
    try {
        const qs = new URLSearchParams(window.location.search || '');
        const sub = qs.get('subscribe');
        if (sub === 'success' && userId) {
            const k = _stripeOnboardSkipKey(userId);
            if (k) localStorage.setItem(k, '1');
        }
        if (sub === 'success' || sub === 'cancelled') {
            const url = new URL(window.location.href);
            url.searchParams.delete('subscribe');
            url.searchParams.delete('session_id');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
    } catch (e) {
        console.warn('[Stripe gate] URL cleanup:', e);
    }
}

async function showPostAuthStripeGateIfNeeded(session) {
    const uid = session?.user?.id;
    if (!uid || !supabasePublicConfig) {
        syncAuthRequiredGate('off');
        return;
    }
    consumeStripeReturnQueryForUser(uid);
    try {
        if (localStorage.getItem(_stripeOnboardSkipKey(uid)) === '1') {
            syncAuthRequiredGate('off');
            return;
        }
    } catch (e) { /* ignore quota */ }

    const offer = getStripeOnboardingOffer(supabasePublicConfig);
    if (!offer || offer.trialDays <= 0) {
        syncAuthRequiredGate('off');
        return;
    }
    _authGateStripeOffer = offer;
    syncAuthRequiredGate('stripe_trial', offer);
}

async function authGateStripeContinue() {
    const st = document.getElementById('authGateStripeStatus');
    const setSt = (msg, kind) => {
        if (!st) return;
        st.textContent = msg || '';
        st.className = 'auth-required-gate__status';
        if (kind === 'error') st.classList.add('auth-required-gate__status--error');
    };
    const offer = _authGateStripeOffer;
    if (!offer) {
        syncAuthRequiredGate('off');
        return;
    }
    if (!supabaseClient) {
        setSt('Session unavailable. Refresh the page.', 'error');
        return;
    }
    const { data } = await supabaseClient.auth.getSession();
    const sess = data?.session || null;
    if (offer.kind === 'payment_link' && offer.url) {
        setSt('Opening Stripe checkout…', '');
        window.open(offer.url, '_blank', 'noopener,noreferrer');
        setSt(
            'Complete checkout in the new tab. Tap Skip for now below when you are finished (or to use the app without subscribing).',
            ''
        );
        return;
    }
    setSt('Opening subscription checkout…', '');
    try {
        const origin = window.location.origin;
        const res = await fetch('/api/support/stripe-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success_url: `${origin}/?subscribe=success`,
                cancel_url: `${origin}/?subscribe=cancelled`,
                customer_email: sess?.user?.email || undefined,
                supabase_user_id: sess?.user?.id || undefined,
            }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.success || !resData.url) {
            setSt(resData.error || 'Could not start checkout.', 'error');
            return;
        }
        window.location.href = resData.url;
    } catch (e) {
        console.error('[Stripe gate] checkout', e);
        setSt('Could not start checkout.', 'error');
    }
}

async function authGateStripeSkip() {
    try {
        const { data } = await supabaseClient.auth.getSession();
        const uid = data?.session?.user?.id;
        const k = _stripeOnboardSkipKey(uid);
        if (k) localStorage.setItem(k, '1');
    } catch (e) { /* ignore */ }
    _authGateStripeOffer = null;
    syncAuthRequiredGate('off');
}

function setAuthGateFormStatus(message, kind) {
    const statusEl = document.getElementById('authGateStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'auth-required-gate__status';
    if (kind === 'error') statusEl.classList.add('auth-required-gate__status--error');
    else if (kind === 'ok') statusEl.classList.add('auth-required-gate__status--ok');
}

/**
 * When Supabase URL + anon key exist, users must sign in before using the app.
 * Modes: off, loading, signin, stripe_trial (after sign-in if Stripe trial is configured).
 */
function syncAuthRequiredGate(mode, offer) {
    const gate = document.getElementById('authRequiredGate');
    const loadingEl = document.getElementById('authGateLoading');
    const formEl = document.getElementById('authGateForm');
    const stripeEl = document.getElementById('authGateStripeTrial');
    const titleEl = document.getElementById('authGateTitle');
    if (!gate) return;

    if (mode === 'off') {
        _authGateStripeOffer = null;
        gate.style.display = 'none';
        gate.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-gate-active');
        if (stripeEl) stripeEl.style.display = 'none';
        return;
    }

    gate.style.display = 'flex';
    gate.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-gate-active');

    if (stripeEl) stripeEl.style.display = 'none';

    if (mode === 'loading') {
        if (titleEl) titleEl.textContent = 'Sign in to Voyagr';
        if (loadingEl) loadingEl.style.display = 'block';
        if (formEl) formEl.style.display = 'none';
        return;
    }

    if (mode === 'signin') {
        if (titleEl) titleEl.textContent = 'Sign in to Voyagr';
        setAuthGateFormStatus('', '');
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
        return;
    }

    if (mode === 'stripe_trial' && offer && stripeEl) {
        if (titleEl) titleEl.textContent = 'Start your free trial';
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'none';
        const hint = document.getElementById('authGateStripeHint');
        const td = offer.trialDays;
        if (hint) {
            hint.textContent =
                `Continue to Stripe to start your ${td}-day Voyager Premium trial. Billing begins after the trial unless you cancel in the Stripe portal.`;
        }
        const ssl = document.getElementById('authGateStripeStatus');
        if (ssl) {
            ssl.textContent = '';
            ssl.className = 'auth-required-gate__status';
        }
        const primary = document.getElementById('authGateStripePrimaryBtn');
        if (primary) {
            primary.textContent = offer.kind === 'payment_link' ? 'Open Stripe checkout' : 'Continue to Stripe';
        }
        stripeEl.style.display = 'block';
    }
}

async function authSignInEmailGate() {
    if (!supabaseClient) {
        setAuthGateFormStatus('Sign-in is unavailable. Try again later.', 'error');
        return;
    }
    const email = document.getElementById('authGateEmail')?.value?.trim();
    const password = document.getElementById('authGatePassword')?.value || '';
    if (!email || !password) {
        setAuthGateFormStatus('Enter your email and password.', 'error');
        return;
    }
    setAuthGateFormStatus('Signing in…', '');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        setAuthGateFormStatus(error.message || 'Sign-in failed', 'error');
        return;
    }
    setAuthGateFormStatus('', '');
}

async function authSignUpEmailGate() {
    if (!supabaseClient) {
        setAuthGateFormStatus('Sign-up is unavailable. Try again later.', 'error');
        return;
    }
    const email = document.getElementById('authGateEmail')?.value?.trim();
    const password = document.getElementById('authGatePassword')?.value || '';
    if (!email || !password) {
        setAuthGateFormStatus('Enter your email and password.', 'error');
        return;
    }
    setAuthGateFormStatus('Creating account…', '');
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        setAuthGateFormStatus(error.message || 'Sign-up failed', 'error');
        return;
    }
    setAuthGateFormStatus('Account created. Check your email if confirmation is required.', 'ok');
}

function setAccountUIState({ signedIn, email, message }) {
    const statusEl = document.getElementById('accountStatus');
    const signedOutEl = document.getElementById('accountSignedOut');
    const signedInEl = document.getElementById('accountSignedIn');
    const emailEl = document.getElementById('accountEmail');

    if (statusEl) statusEl.textContent = message || '';
    if (signedOutEl) signedOutEl.style.display = signedIn ? 'none' : 'block';
    if (signedInEl) signedInEl.style.display = signedIn ? 'block' : 'none';
    if (emailEl) emailEl.textContent = email || '-';
}

async function initSupabaseAuth() {
    try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        const data = await res.json();
        supabasePublicConfig = data;
        applySupportLinksFromConfig(data);

        const url = data.supabase_url;
        const anonKey = data.supabase_anon_key;

        if (!url || !anonKey || typeof supabase === 'undefined') {
            setAccountUIState({
                signedIn: false,
                message: 'Account login not configured on this server.'
            });
            const accountSection = document.getElementById('accountSection');
            if (accountSection) accountSection.style.display = 'none';
            syncAuthRequiredGate('off');
            syncSoftAuthBannerVisibility(false);
            return;
        }

        // Create client (global UMD: supabase.createClient)
        const { createClient } = supabase;
        supabaseClient = createClient(url, anonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        window.supabaseClient = supabaseClient;

        // Initial session (no full-screen loading gate — map stays usable)
        const { data: sessionData } = await supabaseClient.auth.getSession();
        await handleSupabaseSession(sessionData?.session || null);

        // Session changes (login/logout/refresh)
        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            await handleSupabaseSession(session || null);
        });
    } catch (e) {
        console.error('[Auth] initSupabaseAuth failed:', e);
        setAccountUIState({ signedIn: false, message: 'Account login unavailable (config error).' });
        syncAuthRequiredGate('off');
        syncSoftAuthBannerVisibility(false);
    }
}

async function handleSupabaseSession(session) {
    if (session && session.user) {
        syncSoftAuthBannerVisibility(false);
        const userId = session.user.id;
        const email = session.user.email || '';
        setAccountUIState({ signedIn: true, email, message: 'Signed in.' });

        const userProfileId = `sb:${userId}`;
        ensureProfileExists(userProfileId);

        // If user profile is empty but guest has data, offer import once.
        const store = getProfileStore();
        const guestSnap = store['guest'];
        const userSnap = store[userProfileId];
        const guestHasData = !!(guestSnap?.voyagr_all_settings && guestSnap.voyagr_all_settings.length > 10) ||
                             !!(guestSnap?.savedRoutes && guestSnap.savedRoutes !== '[]');
        const userHasData = !!(userSnap?.voyagr_all_settings && userSnap.voyagr_all_settings.length > 10) ||
                            !!(userSnap?.savedRoutes && userSnap.savedRoutes !== '[]');

        if (guestHasData && !userHasData) {
            const importChoice = confirm('Import your current on-device (guest) profile into this account profile?');
            if (importChoice) {
                switchActiveProfile(userProfileId, { importFromProfileId: 'guest' });
                showStatus('Imported guest profile into account profile', 'success');
                scheduleSupabaseProfileSync();
                await refreshPromoCodeSection(session || null);
                await showPostAuthStripeGateIfNeeded(session);
                return;
            }
        }

        switchActiveProfile(userProfileId);
        // Pull down latest snapshot from Supabase (if any). If remote is newer, it will apply.
        await pullProfileSnapshotFromSupabase(userProfileId);
        // If no remote snapshot exists yet, push current local snapshot.
        scheduleSupabaseProfileSync();
        await refreshPromoCodeSection(session || null);
        await showPostAuthStripeGateIfNeeded(session);
        return;
    }

    // Signed out
    setAccountUIState({ signedIn: false, message: 'Not signed in (guest profile).' });
    switchActiveProfile('guest');
    await refreshPromoCodeSection(session || null);
    syncAuthRequiredGate('off');
    syncSoftAuthBannerVisibility(!!supabaseClient);
}

async function authSignInEmail() {
    if (!supabaseClient) return showStatus('Auth not configured', 'error');
    const email = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value || '';
    if (!email || !password) return showStatus('Enter email + password', 'error');

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showStatus(error.message || 'Sign-in failed', 'error');
    showStatus('Signed in', 'success');
}

async function authSignUpEmail() {
    if (!supabaseClient) return showStatus('Auth not configured', 'error');
    const email = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value || '';
    if (!email || !password) return showStatus('Enter email + password', 'error');

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return showStatus(error.message || 'Sign-up failed', 'error');
    showStatus('Account created. Check your email if confirmation is required.', 'success');
}

async function authSignInProvider(provider) {
    if (!supabaseClient) return showStatus('Auth not configured', 'error');
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin }
    });
    if (error) return showStatus(error.message || 'OAuth sign-in failed', 'error');
}

async function authSignOut() {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) return showStatus(error.message || 'Sign-out failed', 'error');
    showStatus('Signed out', 'info');
}

async function refreshPromoCodeSection(session) {
    const block = document.getElementById('promoCodeBlock');
    const guestNote = document.getElementById('promoCodeGuestNote');
    const formWrap = document.getElementById('promoCodeFormWrap');
    if (!block || !guestNote || !formWrap) return;
    if (!supabaseClient) {
        block.style.display = 'none';
        return;
    }
    block.style.display = 'block';
    if (session?.user) {
        guestNote.style.display = 'none';
        formWrap.style.display = 'block';
        await loadPromoEntitlementStatus();
    } else {
        guestNote.style.display = 'block';
        formWrap.style.display = 'none';
        const summary = document.getElementById('promoEntitlementSummary');
        if (summary) summary.textContent = '';
    }
}

async function loadPromoEntitlementStatus() {
    const summary = document.getElementById('promoEntitlementSummary');
    if (!summary) return;
    const token = await getSupabaseAccessToken();
    if (!token) {
        summary.textContent = '';
        return;
    }
    try {
        const { res, data } = await fetchJsonWithAuth('/api/coupons/status');
        if (res.status === 401 || !res.ok || !data.success) {
            summary.textContent = '';
            return;
        }
        if (data.lifetime) {
            summary.textContent = 'Promo access: lifetime.';
            summary.style.color = '#2e7d32';
        } else if (data.trial_active && data.trial_expires_at) {
            const d = new Date(data.trial_expires_at * 1000);
            summary.textContent = `Promo access: trial until ${d.toLocaleString()}.`;
            summary.style.color = '#1565c0';
        } else {
            summary.textContent = 'Promo access: none applied.';
            summary.style.color = '#666';
        }
    } catch {
        summary.textContent = '';
    }
}

async function redeemPromoCode() {
    const input = document.getElementById('promoCodeInput');
    const statusEl = document.getElementById('promoCodeStatus');
    const code = input?.value?.trim();
    if (!code) {
        if (statusEl) statusEl.textContent = 'Enter a code.';
        return;
    }
    if (statusEl) statusEl.textContent = 'Applying…';
    try {
        const { res, data } = await fetchJsonWithAuth('/api/coupons/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        if (data.success) {
            showStatus(data.message || 'Code applied', 'success');
            if (statusEl) statusEl.textContent = data.message || 'Applied.';
            if (input) input.value = '';
            await loadPromoEntitlementStatus();
        } else {
            if (statusEl) statusEl.textContent = data.error || 'Could not apply code.';
            showStatus(data.error || 'Could not apply code', 'error');
        }
    } catch {
        if (statusEl) statusEl.textContent = 'Network error.';
        showStatus('Could not apply code', 'error');
    }
}

// Expose handlers for inline onclick buttons in HTML
window.authSignInEmail = authSignInEmail;
window.authSignUpEmail = authSignUpEmail;
window.authSignInProvider = authSignInProvider;
window.authSignOut = authSignOut;
window.redeemPromoCode = redeemPromoCode;

// ===== SETTINGS ORCHESTRATION =====
// Orchestration lives in static/js/app/settings-orchestration.js (bound at file end).

function getSettingsOrchestrationRuntime() {
    return {
        settingsSnapshot: () => _settingsSnapshot(),
        routeSelection: () => _routeSelection(),
        toggleUI: () => _toggleUI(),
        routePrefs: () => _routePrefs(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getDistanceUnit: () => distanceUnit,
        setDistanceUnit: (val) => { distanceUnit = val; },
        getCurrencyUnit: () => currencyUnit,
        setCurrencyUnit: (val) => { currencyUnit = val; },
        getSpeedUnit: () => speedUnit,
        setSpeedUnit: (val) => { speedUnit = val; },
        getTemperatureUnit: () => temperatureUnit,
        setTemperatureUnit: (val) => { temperatureUnit = val; },
        getCurrentVehicleType: () => currentVehicleType,
        setCurrentVehicleType: (val) => { currentVehicleType = val; },
        getCurrentRoutingMode: () => currentRoutingMode,
        setCurrentRoutingMode: (val) => { currentRoutingMode = val; },
        getSmartZoomEnabled: () => smartZoomEnabled,
        setSmartZoomEnabled: (val) => { smartZoomEnabled = val; },
        getShowCamerasEnabled: () => VoyagrMapOverlayOrchestration.getShowCamerasEnabled(),
        setShowCamerasEnabled: (val) => { VoyagrMapOverlayOrchestration.setShowCamerasEnabled(val); },
        getShowOsmTrafficLightsEnabled: () => VoyagrMapOverlayOrchestration.getShowOsmTrafficLightsEnabled(),
        setShowOsmTrafficLightsEnabled: (val) => { VoyagrMapOverlayOrchestration.setShowOsmTrafficLightsEnabled(val); },
        getShowOsmRailwayCrossingsEnabled: () => VoyagrMapOverlayOrchestration.getShowOsmRailwayCrossingsEnabled(),
        setShowOsmRailwayCrossingsEnabled: (val) => { VoyagrMapOverlayOrchestration.setShowOsmRailwayCrossingsEnabled(val); },
        getShowTrafficEnabled: () => showTrafficEnabled,
        setShowTrafficEnabled: (val) => { showTrafficEnabled = val; },
        getSpeedWidgetEnabled: () => speedWidgetEnabled,
        setSpeedWidgetEnabled: (val) => { speedWidgetEnabled = val; },
        call: {
            persistActiveProfile,
            loadPreferences,
            setRoutingMode,
            setMapTheme,
            initializeDarkMode,
            updateThemeButtons,
            applySpeedWidgetToggleUi,
            stopRouteTrafficUpdates,
            startRouteTrafficUpdates,
            stopAutoTrafficUpdates,
            startAutoTrafficUpdates,
            ensureLabelsOnTop,
            showStatus,
            collectSettingsFormState,
        },
    };
}

function saveAllSettings() { VoyagrSettingsOrchestration.saveAllSettings(); }
function loadAllSettings() { return VoyagrSettingsOrchestration.loadAllSettings(); }
function applyDomSelectsFromPlan(selects) { VoyagrSettingsOrchestration.applyDomSelectsFromPlan(selects); }
function applyDomChecksFromPlan(checks) { VoyagrSettingsOrchestration.applyDomChecksFromPlan(checks); }
function applyMapLayerReorderFromPlan(plan) { return VoyagrSettingsOrchestration.applyMapLayerReorderFromPlan(plan); }
function applySettingsToUI() { VoyagrSettingsOrchestration.applySettingsToUI(); }
function resetAllSettings() { VoyagrSettingsOrchestration.resetAllSettings(); }
function exportSettings() { VoyagrSettingsOrchestration.exportSettings(); }
function importSettings() { VoyagrSettingsOrchestration.importSettings(); }

// Update all distance displays
/**
 * updateAllDistanceDisplays function
 * @function updateAllDistanceDisplays
 * @returns {*} Return value description
 */
function updateAllDistanceDisplays() {
    const mainEl = document.getElementById('distance');
    const previewEl = document.getElementById('previewDistance');
    const execute = _units().buildUpdateAllDistanceDisplaysExecutePlan({
        distanceUnit,
        mainDistanceKm: mainEl?.dataset.km,
        previewDistanceKm: previewEl?.dataset.km,
    });
    if (!execute.shouldUpdate) return;

    execute.elementPatches.forEach(({ id, text }) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

// Update all cost displays
/**
 * updateAllCostDisplays function
 * @function updateAllCostDisplays
 * @returns {*} Return value description
 */
function updateAllCostDisplays() {
    const fuelCostEl = document.getElementById('fuelCost');
    const tollCostEl = document.getElementById('tollCost');
    const cazCostEl = document.getElementById('cazCost');
    const execute = _units().buildUpdateAllCostDisplaysExecutePlan({
        currencySymbol: getCurrencySymbol(),
        fuelCost: fuelCostEl?.dataset.value,
        tollCost: tollCostEl?.dataset.value,
        cazCost: cazCostEl?.dataset.value,
    });
    if (!execute.shouldUpdate) return;

    execute.elementPatches.forEach(({ id, text }) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

// Update all speed displays
/**
 * updateAllSpeedDisplays function
 * @function updateAllSpeedDisplays
 * @returns {*} Return value description
 */
function updateAllSpeedDisplays() {
    const execute = _speedLimitWidget().buildUpdateAllSpeedDisplaysExecutePlan({
        apiSpeedLimitMph: currentSpeedLimitMph,
        valhallaSpeedLimitMph: null,
        roadType: lastDetectedRoadType || getCurrentRoadType(undefined, currentGpsSpeedMph),
        region: lastSpeedLimitRegion,
        gpsSpeedMph: currentGpsSpeedMph,
        speedUnit,
    });
    if (execute.shouldUpdateWidget) {
        updateSpeedWidget(execute.gpsSpeedMph, execute.shownLimitMph);
    }
    if (execute.shouldLog) console.log(execute.logMessage);
}

// Update all temperature displays
/**
 * updateAllTemperatureDisplays function
 * @function updateAllTemperatureDisplays
 * @returns {*} Return value description
 */
function updateAllTemperatureDisplays() {
    const execute = _units().buildUpdateAllTemperatureDisplaysExecutePlan(temperatureUnit);
    if (execute.shouldLog) console.log(execute.logMessage);
}

// ===== TRIP HISTORY ORCHESTRATION =====
// Orchestration lives in static/js/app/trip-history-orchestration.js (bound at file end).

function getTripHistoryOrchestrationRuntime() {
    return {
        tripHistory: () => _tripHistory(),
        html: () => _html(),
        getRoutePolyline: () => routePolyline,
        getCurrentRoutingMode: () => currentRoutingMode,
        getSpeedUnit: () => speedUnit,
        call: {
            getSupabaseAccessToken,
            fetchJsonWithAuth,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            escapeHtml,
            getSpeedUnitLabel: getSpeedUnit,
            showStatus,
            switchTab,
            calculateRoute,
        },
    };
}

function loadTripHistory() {
    return VoyagrTripHistoryOrchestration.loadTripHistory();
}

async function persistCompletedTrip(route) {
    return VoyagrTripHistoryOrchestration.persistCompletedTrip(route);
}

function displayTripHistory(trips) {
    return VoyagrTripHistoryOrchestration.displayTripHistory(trips);
}

async function recalculateTrip(tripId) {
    return VoyagrTripHistoryOrchestration.recalculateTrip(tripId);
}

async function deleteTripHistory(tripId) {
    return VoyagrTripHistoryOrchestration.deleteTripHistory(tripId);
}

async function getSupabaseAccessToken() {
    try {
        if (!supabaseClient) return null;
        const { data } = await supabaseClient.auth.getSession();
        return data?.session?.access_token || null;
    } catch {
        return null;
    }
}

async function fetchJsonWithAuth(url, options = {}) {
    const token = await getSupabaseAccessToken();
    if (!token) {
        // Guest / signed-out: skip network (avoids noisy 401s for account-only APIs).
        return {
            res: { status: 401, ok: false, headers: { get: () => '' } },
            data: { success: false, error: 'Unauthorized' },
        };
    }
    const headers = { ...(options.headers || {}) };
    headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    return { res, data };
}

// ===== ROUTE COMPARISON FUNCTIONS =====
let routeOptions = [];
let selectedRouteIndex = 0;

// Route colors for multi-route display (via route-selection accessor)
function routeColors() {
    return _routeSelection().ROUTE_COLORS;
}
/** Active navigation / reroute line — matches primary route color. */
function navActiveRouteColor() {
    return _routeSelection().NAV_ACTIVE_ROUTE_COLOR;
}

function applyBringRoutesToTopFromPlan(plan) {
    return VoyagrRouteComparisonOrchestration.applyBringRoutesToTopFromPlan(plan);
}
function clearAllRouteLayersFromMap() { VoyagrRouteComparisonOrchestration.clearAllRouteLayersFromMap(); }
function clearRouteLayerHandlesFromPlan(plan) { VoyagrRouteComparisonOrchestration.clearRouteLayerHandlesFromPlan(plan); }
function applyMapLibreLineLayerFromMountPlan(mountPlan, opts) {
    return VoyagrRouteComparisonOrchestration.applyMapLibreLineLayerFromMountPlan(mountPlan, opts);
}
function applyDisplayAllRoutesStyleLoadScheduleFromPlan(schedule, fn) {
    VoyagrRouteComparisonOrchestration.applyDisplayAllRoutesStyleLoadScheduleFromPlan(schedule, fn);
}
function applyDoAddRouteLayersPostMountFromPlan(plan) { VoyagrRouteComparisonOrchestration.applyDoAddRouteLayersPostMountFromPlan(plan); }
function applySingleRouteMapDisplayFromPlan(plan) { VoyagrRouteComparisonOrchestration.applySingleRouteMapDisplayFromPlan(plan); }
function displayAllRoutesOnMap() { VoyagrRouteComparisonOrchestration.displayAllRoutesOnMap(); }
function applyDisplayAllRoutesOnMapFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDisplayAllRoutesOnMapFromPlan(apply); }
function applyDisplayAllRoutesPreMountFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDisplayAllRoutesPreMountFromPlan(apply); }
function applyRouteLayerFromMapLibrePlan(applyPlan) { return VoyagrRouteComparisonOrchestration.applyRouteLayerFromMapLibrePlan(applyPlan); }
function applyDoAddRouteLayersBatchFromPlan(executePlan) { VoyagrRouteComparisonOrchestration.applyDoAddRouteLayersBatchFromPlan(executePlan); }
function applyDoAddRouteLayersFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDoAddRouteLayersFromPlan(apply); }
function doAddRouteLayers() { VoyagrRouteComparisonOrchestration.doAddRouteLayers(); }
function bringRoutesToTop() { VoyagrRouteComparisonOrchestration.bringRoutesToTop(); }
function applyRouteComparisonListDomFromPlan(domPlan) { VoyagrRouteComparisonOrchestration.applyRouteComparisonListDomFromPlan(domPlan); }
function applyDisplayRouteComparisonFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDisplayRouteComparisonFromPlan(apply); }
function displayRouteComparison() { VoyagrRouteComparisonOrchestration.displayRouteComparison(); }
function selectRoute(index) { VoyagrRouteComparisonOrchestration.selectRoute(index); }
function applyTripInfoDomFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyTripInfoDomFromPlan(apply); }
function updateTripInfoFromRouteOption(route) { VoyagrRouteComparisonOrchestration.updateTripInfoFromRouteOption(route); }
function displaySingleRoute(index) { VoyagrRouteComparisonOrchestration.displaySingleRoute(index); }
function showAllRoutes() { VoyagrRouteComparisonOrchestration.showAllRoutes(); }
function useRoute(index) { VoyagrRouteComparisonOrchestration.useRoute(index); }
function syncLastCalculatedRouteFromSelection(index) {
    VoyagrRouteComparisonOrchestration.syncLastCalculatedRouteFromSelection(index);
}

function getRouteComparisonOrchestrationRuntime() {
    return {
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRouteOptions: () => routeOptions,
        setRouteOptions: (val) => { routeOptions = val; },
        getSelectedRouteIndex: () => selectedRouteIndex,
        setSelectedRouteIndex: (val) => { selectedRouteIndex = val; },
        getRouteLayer: () => routeLayer,
        setRouteLayer: (val) => { routeLayer = val; },
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getShowTrafficEnabled: () => showTrafficEnabled,
        getTrafficLayer: () => trafficLayer,
        call: {
            decodePolyline,
            displayAllRouteHazards,
            addTrafficLayer,
            displayHazardMarkers,
            clearHazardMarkers,
            fetchAndDisplayRouteTraffic,
            showRoutePreview,
            showStatus,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            routeColors,
            ensureLabelsOnTop,
            getTrafficSettingsSnapshot: () => VoyagrTrafficOrchestration.getTrafficSettingsSnapshot(),
        },
    };
}

// ===== WAYPOINTS ORCHESTRATION =====
// Orchestration lives in static/js/app/waypoints-orchestration.js (bound at file end).

function getWaypointsOrchestrationRuntime() {
    return {
        waypoints: () => _waypoints(),
        domHelpers: () => _domHelpers(),
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRoutePolyline: () => routePolyline,
        call: {
            showStatus,
            geocodeAddress,
            getAutocompleteDropdown,
            decodePolyline,
            calculateRoute,
            applyMapLibreLineLayerFromMountPlan,
            convertDistance,
            getDistanceUnit,
        },
    };
}

function toggleRouteEditing() { VoyagrWaypointsOrchestration.toggleRouteEditing(); }
function toggleAddViaPoint() { VoyagrWaypointsOrchestration.toggleAddViaPoint(); }
function toggleAddStop() { VoyagrWaypointsOrchestration.toggleAddStop(); }
function handleMapClickForWaypoints(e) { VoyagrWaypointsOrchestration.handleMapClickForWaypoints(e); }
async function addViaPointFromAddress() { return VoyagrWaypointsOrchestration.addViaPointFromAddress(); }
async function addStopFromAddress() { return VoyagrWaypointsOrchestration.addStopFromAddress(); }
function addViaPoint(lat, lon, name) { return VoyagrWaypointsOrchestration.addViaPoint(lat, lon, name); }
function addStop(lat, lon, name, duration) { return VoyagrWaypointsOrchestration.addStop(lat, lon, name, duration); }
function removeViaPoint(index) { VoyagrWaypointsOrchestration.removeViaPoint(index); }
function removeStop(index) { VoyagrWaypointsOrchestration.removeStop(index); }
function clearAllWaypoints() { VoyagrWaypointsOrchestration.clearAllWaypoints(); }
function onWaypointDragStart(e) { VoyagrWaypointsOrchestration.onWaypointDragStart(e); }
function onWaypointDragOver(e) { VoyagrWaypointsOrchestration.onWaypointDragOver(e); }
function onWaypointDrop(e) { VoyagrWaypointsOrchestration.onWaypointDrop(e); }
function moveWaypoint(type, index, direction) { VoyagrWaypointsOrchestration.moveWaypoint(type, index, direction); }
function displayMultiDropLegs(data) { VoyagrWaypointsOrchestration.displayMultiDropLegs(data); }
function clearMultiDropLayers() { VoyagrWaypointsOrchestration.clearMultiDropLayers(); }
function getOrderedWaypoints(startLat, startLon, endLat, endLon) {
    return VoyagrWaypointsOrchestration.getOrderedWaypoints(startLat, startLon, endLat, endLon);
}

// ===== ROUTE SHARING ORCHESTRATION =====
// Orchestration lives in static/js/app/route-sharing-orchestration.js (bound at file end).

function getRouteSharingOrchestrationRuntime() {
    return {
        routeSharing: () => _routeSharing(),
        call: {
            showStatus,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            updateTripInfoFromRouteOption,
            showRoutePreview,
        },
    };
}

function loadSharedRouteFromUrl() { return VoyagrRouteSharingOrchestration.loadSharedRouteFromUrl(); }
function prepareRouteSharing() { VoyagrRouteSharingOrchestration.prepareRouteSharing(); }
function generateShareLink() { VoyagrRouteSharingOrchestration.generateShareLink(); }
function generateQRCode() { VoyagrRouteSharingOrchestration.generateQRCode(); }
function copyShareLink() { VoyagrRouteSharingOrchestration.copyShareLink(); }
function downloadQRCode() { VoyagrRouteSharingOrchestration.downloadQRCode(); }
function shareViaWhatsApp() { VoyagrRouteSharingOrchestration.shareViaWhatsApp(); }
function shareViaEmail() { VoyagrRouteSharingOrchestration.shareViaEmail(); }
// ===== ROUTE ANALYTICS ORCHESTRATION =====
// Lives in static/js/app/trip-history-orchestration.js (bound at file end).

function loadRouteAnalytics() { VoyagrTripHistoryOrchestration.loadRouteAnalytics(); }
function displayAnalytics(data) { VoyagrTripHistoryOrchestration.displayAnalytics(data); }
// ===== ROUTE PREFERENCES ORCHESTRATION =====
// Orchestration lives in static/js/app/route-preferences-orchestration.js (bound at file end).

function getRoutePreferencesOrchestrationRuntime() {
    return {
        routePrefs: () => _routePrefs(),
        settingsSnapshot: () => _settingsSnapshot(),
        routeSelection: () => _routeSelection(),
        call: {
            showStatus,
            saveAllSettings,
            applyDomChecksFromPlan,
            applyDomSelectsFromPlan,
            ensureDefaultTrafficAwareRouting,
            calculateRoute,
            switchTab,
            isAvoidTollsEnabled,
        },
    };
}

function saveRoutePreferences() { VoyagrRoutePreferencesOrchestration.saveRoutePreferences(); }
function loadRoutePreferences() { VoyagrRoutePreferencesOrchestration.loadRoutePreferences(); }
function getRoutePreferences() { return VoyagrRoutePreferencesOrchestration.getRoutePreferences(); }
function collectRoutePreferencesFormState() {
    return VoyagrRoutePreferencesOrchestration.collectRoutePreferencesFormState();
}
function collectRoutePreferencesDomInput() {
    return VoyagrRoutePreferencesOrchestration.collectRoutePreferencesDomInput();
}
function updateDetourLabel() { VoyagrRoutePreferencesOrchestration.updateDetourLabel(); }
function recalculateRouteWithPreferences() {
    VoyagrRoutePreferencesOrchestration.recalculateRouteWithPreferences();
}
function saveMultiDropPreferences() { VoyagrRoutePreferencesOrchestration.saveMultiDropPreferences(); }
function loadMultiDropPreferences() { VoyagrRoutePreferencesOrchestration.loadMultiDropPreferences(); }
function clearDepartureTime() { VoyagrRoutePreferencesOrchestration.clearDepartureTime(); }
function collectMultiDropFormState() { VoyagrRoutePreferencesOrchestration.collectMultiDropFormState(); }
// ===== ROUTE SAVING ORCHESTRATION =====
// Orchestration lives in static/js/app/route-saving-orchestration.js (bound at file end).

function getRouteSavingOrchestrationRuntime() {
    return {
        routeSharing: () => _routeSharing(),
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        call: {
            showStatus,
            switchTab,
            persistActiveProfile,
            convertDistance,
            getCurrencySymbol,
            getDistanceUnit,
        },
    };
}

function saveCurrentRoute() { VoyagrRouteSavingOrchestration.saveCurrentRoute(); }
function loadSavedRoutes() { VoyagrRouteSavingOrchestration.loadSavedRoutes(); }
function useSavedRoute(routeId) { VoyagrRouteSavingOrchestration.useSavedRoute(routeId); }
function deleteSavedRoute(routeId) { VoyagrRouteSavingOrchestration.deleteSavedRoute(routeId); }

/**
 * setupMapClickHandler function
 * @function setupMapClickHandler
 * @returns {void}
 */
function applyMapClickLocationPickerFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    const inputEl = document.getElementById(apply.inputId);
    if (inputEl) inputEl.value = apply.inputValue;

    if (apply.removeExistingMarker) {
        if (apply.markerTarget === 'start' && startMarker && typeof startMarker.remove === 'function') {
            startMarker.remove();
        }
        if (apply.markerTarget === 'end' && endMarker && typeof endMarker.remove === 'function') {
            endMarker.remove();
        }
    }

    const marker = MapLibreHelpers.createCircleMarker(apply.lat, apply.lon, apply.markerOptions).addTo(map);
    if (apply.markerTarget === 'start') {
        startMarker = marker;
    } else {
        endMarker = marker;
    }

    if (apply.clearMapPickerMode) mapPickerMode = null;
    if (apply.collapseBottomSheet) collapseBottomSheet();
    showStatus(apply.successStatusMessage, apply.successStatusType);
}

function setupMapClickHandler() {
    if (!map) {
        console.log('[Map] Map not initialized yet, deferring click handler setup');
        return;
    }

    const GL = _geocodingLocations();
    map.on('click', (e) => {
        const dispatch = GL.buildMapClickDispatchPlan({
            addingViaPoint: VoyagrWaypointsOrchestration.getAddingViaPoint(),
            addingStop: VoyagrWaypointsOrchestration.getAddingStop(),
            mapPickerMode,
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
        });

        if (dispatch.action === 'waypoint') {
            handleMapClickForWaypoints(e);
            return;
        }

        if (dispatch.action === 'location_picker') {
            applyMapClickLocationPickerFromPlan(
                GL.buildMapClickLocationPickerApplyPlan(dispatch)
            );
        }
    });
}

// Decode polyline (supports both precision 5 and precision 6)
/**
 * decodePolyline function
 * @function decodePolyline
 * @param {*} encoded - Encoded polyline string
 * @param {*} precision - Precision level (5 for OSRM/GraphHopper, 6 for Valhalla). Default: 6
 * @returns {*} Array of [lat, lon] coordinates
 */
// decodePolyline / encodePolyline moved to modules/navigation/polyline-codec.js
// (VoyagrPolylineCodec global). Thin stubs below keep all existing callers working.

/**
 * Decode an encoded polyline string to [lat,lon] pairs.
 * Delegates to VoyagrPolylineCodec (pure, unit-tested). Precision 6 = Valhalla, 5 = OSRM/GH.
 * @param {string} encoded
 * @param {number} [precision=6]
 * @returns {Array<[number, number]>}
 */
function decodePolyline(encoded, precision = 6) {
    if (!encoded || typeof encoded !== 'string') {
        console.warn('[decodePolyline] Invalid input:', encoded);
        return [];
    }
    return _polylineCodec().decodePolyline(encoded, precision);
}

/**
 * Recover `routeData` from persisted OfflineNav blob for a normal navigation bootstrap.
 *
 * @param {*} saved
 */
function buildRoutePayloadFromPersisted(saved) {
    return _routeSelection().buildRoutePayloadFromPersisted(
        saved,
        (points, precision) => _polylineCodec().encodePolyline(points, precision)
    );
}


/**
 * showStatus function
 * @function showStatus
 * @param {*} message - Parameter description
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
}

/**
 * Collect settings form control values from the DOM for snapshot persistence.
 * @returns {Object}
 */
function collectSettingsFormState() {
    const SS = _settingsSnapshot();
    return SS.buildSettingsFormStateInputPlan(
        SS.buildCollectSettingsFormStateInputPlan({
            routePreferences: collectRoutePreferencesFormState(),
            hazardPreferences: SS.buildSettingsHazardPreferencesPlan({
                avoidTolls: isAvoidTollsEnabled(),
                getStorageItem: (key) => localStorage.getItem(key),
            }),
            parkingPreferences: collectParkingPreferencesFormState(),
            multiDropPreferences: collectMultiDropFormState(),
            mapTheme: localStorage.getItem('mapTheme') || 'standard',
        })
    );
}

/**
 * Apply in-navigation reroute outcome from a successful /api/route response.
 * @param {Object} data
 * @param {string} geocodedEnd
 * @param {string} end
 */
function applyCalculateRouteInNavRerouteFromPlan(plan) {
    if (!plan || !plan.shouldApply) {
        if (plan && plan.noRouteErrorMessage) {
            showStatus(plan.noRouteErrorMessage, 'error');
        }
        return;
    }

    if (plan.hideRouteProgressBar) hideRouteProgressBar();
    if (plan.updateRouteOnMap) updateRouteOnMap(plan.activeRoute);

    window.lastCalculatedRoute = {
        ...window.lastCalculatedRoute,
        ...plan.lastCalculatedRoutePatch,
    };

    if (plan.speakMessage) {
        speakMessage(plan.speakMessage, 'high');
    }

    showStatus(plan.statusMessage, plan.statusType);
    if (plan.recentDestination) {
        try {
            recordRecentDestination(
                plan.recentDestination.label,
                plan.recentDestination.lat,
                plan.recentDestination.lon,
                plan.recentDestination.kind
            );
        } catch (_) { /* ignore */ }
    }
}

function applyCalculateRouteInNavRerouteOutcome(data, geocodedEnd, end) {
    const RS = _routeSelection();
    const orch = RS.buildCalculateRouteInNavRerouteOrchestrationPlan({
        activeRoute: pickActiveRouteDuringNavigation(data.routes, data),
        data,
        geocodedEnd,
        destinationLabel: end,
        voiceOpts: voiceAnnouncementsEnabled
            ? { enabled: true, convertDistance, distUnit: getDistanceUnit() }
            : { enabled: false },
    });
    applyCalculateRouteInNavRerouteFromPlan(orch.execute);
}

/**
 * Post-preview UI side-effects for idle calculateRoute success.
 * @param {Object} idleUiPlan - from buildCalculateRouteIdleUiApplyPlan
 * @param {Object} data - route API response
 */
function applyCalculateRouteIdleUiFromPlan(idleUiPlan, data) {
    const plan = _routeSelection().buildCalculateRouteIdleUiOrchestrationPlan(idleUiPlan).execute;
    if (!plan.shouldExecute) return;

    const delayMs = plan.delayedPreview?.delayMs ?? 300;
    setTimeout(() => {
        showRoutePreview(data);
        if (plan.updateArButtonVisibility) {
            updateARButtonVisibility();
        }
    }, delayMs);

    if (plan.hideRouteProgressBar) hideRouteProgressBar();

    if (plan.showStartNavButtons) {
        (plan.startNavButtonIds || []).forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) btn.style.display = 'block';
        });
    }
    if (plan.updateRoadReportFabVisibility) {
        updateRoadReportFabVisibility();
    }

    const notification = plan.notification;
    if (notification) {
        console.log(plan.notificationLogPrefix, notification.message);
        sendNotification(notification.title, notification.message, notification.type);
    }

    try {
        (plan.recentDestinations || []).forEach((dest) => {
            recordRecentDestination(dest.label, dest.lat, dest.lon, dest.kind);
        });
    } catch (_) { /* ignore */ }
}

/**
 * Apply route preview map markers and bounds from a pure map apply plan.
 * @param {Object} plan - from buildRoutePreviewMapApplyPlan
 * @returns {boolean} false when map is not initialised
 */
function applyRoutePreviewMapFromPlan(plan) {
    const executePlan = _previewMarker().buildRoutePreviewMapExecutePlan(plan);
    if (!executePlan.shouldExecute) return false;

    if (executePlan.removeExistingMarkers) {
        if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
        if (endMarker && typeof endMarker.remove === 'function') endMarker.remove();
        if (routeLayer && typeof routeLayer.remove === 'function') routeLayer.remove();
    }

    const createEndpointMarker = (markerPlan) => {
        const opts = markerPlan.options;
        const marker = MapLibreHelpers.createCircleMarker(markerPlan.lat, markerPlan.lon, {
            radius: opts.radius,
            fillColor: opts.fillColor,
            color: opts.color,
            weight: opts.weight,
            fillOpacity: opts.fillOpacity,
        }).addTo(map);
        marker.bindPopup(opts.popup);
        return marker;
    };

    if (executePlan.startMarker) {
        startMarker = createEndpointMarker(executePlan.startMarker);
    }
    if (executePlan.endMarker) {
        endMarker = createEndpointMarker(executePlan.endMarker);
    }

    if (executePlan.pathLog) {
        if (executePlan.pathLog.level === 'error') {
            console.error(executePlan.pathLog.message);
        } else {
            console.log(executePlan.pathLog.message);
        }
    }

    if (executePlan.requiresMap && !map) {
        console.error(executePlan.mapMissingLogMessage);
        showStatus(executePlan.mapMissingStatusMessage, 'error');
        return false;
    }

    if (executePlan.fitBounds && map) {
        MapLibreHelpers.fitMapBounds(map, executePlan.fitBounds.routePath, { padding: executePlan.fitBounds.padding });
        lastZoomLevel = map.getZoom();
    }

    return true;
}

/**
 * Apply idle (non-navigation) calculateRoute preview outcome.
 * @param {Object} data
 * @param {{ geocodedStart: string, geocodedEnd: string, start: string, end: string }} labels
 */
function applyCalculateRouteIdlePreviewErrorFromPlan(postMap) {
    if (!postMap || postMap.shouldApply) return false;
    showStatus(postMap.errorStatusMessage, 'error');
    if (postMap.hideRouteProgressBarOnError) hideRouteProgressBar();
    return true;
}

function applyCalculateRouteIdlePreviewRouteOptionsFromPlan(routeOpts, data) {
    if (!routeOpts || !routeOpts.shouldBuild) return;

    const RS = _routeSelection();
    if (routeOpts.multiRouteLogMessage) {
        console.log(routeOpts.multiRouteLogMessage);
        routeOptions = RS.buildRouteOptionsFromApiResponse(data, decodePolyline, routeOpts.routePath);
        console.log(
            routeOpts.loadedRoutesLogPrefix + routeOptions.length + ' real routes from ' + data.source + ':',
            routeOptions.map((r) => r.name)
        );
        return;
    }

    routeOptions = RS.buildRouteOptionsFromApiResponse(data, decodePolyline, routeOpts.routePath);
    if (routeOpts.fallbackRouteLogMessage) console.log(routeOpts.fallbackRouteLogMessage);
}

function applyCalculateRouteIdlePreviewPostMapFromPlan(postMap, data, idleUiApplyPlan) {
    if (!postMap || !postMap.shouldApply) return;

    if (postMap.multiDropStopLogMessage) console.log(postMap.multiDropStopLogMessage);
    updateTripInfo(
        postMap.tripInfo.distance,
        postMap.tripInfo.displayTime,
        postMap.tripInfo.fuelCost,
        postMap.tripInfo.tollCost
    );
    showStatus(postMap.statusMessage, 'success');

    if (postMap.showMultiDropLegs) displayMultiDropLegs(data);
    if (postMap.storeLastRouteApiResponse) window.lastRouteApiResponse = data;
    window.lastCalculatedRoute = postMap.lastCalculatedRoutePatch;
    if (postMap.durationLogMessage) console.log(postMap.durationLogMessage);
    if (postMap.displayPrimaryHazards) displayHazardMarkers(postMap.primaryHazards);

    applyCalculateRouteIdlePreviewRouteOptionsFromPlan(postMap.routeOptionsApply, data);
    applyCalculateRouteIdleUiFromPlan(idleUiApplyPlan, data);
}

function applyCalculateRouteIdlePreviewFromPlan(orch, data) {
    const postMap = orch.postMapApply
        || _routeSelection().buildCalculateRouteIdlePreviewPostMapApplyPlan(orch.execute);
    if (applyCalculateRouteIdlePreviewErrorFromPlan(postMap)) return;

    const mapApplied = applyRoutePreviewMapFromPlan(
        _previewMarker().buildRoutePreviewMapApplyPlan(orch.mapApplyInput)
    );
    if (!mapApplied) return;

    applyCalculateRouteIdlePreviewPostMapFromPlan(postMap, data, orch.idleUiApplyPlan);
}

function applyCalculateRouteIdlePreviewOutcome(data, labels) {
    try {
        const GL = _geocodingLocations();
        const orch = _routeSelection().buildCalculateRouteIdlePreviewOrchestrationPlan({
            input: {
                geocodedStart: labels.geocodedStart,
                geocodedEnd: labels.geocodedEnd,
                startLabel: labels.start,
                endLabel: labels.end,
                data,
                parseLatLonPair: GL.parseLatLonPairString.bind(GL),
                invalidFormatMessage: GL.getInvalidCoordinatesFormatStatusMessage(),
                invalidCoordsMessage: GL.getInvalidCoordinatesStatusMessage(),
                decodePolyline,
                convertDistance,
                distUnit: getDistanceUnit(),
                currencySymbol: getCurrencySymbol(),
                parseDurationMinutes: _routeSharing().parseSharedRouteDurationMinutes,
            },
            data,
        });
        applyCalculateRouteIdlePreviewFromPlan(orch, data);
    } catch (e) {
        const errApply = _routeSelection().buildCalculateRouteIdlePreviewParseErrorApplyPlan(e);
        showStatus(errApply.statusMessage, errApply.statusType);
        console.error(errApply.logPrefix, e);
        if (errApply.hideRouteProgressBar) hideRouteProgressBar();
    }
}

function applyCalculateRouteResponseFromPlan(apply, data, labels) {
    if (!apply || !apply.shouldApply) return;

    console.log(apply.responseLogPrefix, apply.responseLogMeta);

    if (apply.degradedLogWarning) {
        console.warn(
            apply.degradedLogPrefix,
            apply.degradedLogWarning.warning,
            apply.degradedLogWarning.engines
        );
    }
    if (apply.degradedStatusMessage) {
        showStatus(apply.degradedStatusMessage, 'warning');
    }

    if (apply.branch === 'error') {
        showStatus(apply.statusMessage, apply.statusType);
        if (apply.hideRouteProgressBar) hideRouteProgressBar();
        return;
    }

    if (apply.branch === 'in_nav_reroute') {
        if (apply.inNavRerouteLogMessage) console.log(apply.inNavRerouteLogMessage);
        applyCalculateRouteInNavRerouteOutcome(data, labels.geocodedEnd, labels.end);
        return;
    }

    applyCalculateRouteIdlePreviewOutcome(data, labels);
}

function applyCalculateRoutePreflightFromPlan(preflightApply) {
    if (!preflightApply) return false;

    console.log(preflightApply.entryLogMessage);
    (preflightApply.debugLogs || []).forEach(({ prefix, value }) => {
        console.log(prefix, value);
    });

    if (!preflightApply.shouldProceed) {
        showStatus(preflightApply.statusMessage, preflightApply.statusType);
        if (preflightApply.missingInputsLogMessage) {
            console.error(preflightApply.missingInputsLogMessage);
        } else if (preflightApply.geocodingBusyLogMessage) {
            console.warn(preflightApply.geocodingBusyLogMessage);
        }
        return false;
    }

    console.log(preflightApply.geocodeCallLogMessage);
    return true;
}

function applyCalculateRouteLoadingFromPlan(loadingApply) {
    if (!loadingApply || !loadingApply.shouldApply) return;
    showStatus(loadingApply.statusMessage, loadingApply.statusType);
    if (loadingApply.showRouteProgressBar) showRouteProgressBar();
}

async function applyCalculateRouteFetchHttpResponse(response, fetchPlan) {
    const RR = _routingRequest();
    const plan = RR.buildCalculateRouteFetchHttpResponsePlan({
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
    }, fetchPlan);

    console.log(plan.statusLogPrefix, response.status);

    if (plan.action === 'reject_non_json') {
        const text = await response.text();
        console.error(plan.nonJsonErrorLogPrefix, plan.contentType);
        console.error(plan.responseTextLogPrefix, text.substring(0, 200));
        throw new Error(RR.buildNonJsonRouteApiErrorMessage(plan.status, text));
    }

    if (plan.action === 'reject_http_error') {
        const text = await response.text();
        throw new Error(RR.parseRouteApiErrorMessage(plan.status, text));
    }

    return response.json();
}

function collectCalculateRouteApiInput(geocodedStart, geocodedEnd) {
    return _routingRequest().buildCalculateRouteApiInputCollectPlan({
        storage: localStorage,
        geocodedStart,
        geocodedEnd,
        viaPoints: VoyagrWaypointsOrchestration.getViaPoints(),
        stops: VoyagrWaypointsOrchestration.getStops(),
        routingMode: currentRoutingMode,
        vehicleType: currentVehicleType,
        costParams: getRouteCostParams(currentVehicleType),
        avoidTolls: isAvoidTollsEnabled(),
        routePrefs: getRoutePreferences(),
        routeInProgress,
        isTrackingActive,
        trackingHistory,
        currentLat,
        currentLon,
    });
}

function applyCalculateRouteFetchErrorFromPlan(errApply, error) {
    if (!errApply) return;
    showStatus(errApply.statusMessage, errApply.statusType);
    console.error(errApply.logPrefix, error);
    if (errApply.hideRouteProgressBar) hideRouteProgressBar();
}

async function calculateRoute() {
    const RR = _routingRequest();
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const preflightOrch = RR.buildCalculateRoutePreflightOrchestrationPlan(
        RR.buildCalculateRouteInputCollectPlan({ startInput, endInput }),
        isGeocoding
    );

    if (!applyCalculateRoutePreflightFromPlan(preflightOrch.apply)) return;

    const { start, end } = preflightOrch.collect;

    let geocodedResult = await geocodeLocations(start, end);
    if (!geocodedResult) {
        console.error('[calculateRoute] ERROR: geocodeLocations returned null');
        return;
    }

    const geocodedStart = geocodedResult.start;
    const geocodedEnd = geocodedResult.end;

    console.log('[calculateRoute] Geocoded start:', geocodedStart);
    console.log('[calculateRoute] Geocoded end:', geocodedEnd);

    applyCalculateRouteLoadingFromPlan(
        RR.buildCalculateRouteLoadingApplyPlan(RR.buildCalculateRouteLoadingExecutePlan())
    );

    const apiOrch = RR.buildCalculateRouteApiOrchestrationPlan(
        collectCalculateRouteApiInput(geocodedStart, geocodedEnd)
    );
    const { routePlan, fetchPlan, requestLog } = apiOrch;

    console.log(requestLog.requestLogPrefix, fetchPlan.body);
    console.log(requestLog.viaPointsLogMessage);
    console.log(requestLog.multiDropLogMessage);

    fetch(fetchPlan.apiPath, {
        method: fetchPlan.method,
        headers: fetchPlan.headers,
        body: JSON.stringify(fetchPlan.body),
    })
        .then((response) => applyCalculateRouteFetchHttpResponse(response, fetchPlan))
        .then(data => {
            applyCalculateRouteResponseFromPlan(
                RR.buildCalculateRouteResponseApplyPlan(
                    RR.buildCalculateRouteResponseExecutePlan(data, routeInProgress)
                ),
                data,
                { geocodedStart, geocodedEnd, start, end }
            );
        })
        .catch(error => {
            applyCalculateRouteFetchErrorFromPlan(
                RR.buildCalculateRouteFetchErrorApplyPlan(error),
                error
            );
        });
}

/**
 * Show route calculation progress bar
 */
function applyRouteProgressShowFromPlan(apply) {
    if (!apply || !apply.shouldShow) return;

    let progressContainer = document.getElementById(apply.containerId);

    if (!progressContainer && apply.mountIfMissing) {
        progressContainer = document.createElement('div');
        progressContainer.id = apply.containerId;
        progressContainer.style.cssText = apply.containerStyleCssText;
        progressContainer.innerHTML = apply.innerHtml;

        if (apply.animationStyleId && apply.animationKeyframes &&
            !document.getElementById(apply.animationStyleId)) {
            const style = document.createElement('style');
            style.id = apply.animationStyleId;
            style.textContent = apply.animationKeyframes;
            document.head.appendChild(style);
        }

        document.body.appendChild(progressContainer);
    }

    if (progressContainer) progressContainer.style.display = 'block';
    if (apply.showLogMessage) console.log(apply.showLogMessage);
}

function showRouteProgressBar() {
    applyRouteProgressShowFromPlan(
        _routeProgress().buildRouteProgressShowOrchestrationPlan().apply
    );
}

/**
 * Hide route calculation progress bar
 */
function applyRouteProgressHideFromPlan(apply) {
    if (!apply || !apply.shouldHide) return;

    const progressContainer = document.getElementById(apply.containerId);
    if (progressContainer) progressContainer.style.display = 'none';
    if (apply.hideLogMessage) console.log(apply.hideLogMessage);
}

function hideRouteProgressBar() {
    applyRouteProgressHideFromPlan(
        _routeProgress().buildRouteProgressHideOrchestrationPlan().apply
    );
}

function applyCollapseBottomSheetForRoutePreviewFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    const bottomSheet = document.getElementById(apply.bottomSheetId);
    if (!bottomSheet) return;

    (apply.clearInlineStyles || []).forEach((prop) => {
        bottomSheet.style[prop] = '';
    });
    if (apply.collapse) collapseBottomSheet();

    const handle = bottomSheet.querySelector(apply.handleSelector);
    if (handle && apply.handleTitle) handle.title = apply.handleTitle;
    if (apply.logMessage) console.log(apply.logMessage);
}

/**
 * Collapse bottom sheet to show map with route preview
 * Uses the standard collapse mechanism instead of inline styles
 */
function collapseBottomSheetForRoutePreview() {
    applyCollapseBottomSheetForRoutePreviewFromPlan(
        _domHelpers().buildCollapseBottomSheetForRoutePreviewOrchestrationPlan().apply
    );
}

function collectDisplayHazardMarkersInput(hazards) {
    const OSM = _osmMapIcons();
    const pillHtml = getOsmTrafficLightMarkerPillHTML();
    return {
        hazards,
        markerOpts: {
            osmTrafficLightPillHtml: pillHtml,
            osmTrafficLightIconSize: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
            osmTrafficLightPopupIcon: OSM.buildOsmTrafficLightPopupIconWrapperHtml(pillHtml),
        },
    };
}

function applyDisplayHazardMarkersFromPlan(execute) {
    if (!execute) return;

    if (!execute.shouldDisplay) {
        if (execute.clearExisting) clearHazardMarkers();
        if (execute.emptyLogMessage) console.log(execute.emptyLogMessage);
        return;
    }

    if (execute.clearExisting) clearHazardMarkers();

    execute.markers.forEach((spec) => {
        const marker = MapLibreHelpers.createMarker(spec.lat, spec.lon, {
            className: spec.className,
            html: spec.markerHtml,
            iconSize: spec.iconSize,
            iconAnchor: spec.iconAnchor,
            popup: spec.popupHtml,
        }).addTo(map);

        if (execute.pushToMarkerArray) window.hazardMarkers.push(marker);
    });

    if (execute.successLogMessage) console.log(execute.successLogMessage);
}

/**
 * Display hazard markers on the map
 * @param {Array} hazards - Array of hazard objects with lat, lon, type, description
 */
function displayHazardMarkers(hazards) {
    applyDisplayHazardMarkersFromPlan(
        _hazardMapMarkers().buildDisplayHazardMarkersEntryOrchestrationPlan(
            collectDisplayHazardMarkersInput(hazards)
        ).execute
    );
}

function applyClearHazardMarkersFromPlan(execute) {
    if (!execute) return;

    const existing = window.hazardMarkers || [];
    if (!execute.shouldClear) {
        if (execute.resetMarkerArray) window.hazardMarkers = [];
        return;
    }

    existing.forEach((marker) => {
        if (marker && typeof marker.remove === 'function') {
            marker.remove();
        }
    });
    if (execute.resetMarkerArray) window.hazardMarkers = [];
}

/**
 * Clear all hazard markers from the map
 */
function clearHazardMarkers() {
    const existing = window.hazardMarkers || [];
    applyClearHazardMarkersFromPlan(
        _hazardMapMarkers().buildClearHazardMarkersEntryOrchestrationPlan(existing.length).execute
    );
}

function applyDisplayAllRouteHazardsFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    displayHazardMarkers(apply.hazards);
    if (apply.logMessage) console.log(apply.logMessage);
}

/**
 * Display hazards from all routes on the map
 */
function displayAllRouteHazards() {
    applyDisplayAllRouteHazardsFromPlan(
        _hazardMapMarkers().buildDisplayAllRouteHazardsEntryOrchestrationPlan(routeOptions).apply
    );
}

// ===== BOTTOM SHEET ORCHESTRATION =====
function toggleBottomSheet() { VoyagrBottomSheetOrchestration.toggleBottomSheet(); }
function expandBottomSheet() { VoyagrBottomSheetOrchestration.expandBottomSheet(); }
function collapseBottomSheet() { VoyagrBottomSheetOrchestration.collapseBottomSheet(); }
function initBottomSheet() { VoyagrBottomSheetOrchestration.initBottomSheet(); }
function syncBottomSheetOverlapFabs() { VoyagrBottomSheetOrchestration.syncBottomSheetOverlapFabs(); }
function applyBottomSheetStateFromPlan(execute) { VoyagrBottomSheetOrchestration.applyBottomSheetStateFromPlan(execute); }

function getBottomSheetOrchestrationRuntime() {
    return {
        domHelpers: () => _domHelpers(),
        getBottomSheetStartY: () => bottomSheetStartY,
        setBottomSheetStartY: (val) => { bottomSheetStartY = val; },
        getBottomSheetCurrentY: () => bottomSheetCurrentY,
        setBottomSheetCurrentY: (val) => { bottomSheetCurrentY = val; },
        getBottomSheetIsExpanded: () => bottomSheetIsExpanded,
        setBottomSheetIsExpanded: (val) => { bottomSheetIsExpanded = val; },
        getRouteInProgress: () => routeInProgress,
    };
}

// ===== MAP LAYER STATE (orchestration in map-layers-orchestration.js) =====
const MLT = typeof VoyagrMapLayerToggles !== 'undefined' ? VoyagrMapLayerToggles : null;
const GPC = typeof VoyagrGooglePlusCodesPrefs !== 'undefined' ? VoyagrGooglePlusCodesPrefs : null;
const WL_INIT = typeof VoyagrWeatherLayer !== 'undefined' ? VoyagrWeatherLayer : null;

let trafficLayer = null;
let showTrafficEnabled = MLT
    ? MLT.resolveShowTrafficEnabledFromStorage(localStorage.getItem('showTrafficEnabled'))
    : localStorage.getItem('showTrafficEnabled') !== 'false';
let buildings3DEnabled = MLT
    ? MLT.resolveBuildings3DEnabledFromStorage(localStorage.getItem('buildings3DEnabled'))
    : localStorage.getItem('buildings3DEnabled') !== 'false';
let buildings3DHeightMultiplier = MLT
    ? MLT.parseBuildings3DHeightMultiplier(localStorage.getItem('buildings3DHeight'))
    : (parseFloat(localStorage.getItem('buildings3DHeight')) || 1.0);
let buildings3DOpacity = MLT
    ? MLT.parseBuildings3DOpacity(localStorage.getItem('buildings3DOpacity'))
    : (parseFloat(localStorage.getItem('buildings3DOpacity')) || 0.6);
let roadLabelsEnabled = MLT
    ? MLT.resolveRoadLabelsEnabledFromStorage(localStorage.getItem('roadLabelsEnabled'))
    : localStorage.getItem('roadLabelsEnabled') !== 'false';
let googlePlusCodesEnabled = GPC
    ? GPC.resolveGooglePlusCodesEnabledFromStorage(localStorage.getItem('googlePlusCodesEnabled'))
    : localStorage.getItem('googlePlusCodesEnabled') === 'true';
let weatherLayer = null;
let showWeatherEnabled = WL_INIT
    ? WL_INIT.resolveShowWeatherEnabledFromStorage(localStorage.getItem('showWeatherEnabled'))
    : localStorage.getItem('showWeatherEnabled') === 'true';
let weatherLayerType = WL_INIT
    ? WL_INIT.resolveWeatherLayerTypeFromStorage(localStorage.getItem('weatherLayerType'))
    : (localStorage.getItem('weatherLayerType') || 'precipitation_new');

function toggle3DBuildings() { VoyagrMapLayersOrchestration.toggle3DBuildings(); }
function toggleRoadLabels() { VoyagrMapLayersOrchestration.toggleRoadLabels(); }
function toggleGooglePlusCodes() { VoyagrMapLayersOrchestration.toggleGooglePlusCodes(); }
function set3DBuildingHeight(multiplier) { VoyagrMapLayersOrchestration.set3DBuildingHeight(multiplier); }
function set3DBuildingOpacity(opacity) { VoyagrMapLayersOrchestration.set3DBuildingOpacity(opacity); }
function toggleTrafficLayer() { VoyagrMapLayersOrchestration.toggleTrafficLayer(); }
function addTrafficLayer() { VoyagrMapLayersOrchestration.addTrafficLayer(); }
function removeTrafficLayer() { VoyagrMapLayersOrchestration.removeTrafficLayer(); }
function initTrafficLayer() { VoyagrMapLayersOrchestration.initTrafficLayer(); }
function toggleWeatherLayer() { VoyagrMapLayersOrchestration.toggleWeatherLayer(); }
function setWeatherLayerType(type) { VoyagrMapLayersOrchestration.setWeatherLayerType(type); }
function addWeatherLayer() { VoyagrMapLayersOrchestration.addWeatherLayer(); }
function removeWeatherLayer() { VoyagrMapLayersOrchestration.removeWeatherLayer(); }
function initWeatherLayer() { VoyagrMapLayersOrchestration.initWeatherLayer(); }

function getMapLayersOrchestrationRuntime() {
    return {
        mapLayerToggles: () => _mapLayerToggles(),
        weatherLayer: () => _weatherLayer(),
        toggleUI: () => _toggleUI(),
        googlePlusCodesPrefs: () => _googlePlusCodesPrefs(),
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getBuildings3DEnabled: () => buildings3DEnabled,
        setBuildings3DEnabled: (val) => { buildings3DEnabled = val; },
        getBuildings3DHeightMultiplier: () => buildings3DHeightMultiplier,
        setBuildings3DHeightMultiplier: (val) => { buildings3DHeightMultiplier = val; },
        getBuildings3DOpacity: () => buildings3DOpacity,
        setBuildings3DOpacity: (val) => { buildings3DOpacity = val; },
        getRoadLabelsEnabled: () => roadLabelsEnabled,
        setRoadLabelsEnabled: (val) => { roadLabelsEnabled = val; },
        getGooglePlusCodesEnabled: () => googlePlusCodesEnabled,
        setGooglePlusCodesEnabled: (val) => { googlePlusCodesEnabled = val; },
        getShowTrafficEnabled: () => showTrafficEnabled,
        setShowTrafficEnabled: (val) => { showTrafficEnabled = val; },
        getTrafficLayer: () => trafficLayer,
        setTrafficLayer: (val) => { trafficLayer = val; },
        getShowWeatherEnabled: () => showWeatherEnabled,
        setShowWeatherEnabled: (val) => { showWeatherEnabled = val; },
        getWeatherLayer: () => weatherLayer,
        setWeatherLayer: (val) => { weatherLayer = val; },
        getWeatherLayerType: () => weatherLayerType,
        setWeatherLayerType: (val) => { weatherLayerType = val; },
        call: {
            showStatus,
            saveAllSettings,
            applySupportLinksFromConfig,
            bringRoutesToTop,
            recomputeMapView3DFromGranular: _recomputeMapView3DFromGranular,
            scheduleMapRepaintAfterUiChange: typeof scheduleMapRepaintAfterUiChange === 'function' ? scheduleMapRepaintAfterUiChange : null,
        },
    };
}


// ===== AUTO-TRAFFIC UPDATE & AUTO-REROUTE SYSTEM =====
// Traffic orchestration lives in static/js/app/traffic-orchestration.js (bound at file end).
// Reroute map update orchestration lives in static/js/app/reroute-map-orchestration.js (bound at file end).
// Deviation tracking for time-based detection (shared with GPS reroute):
let routeJoinConfirmedForDeviation = false;
/** After GPS deviation reroute, next in-nav route pick uses primary only (no name-based alt). */
let _preferPrimaryRouteOnNextNavUpdate = false;

function applyDeviationRerouteState(dev) {
    deviationStartTimeCheck = dev.deviationStartTimeCheck;
    rerouteAttemptCount = dev.rerouteAttemptCount;
    postRerouteGraceUntil = dev.postRerouteGraceUntil;
    routeJoinConfirmedForDeviation = dev.routeJoinConfirmedForDeviation;
    deviationOffRouteStreak = dev.deviationOffRouteStreak;
    lastRerouteTime = dev.lastRerouteTime;
    lastRerouteAttemptTime = dev.lastRerouteAttemptTime;
    rerouteInProgress = dev.rerouteInProgress;
    if (dev.clearFailureRetries) clearRerouteFailureRetries();
}

function getRerouteMapOrchestrationRuntime() {
    return {
        rerouteDecision: () => _rerouteDecision(),
        routeSelection: () => _routeSelection(),
        navigationDestination: () => _navigationDestination(),
        routingRequest: () => _routingRequest(),
        routeGeometry: () => _routeGeometry(),
        routeProgress: () => _routeProgress(),
        speedGps: () => _speedGps(),
        speedLimitWidget: () => _speedLimitWidget(),
        voiceAnnouncements: () => _voiceAnnouncements(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        setLastCalculatedRoute: (val) => { window.lastCalculatedRoute = val; },
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getRouteLayer: () => routeLayer,
        setRouteLayer: (val) => { routeLayer = val; },
        getRouteInProgress: () => routeInProgress,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getCurrentRouteSteps: () => currentRouteSteps,
        setCurrentRouteSteps: (val) => { currentRouteSteps = val; },
        getCurrentStepIndex: () => currentStepIndex,
        setCurrentStepIndex: (val) => { currentStepIndex = val; },
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        setLastSnappedRouteIndex: (val) => { lastSnappedRouteIndex = val; },
        getLastTurnDetectRouteVertexIndex: () => lastTurnDetectRouteVertexIndex,
        setLastTurnDetectRouteVertexIndex: (val) => { lastTurnDetectRouteVertexIndex = val; },
        getRouteJoinConfirmedForDeviation: () => routeJoinConfirmedForDeviation,
        setRouteJoinConfirmedForDeviation: (val) => { routeJoinConfirmedForDeviation = val; },
        getPreferPrimaryRouteOnNextNavUpdate: () => _preferPrimaryRouteOnNextNavUpdate,
        setPreferPrimaryRouteOnNextNavUpdate: (val) => { _preferPrimaryRouteOnNextNavUpdate = val; },
        getCurrentRoutingMode: () => currentRoutingMode,
        getCurrentVehicleType: () => currentVehicleType,
        getCurrentUserMarker: () => currentUserMarker,
        getSnapBlendWeightState: () => _snapBlendWeightState,
        getSmoothDisplayLat: () => _smoothDisplayLat,
        getSmoothDisplayLon: () => _smoothDisplayLon,
        getAnnouncedTurnThresholds: () => announcedTurnThresholds,
        getAnnouncedExitThresholds: () => announcedExitThresholds,
        getAnnouncedKeepThresholds: () => announcedKeepThresholds,
        setLastETAAnnouncementTime: (val) => { lastETAAnnouncementTime = val; },
        setLastAnnouncedETA: (val) => { lastAnnouncedETA = val; },
        setLastDestinationAnnouncementDistance: (val) => { lastDestinationAnnouncementDistance = val; },
        setInitialETAMovementRetries: (val) => { initialETAMovementRetries = val; },
        setVoiceAnnouncedForManeuverIndex: (val) => { _voiceAnnouncedForManeuverIndex = val; },
        setVoiceAnnouncedCategory: (val) => { _voiceAnnouncedCategory = val; },
        applyDeviationRerouteState,
        call: {
            getRouteCostParams,
            getRoutePreferences,
            isAvoidTollsEnabled,
            convertDistance,
            getDistanceUnit,
            decodePolyline,
            navActiveRouteColor,
            bringNavRouteAboveTrafficEdges,
            resetVehicleMarkerDisplayState,
            applySpeedLimitFetchResetFromPlan,
            primeVehicleMarkerOnRoute,
            resetNavigationArrivalState,
            resetRoadNameState: () => VoyagrRoadNameOrchestration.resetRoadNameState(),
            clearRerouteFailureRetries,
            updateTurnWidgetFromPosition,
            fetchRoadNameThrottled,
            updateTripInfo,
            clearInitialETAAnnouncement,
            setLastLaneVoiceKey: (val) => VoyagrLaneGuidanceOrchestration.setLastLaneVoiceKey(val),
            resolveGpsRouteSnapForTick,
            applyVehicleMarkerFromTickPlan,
        },
    };
}

function pickActiveRouteDuringNavigation(routeList, singleRoutePayload) {
    return VoyagrRerouteMapOrchestration.pickActiveRouteDuringNavigation(routeList, singleRoutePayload);
}

function resolveNavigationDestination() {
    return VoyagrRerouteMapOrchestration.resolveNavigationDestination();
}

function buildRouteRequest(startLat, startLon, destination, avoidPoints = null) {
    return VoyagrRerouteMapOrchestration.buildRouteRequest(startLat, startLon, destination, avoidPoints);
}

function applyVoiceAnnouncementStateResetFromPlan(execute) {
    return VoyagrRerouteMapOrchestration.applyVoiceAnnouncementStateResetFromPlan(execute);
}

function resetVoiceAnnouncementStateForNewRoute() {
    return VoyagrRerouteMapOrchestration.resetVoiceAnnouncementStateForNewRoute();
}

function applyRouteMapUpdateStateFromPlan(plan, newRoute) {
    return VoyagrRerouteMapOrchestration.applyRouteMapUpdateStateFromPlan(plan, newRoute);
}

function updateRouteOnMap(newRoute) {
    return VoyagrRerouteMapOrchestration.updateRouteOnMap(newRoute);
}

function getNavActiveRoutePolylineOptions() {
    return VoyagrRerouteMapOrchestration.getNavActiveRoutePolylineOptions();
}

function redrawNavigationRouteLayer(reason) {
    return VoyagrRerouteMapOrchestration.redrawNavigationRouteLayer(reason);
}

function redrawNavigationVehicleMarker(reason) {
    return VoyagrRerouteMapOrchestration.redrawNavigationVehicleMarker(reason);
}

function redrawNavigationOverlaysAfterMapRecovery(reason) {
    return VoyagrRerouteMapOrchestration.redrawNavigationOverlaysAfterMapRecovery(reason);
}

function seedNavigationProgressOnNewRoute(lat, lon) {
    return VoyagrRerouteMapOrchestration.seedNavigationProgressOnNewRoute(lat, lon);
}

// ===== CAZ ORCHESTRATION =====
// Orchestration lives in static/js/app/caz-orchestration.js (bound at file end).

function getCazOrchestrationRuntime() {
    return {
        cazInfo: () => _cazInfo(),
    };
}

function showCAZInfo() { return VoyagrCazOrchestration.showCAZInfo(); }
function getCAZPassTypes() { return VoyagrCazOrchestration.getCAZPassTypes(); }
function checkRouteCAZ(routeCoords, vehicleCazPass, vehicleType) {
    return VoyagrCazOrchestration.checkRouteCAZ(routeCoords, vehicleCazPass, vehicleType);
}

// ===== ALWAYS-ON CAMERA LAYER =====
// Orchestration lives in static/js/app/map-overlay-orchestration.js (bound at file end).

function getMapOverlayOrchestrationRuntime() {
    return {
        mapOverlayToggles: () => _mapOverlayToggles(),
        mapLayerToggles: () => _mapLayerToggles(),
        toggleUI: () => _toggleUI(),
        osmMapIcons: () => _osmMapIcons(),
        hazardMapMarkers: () => _hazardMapMarkers(),
        cameraMapMarkers: () => _cameraMapMarkers(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRoadLabelsEnabled: () => roadLabelsEnabled,
        call: {
            saveAllSettings,
        },
    };
}

function getOsmTrafficLightMarkerPillHTML() {
    return VoyagrMapOverlayOrchestration.getOsmTrafficLightMarkerPillHTML();
}

function toggleShowCameras() {
    VoyagrMapOverlayOrchestration.toggleShowCameras();
}

function toggleShowOsmTrafficLights() {
    VoyagrMapOverlayOrchestration.toggleShowOsmTrafficLights();
}

function toggleShowOsmRailwayCrossings() {
    VoyagrMapOverlayOrchestration.toggleShowOsmRailwayCrossings();
}

function initializeCameraLayer() {
    VoyagrMapOverlayOrchestration.initializeCameraLayer();
}

function initializeRoadLabels() {
    VoyagrMapOverlayOrchestration.initializeRoadLabels();
}

/**
 * startNavigation function
 * @function startNavigation
 * @returns {*} Return value description
 */
function startNavigation() {
    const RS = _routeSelection();
    const plan = RS.buildStartNavigationExecutePlan(window.lastCalculatedRoute);
    if (!plan.shouldStart) {
        showStatus(plan.errorStatusMessage, 'error');
        return;
    }

    startTurnByTurnNavigation(window.lastCalculatedRoute);

    plan.hideStartNavButtonIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
    });

    if (plan.collapseBottomSheet) collapseBottomSheet();
}

// ===== ROUTE PREVIEW ORCHESTRATION =====
function showRoutePreview(routeData, skipMapDisplay = false) {
    VoyagrRoutePreviewOrchestration.showRoutePreview(routeData, skipMapDisplay);
}
function showAlternativeRoutesInPreview() { VoyagrRoutePreviewOrchestration.showAlternativeRoutesInPreview(); }
function showRouteComparison() { return VoyagrRoutePreviewOrchestration.showRouteComparison(); }
function overviewRoute() { VoyagrRoutePreviewOrchestration.overviewRoute(); }
function startNavigationFromPreview() { VoyagrRoutePreviewOrchestration.startNavigationFromPreview(); }
function applyRouteUpdateDuringNavigation(routeData) {
    VoyagrRoutePreviewOrchestration.applyRouteUpdateDuringNavigation(routeData);
}
function updateTripInfo(distance, time, fuelCost, tollCost) {
    VoyagrRoutePreviewOrchestration.updateTripInfo(distance, time, fuelCost, tollCost);
}

function getRoutePreviewOrchestrationRuntime() {
    return {
        routeSelection: () => _routeSelection(),
        routingRequest: () => _routingRequest(),
        routeSharing: () => _routeSharing(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRouteOptions: () => routeOptions,
        setRouteOptions: (val) => { routeOptions = val; },
        getSelectedRouteIndex: () => selectedRouteIndex,
        setSelectedRouteIndex: (val) => { selectedRouteIndex = val; },
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getRouteInProgress: () => routeInProgress,
        getCurrentRoutingMode: () => currentRoutingMode,
        getCurrentVehicleType: () => currentVehicleType,
        getDistanceUnitValue: () => distanceUnit,
        getShowTrafficEnabled: () => showTrafficEnabled,
        getTrafficLayer: () => trafficLayer,
        call: {
            showStatus,
            switchTab,
            expandBottomSheet,
            addTrafficLayer,
            fetchAndDisplayRouteTraffic,
            displayAllRoutesOnMap,
            selectRoute,
            useRoute,
            pickActiveRouteDuringNavigation,
            updateRouteOnMap,
            decodePolyline,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            syncLastCalculatedRouteFromSelection,
            startTurnByTurnNavigation,
            collapseBottomSheet,
            applyTripInfoDomFromPlan,
            routeColors,
            getTrafficSettingsSnapshot: () => VoyagrTrafficOrchestration.getTrafficSettingsSnapshot(),
        },
    };
}


// ===== PARKING INTEGRATION FEATURE =====
// Orchestration lives in static/js/app/parking-orchestration.js (bound at file end).

function getParkingOrchestrationRuntime() {
    return {
        multimodalParking: () => _multimodalParking(),
        routingRequest: () => _routingRequest(),
        getMap: () => map,
        getRouteOptionsLength: () => (routeOptions && routeOptions.length) || 0,
        getSelectedRouteIndex: () => selectedRouteIndex,
        getRouteOptionAt: (idx) => (routeOptions && routeOptions[idx]) || null,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        getCurrentVehicleType: () => currentVehicleType,
        getRouteCostParams,
        isAvoidTollsEnabled,
        decodePolyline,
        convertDistance,
        getDistanceUnit,
        showStatus,
        saveAllSettings,
        applyDomSelectsFromPlan,
        expandBottomSheet,
        showRoutePreview,
        calculateRoute,
        geocodeLocations,
    };
}

function collectParkingPreferencesFormState() {
    return VoyagrParkingOrchestration.collectParkingPreferencesFormState();
}

function saveParkingPreferences() {
    VoyagrParkingOrchestration.saveParkingPreferences();
}

function loadParkingPreferences() {
    VoyagrParkingOrchestration.loadParkingPreferences();
}

function findParkingNearDestination() {
    return VoyagrParkingOrchestration.findParkingNearDestination();
}

function clearParkingSelection() {
    VoyagrParkingOrchestration.clearParkingSelection();
}

function setParkingAsDestination(parking) {
    return VoyagrParkingOrchestration.setParkingAsDestination(parking);
}

// ===== TRAFFIC ORCHESTRATION =====
// Orchestration lives in static/js/app/traffic-orchestration.js (bound at file end).

function getTrafficOrchestrationRuntime() {
    return {
        trafficChange: () => _trafficChange(),
        routeTrafficFlow: () => _routeTrafficFlow(),
        toggleUI: () => _toggleUI(),
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRoutePolyline: () => routePolyline,
        getRouteInProgress: () => routeInProgress,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        getRouteLayer: () => routeLayer,
        getAllRouteLayers: () => VoyagrRouteComparisonOrchestration.getAllRouteLayers(),
        getVoiceAnnouncementsEnabled: () => voiceAnnouncementsEnabled,
        showStatus,
        saveAllSettings,
        sendNotification,
        speakMessage,
        convertDistance,
        getDistanceUnit,
        calculateDistanceMeters,
        buildRouteRequest,
        resolveNavigationDestination,
        updateRouteOnMap,
        applyMapLayerReorderFromPlan,
    };
}

function updateTrafficConditions() {
    VoyagrTrafficOrchestration.updateTrafficConditions();
}

function startTrafficMonitoring() {
    VoyagrTrafficOrchestration.startTrafficMonitoring();
}

function stopTrafficMonitoring() {
    VoyagrTrafficOrchestration.stopTrafficMonitoring();
}

function toggleRouteTraffic() {
    VoyagrTrafficOrchestration.toggleRouteTraffic();
}

function fetchAndDisplayRouteTraffic() {
    return VoyagrTrafficOrchestration.fetchAndDisplayRouteTraffic();
}

function bringTrafficEdgesToTop() {
    VoyagrTrafficOrchestration.bringTrafficEdgesToTop();
}

function bringNavRouteAboveTrafficEdges() {
    VoyagrTrafficOrchestration.bringNavRouteAboveTrafficEdges();
}

function ensureLabelsOnTop() {
    VoyagrTrafficOrchestration.ensureLabelsOnTop();
}

function startRouteTrafficUpdates() {
    VoyagrTrafficOrchestration.startRouteTrafficUpdates();
}

function stopRouteTrafficUpdates() {
    VoyagrTrafficOrchestration.stopRouteTrafficUpdates();
}

function toggleAutoTrafficUpdate() {
    VoyagrTrafficOrchestration.toggleAutoTrafficUpdate();
}

function toggleAutoRerouteOnDeviation() {
    VoyagrTrafficOrchestration.toggleAutoRerouteOnDeviation();
}

function startAutoTrafficUpdates() {
    VoyagrTrafficOrchestration.startAutoTrafficUpdates();
}

function stopAutoTrafficUpdates() {
    VoyagrTrafficOrchestration.stopAutoTrafficUpdates();
}

function checkTrafficAndReroute() {
    return VoyagrTrafficOrchestration.checkTrafficAndReroute();
}

function manualTrafficUpdate() {
    return VoyagrTrafficOrchestration.manualTrafficUpdate();
}

function getRouteTrafficAhead(forceFresh) {
    return VoyagrTrafficOrchestration.getRouteTrafficAhead(forceFresh);
}

function getAutoRerouteOnDeviationEnabled() {
    return VoyagrTrafficOrchestration.getTrafficSettingsSnapshot().autoRerouteOnDeviationEnabled;
}

// ===== PORCUPINE WAKE ORCHESTRATION =====
// Orchestration lives in static/js/app/porcupine-orchestration.js (bound at file end).

function getPorcupineOrchestrationRuntime() {
    return {
        porcupineWake: () => _porcupineWake(),
        toggleUI: () => _toggleUI(),
        showStatus,
        saveAllSettings,
        speakMessage,
        initVoiceRecognition,
        getVoiceRecognition: () => VoyagrVoiceControlOrchestration.getVoiceRecognition(),
        getIsListening: () => VoyagrVoiceControlOrchestration.getIsListening(),
        setIsListening: (v) => VoyagrVoiceControlOrchestration.setIsListening(v),
        setVoiceFinalTranscript: (v) => VoyagrVoiceControlOrchestration.setVoiceFinalTranscript(v),
    };
}

function picovoiceClientConfigured() {
    return VoyagrPorcupineOrchestration.picovoiceClientConfigured();
}

function loadPorcupineWakeUi() {
    VoyagrPorcupineOrchestration.loadPorcupineWakeUi();
}

function togglePorcupineWakeWord() {
    VoyagrPorcupineOrchestration.togglePorcupineWakeWord();
}

function maybeResumePorcupineWakeAfterVoice() {
    VoyagrPorcupineOrchestration.maybeResumePorcupineWakeAfterVoice();
}

function startPorcupineWakePipeline() {
    return VoyagrPorcupineOrchestration.startPorcupineWakePipeline();
}

function stopPorcupineWakePipeline() {
    return VoyagrPorcupineOrchestration.stopPorcupineWakePipeline();
}

function warmPicovoiceStaticCache() {
    VoyagrPorcupineOrchestration.warmPicovoiceStaticCache();
}


// ===== GPS ORCHESTRATION =====
// Orchestration lives in static/js/app/gps-orchestration.js (bound at file end).

function getGpsOrchestrationRuntime() {
    return {
        g: (key) => {
            switch (key) {
            case 'map': return map;
            case 'routeInProgress': return routeInProgress;
            case 'routePolyline': return routePolyline;
            case 'routeStarted': return routeStarted;
            case 'currentLat': return currentLat;
            case 'currentLon': return currentLon;
            case 'currentStepIndex': return currentStepIndex;
            case 'lastSnappedRouteIndex': return lastSnappedRouteIndex;
            case 'currentRouteSteps': return currentRouteSteps;
            case 'isTrackingActive': return isTrackingActive;
            case 'gpsWatchId': return gpsWatchId;
            case 'currentUserMarker': return currentUserMarker;
            case 'trackingHistory': return trackingHistory;
            case 'zoomAndFollowEnabled': return zoomAndFollowEnabled;
            case 'mapFollowingActive': return mapFollowingActive;
            case 'driverPerspectiveEnabled': return driverPerspectiveEnabled;
            case '_snapBlendWeightState': return _snapBlendWeightState;
            case '_smoothDisplayLat': return _smoothDisplayLat;
            case '_smoothDisplayLon': return _smoothDisplayLon;
            case 'currentSpeedLimitMph': return currentSpeedLimitMph;
            case 'lastSpeedLimitRegion': return lastSpeedLimitRegion;
            case 'lastDetectedRoadType': return lastDetectedRoadType;
            case '_lastActiveManeuverIdx': return _lastActiveManeuverIdx;
            case '_lastGoodRawPickMph': return _lastGoodRawPickMph;
            case '_consecutiveDisplacementMoves': return _consecutiveDisplacementMoves;
            case '_smoothedSpeedMph': return _smoothedSpeedMph;
            case '_smoothedSpeedInitAt': return _smoothedSpeedInitAt;
            case 'announcedTurnThresholds': return announcedTurnThresholds;
            case 'announcedExitThresholds': return announcedExitThresholds;
            case 'announcedKeepThresholds': return announcedKeepThresholds;
            case '_voiceAnnouncedForManeuverIndex': return _voiceAnnouncedForManeuverIndex;
            case '_voiceAnnouncedCategory': return _voiceAnnouncedCategory;
            case '_lastLaneVoiceKey': return VoyagrLaneGuidanceOrchestration.getLastLaneVoiceKey();
            case 'lastDestinationAnnouncementDistance': return lastDestinationAnnouncementDistance;
            case '_navigationArrivalTriggered': return _navigationArrivalTriggered;
            case '_navigationArrivalZoneSince': return _navigationArrivalZoneSince;
            case '_navTraveledMeters': return _navTraveledMeters;
            case '_navOdometerLastGeo': return _navOdometerLastGeo;
            case '_navStartedAt': return _navStartedAt;
            case 'lastETAAnnouncementTime': return lastETAAnnouncementTime;
            case 'lastAnnouncedETA': return lastAnnouncedETA;
            case 'initialETAMovementRetries': return initialETAMovementRetries;
            case 'initialETAAnnouncementTimeoutId': return initialETAAnnouncementTimeoutId;
            case 'lastNavTrafficFetchAt': return lastNavTrafficFetchAt;
            case 'routeJoinConfirmedForDeviation': return routeJoinConfirmedForDeviation;
            case 'deviationStartTimeCheck': return deviationStartTimeCheck;
            case 'deviationOffRouteStreak': return deviationOffRouteStreak;
            case 'rerouteAttemptCount': return rerouteAttemptCount;
            case 'postRerouteGraceUntil': return postRerouteGraceUntil;
            case 'lastRerouteTime': return lastRerouteTime;
            case 'lastRerouteAttemptTime': return lastRerouteAttemptTime;
            case 'rerouteInProgress': return rerouteInProgress;
            case 'lastRerouteDeviation': return lastRerouteDeviation;
            case 'rerouteFailureRetryTimer': return rerouteFailureRetryTimer;
            case 'rerouteFailureRetryCount': return rerouteFailureRetryCount;
            case '_preferPrimaryRouteOnNextNavUpdate': return _preferPrimaryRouteOnNextNavUpdate;
            case 'lastTurnDetectRouteVertexIndex': return lastTurnDetectRouteVertexIndex;
            case 'voiceAnnouncementsEnabled': return voiceAnnouncementsEnabled;
            case 'voiceFrequencyMode': return voiceFrequencyMode;
            case 'speedWidgetEnabled': return speedWidgetEnabled;
            case 'userHasStartedMoving': return userHasStartedMoving;
                default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'map': map = val; break;
            case 'routeInProgress': routeInProgress = val; break;
            case 'routePolyline': routePolyline = val; break;
            case 'routeStarted': routeStarted = val; break;
            case 'currentLat': currentLat = val; break;
            case 'currentLon': currentLon = val; break;
            case 'currentStepIndex': currentStepIndex = val; break;
            case 'lastSnappedRouteIndex': lastSnappedRouteIndex = val; break;
            case 'currentRouteSteps': currentRouteSteps = val; break;
            case 'isTrackingActive': isTrackingActive = val; break;
            case 'gpsWatchId': gpsWatchId = val; break;
            case 'currentUserMarker': currentUserMarker = val; break;
            case 'trackingHistory': trackingHistory = val; break;
            case 'zoomAndFollowEnabled': zoomAndFollowEnabled = val; break;
            case 'mapFollowingActive': mapFollowingActive = val; break;
            case 'driverPerspectiveEnabled': driverPerspectiveEnabled = val; break;
            case '_snapBlendWeightState': _snapBlendWeightState = val; break;
            case '_smoothDisplayLat': _smoothDisplayLat = val; break;
            case '_smoothDisplayLon': _smoothDisplayLon = val; break;
            case 'currentSpeedLimitMph': currentSpeedLimitMph = val; break;
            case 'lastSpeedLimitRegion': lastSpeedLimitRegion = val; break;
            case 'lastDetectedRoadType': lastDetectedRoadType = val; break;
            case '_lastActiveManeuverIdx': _lastActiveManeuverIdx = val; break;
            case '_lastGoodRawPickMph': _lastGoodRawPickMph = val; break;
            case '_consecutiveDisplacementMoves': _consecutiveDisplacementMoves = val; break;
            case '_smoothedSpeedMph': _smoothedSpeedMph = val; break;
            case '_smoothedSpeedInitAt': _smoothedSpeedInitAt = val; break;
            case 'announcedTurnThresholds': announcedTurnThresholds = val; break;
            case 'announcedExitThresholds': announcedExitThresholds = val; break;
            case 'announcedKeepThresholds': announcedKeepThresholds = val; break;
            case '_voiceAnnouncedForManeuverIndex': _voiceAnnouncedForManeuverIndex = val; break;
            case '_voiceAnnouncedCategory': _voiceAnnouncedCategory = val; break;
            case '_lastLaneVoiceKey': VoyagrLaneGuidanceOrchestration.setLastLaneVoiceKey(val); break;
            case 'lastDestinationAnnouncementDistance': lastDestinationAnnouncementDistance = val; break;
            case '_navigationArrivalTriggered': _navigationArrivalTriggered = val; break;
            case '_navigationArrivalZoneSince': _navigationArrivalZoneSince = val; break;
            case '_navTraveledMeters': _navTraveledMeters = val; break;
            case '_navOdometerLastGeo': _navOdometerLastGeo = val; break;
            case '_navStartedAt': _navStartedAt = val; break;
            case 'lastETAAnnouncementTime': lastETAAnnouncementTime = val; break;
            case 'lastAnnouncedETA': lastAnnouncedETA = val; break;
            case 'initialETAMovementRetries': initialETAMovementRetries = val; break;
            case 'initialETAAnnouncementTimeoutId': initialETAAnnouncementTimeoutId = val; break;
            case 'lastNavTrafficFetchAt': lastNavTrafficFetchAt = val; break;
            case 'routeJoinConfirmedForDeviation': routeJoinConfirmedForDeviation = val; break;
            case 'deviationStartTimeCheck': deviationStartTimeCheck = val; break;
            case 'deviationOffRouteStreak': deviationOffRouteStreak = val; break;
            case 'rerouteAttemptCount': rerouteAttemptCount = val; break;
            case 'postRerouteGraceUntil': postRerouteGraceUntil = val; break;
            case 'lastRerouteTime': lastRerouteTime = val; break;
            case 'lastRerouteAttemptTime': lastRerouteAttemptTime = val; break;
            case 'rerouteInProgress': rerouteInProgress = val; break;
            case 'lastRerouteDeviation': lastRerouteDeviation = val; break;
            case 'rerouteFailureRetryTimer': rerouteFailureRetryTimer = val; break;
            case 'rerouteFailureRetryCount': rerouteFailureRetryCount = val; break;
            case '_preferPrimaryRouteOnNextNavUpdate': _preferPrimaryRouteOnNextNavUpdate = val; break;
            case 'lastTurnDetectRouteVertexIndex': lastTurnDetectRouteVertexIndex = val; break;
            case 'voiceAnnouncementsEnabled': voiceAnnouncementsEnabled = val; break;
            case 'voiceFrequencyMode': voiceFrequencyMode = val; break;
            case 'speedWidgetEnabled': speedWidgetEnabled = val; break;
            case 'userHasStartedMoving': userHasStartedMoving = val; break;
                default: break;
            }
        },
        m: {
            speedGps: () => _speedGps(),
            cameraPitch: () => _cameraPitch(),
            routeGeometry: () => _routeGeometry(),
            routeProgress: () => _routeProgress(),
            rerouteDecision: () => _rerouteDecision(),
            eta: () => _eta(),
            voiceAnnouncements: () => _voiceAnnouncements(),
            hazardAlerts: () => _hazardAlerts(),
            speedLimitWidget: () => _speedLimitWidget(),
            mapControls: () => _mapControls(),
            toggleUI: () => _toggleUI(),
            trafficChange: () => _trafficChange(),
            routeSelection: () => _routeSelection(),
            navigationDestination: () => _navigationDestination(),
            routingRequest: () => _routingRequest(),
        },
        consts: {
            ZOOM_LEVELS,
            TURN_ZOOM_THRESHOLD,
            TURN_ANNOUNCEMENT_DISTANCES,
            EXIT_ANNOUNCEMENT_DISTANCES,
            KEEP_ANNOUNCEMENT_DISTANCES,
            DESTINATION_ANNOUNCEMENT_DISTANCES,
            ETA_CHANGE_THRESHOLD_MS,
            ETA_MIN_INTERVAL_MS,
            HAZARD_WARNING_DISTANCE,
        },
        getIsOffline: () => VoyagrOfflineNavigationOrchestration.getIsOffline(),
        call: {
            resolveGpsRouteSnapForTick,
            smoothGpsSpeedMph,
            updateRecenterButtonVisibility,
            updateTurnWidgetFromPosition,
            fetchRoadNameThrottled: (lat, lon) => VoyagrRoadNameOrchestration.fetchRoadNameThrottled(lat, lon),
            showStatus,
            sendNotification,
            speakMessage,
            updateRouteOnMap,
            getRouteTrafficAhead,
            getAutoRerouteOnDeviationEnabled,
            pickActiveRouteDuringNavigation,
            buildRouteRequest,
            resolveNavigationDestination,
            isActiveNavigationFollow,
            shouldTiltDrivingCamera,
            shouldUsePitchedDrivingCamera,
            applySmartZoomWithAnimation,
            getCurrentRoadType,
            createVehicleMarker,
            calculateDistanceMeters,
            convertDistance,
            getDistanceUnit,
            updateSpeedWidgetVisibility,
            updateRoadReportFabVisibility,
            hasUserStartedMoving,
            getSpeedLimitFetchState: () => VoyagrSpeedWidgetOrchestration.getSpeedLimitFetchState(),
        },
    };
}

function startGPSTracking() { VoyagrGpsOrchestration.startGPSTracking(); }
function stopGPSTracking() { VoyagrGpsOrchestration.stopGPSTracking(); }
function applyVehicleMarkerFromTickPlan(markerTick) { VoyagrGpsOrchestration.applyVehicleMarkerFromTickPlan(markerTick); }
function applySpeedLimitFetchResetFromPlan(resetPlan) { VoyagrGpsOrchestration.applySpeedLimitFetchResetFromPlan(resetPlan); }
function resetVehicleMarkerDisplayState() { VoyagrGpsOrchestration.resetVehicleMarkerDisplayState(); }
function primeVehicleMarkerOnRoute(lat, lon) { VoyagrGpsOrchestration.primeVehicleMarkerOnRoute(lat, lon); }
function resetNavigationArrivalState() { VoyagrGpsOrchestration.resetNavigationArrivalState(); }
function clearRerouteFailureRetries() { VoyagrGpsOrchestration.clearRerouteFailureRetries(); }
function ensureDefaultTrafficAwareRouting() { VoyagrGpsOrchestration.ensureDefaultTrafficAwareRouting(); }
function applyTrafficRatioToBaseRemaining(baseRemainingMinutes) {
    return VoyagrGpsOrchestration.applyTrafficRatioToBaseRemaining(baseRemainingMinutes);
}
function computeBaseNavigationETAMinutes() { return VoyagrGpsOrchestration.computeBaseNavigationETAMinutes(); }
function renderTurnInfoETAPanel(baseMinutes, adjustedMinutes, progressPercent, trafficLevel, congestionPercent) {
    VoyagrGpsOrchestration.renderTurnInfoETAPanel(baseMinutes, adjustedMinutes, progressPercent, trafficLevel, congestionPercent);
}
async function refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch) {
    return VoyagrGpsOrchestration.refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch);
}
function getNavigationRemainingDistanceMeters(lat, lon) {
    return VoyagrGpsOrchestration.getNavigationRemainingDistanceMeters(lat, lon);
}
function updateNavigationFabVisibility() { VoyagrGpsOrchestration.updateNavigationFabVisibility(); }
function processNavigationHazardAlerts(lat, lon) { VoyagrGpsOrchestration.processNavigationHazardAlerts(lat, lon); }
function checkNearbyHazards(lat, lon) { VoyagrGpsOrchestration.checkNearbyHazards(lat, lon); }
function checkRouteHazardCamerasAhead(lat, lon) { VoyagrGpsOrchestration.checkRouteHazardCamerasAhead(lat, lon); }
function saveCameraAlertPreferences() { VoyagrGpsOrchestration.saveCameraAlertPreferences(); }
function loadCameraAlertPreferences() { VoyagrGpsOrchestration.loadCameraAlertPreferences(); }
function triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon) {
    return VoyagrGpsOrchestration.triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon);
}
function triggerAutomaticReroute(currentLat, currentLon) {
    return VoyagrGpsOrchestration.triggerAutomaticReroute(currentLat, currentLon);
}

/**
 * Collect voice preference values from settings form controls.
 * @returns {Object}
 */
function collectVoicePreferencesDomInput() {
    return {
        turnDistance1: document.getElementById('voiceTurnDistance1')?.value,
        turnDistance2: document.getElementById('voiceTurnDistance2')?.value,
        turnDistance3: document.getElementById('voiceTurnDistance3')?.value,
        hazardDistance: document.getElementById('voiceHazardDistance')?.value,
        voiceFrequencyMode: document.getElementById('voiceFrequencyMode')?.value,
        announcementsEnabled: typeof voiceAnnouncementsEnabled === 'boolean'
            ? voiceAnnouncementsEnabled
            : (localStorage.getItem('voiceAnnouncementsEnabled') === 'true'),
    };
}

function collectVoicePreferencesFormState() {
    const VA = _voiceAnnouncements();
    return VA.buildVoicePreferencesCollectPlan(
        VA.buildCollectVoicePreferencesDomInputPlan(collectVoicePreferencesDomInput())
    );
}

/**
 * Apply voice preference runtime globals from a pure runtime apply plan.
 * @param {Object} plan
 */
function applyVoicePreferencesRuntimeFromPlan(plan) {
    if (!plan) return;
    TURN_ANNOUNCEMENT_DISTANCES.length = 0;
    TURN_ANNOUNCEMENT_DISTANCES.push(...plan.turnAnnouncementDistances);
    DESTINATION_ANNOUNCEMENT_DISTANCES.length = 0;
    DESTINATION_ANNOUNCEMENT_DISTANCES.push(...plan.destinationAnnouncementDistances);
    HAZARD_WARNING_DISTANCE = plan.hazardWarningDistance;
    voiceAnnouncementsEnabled = plan.voiceAnnouncementsEnabled;
    voiceFrequencyMode = plan.voiceFrequencyMode;
    VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS = plan.voiceAnnouncementMinIntervalMs;
}

function applySaveVoicePreferencesFromPlan(execute) {
    if (!execute || !execute.shouldSave) return;

    (execute.storagePatches || []).forEach(({ key, value }) => {
        localStorage.setItem(key, value);
    });
    if (execute.applyRuntime) {
        applyVoicePreferencesRuntimeFromPlan(execute.runtimePlan);
    }

    console.log(execute.logMessage, execute.prefs);
    showStatus(execute.successStatusMessage, execute.successStatusType);
}

/**
 * saveVoicePreferences function
 * @function saveVoicePreferences
 * @returns {*} Return value description
 */
function saveVoicePreferences() {
    const VA = _voiceAnnouncements();
    applySaveVoicePreferencesFromPlan(
        VA.buildSaveVoicePreferencesEntryOrchestrationPlan(
            collectVoicePreferencesFormState()
        ).execute
    );
}

function applyLoadVoicePreferencesSavedFromPlan(entry) {
    const execute = entry.execute;
    if (!execute || !execute.shouldApply) return;

    applyDomSelectsFromPlan(execute.domPlan.selects);
    _toggleUI().applyLabeledToggleButton(
        document.getElementById(execute.domPlan.labeledToggle.id),
        execute.domPlan.labeledToggle.enabled
    );
    applyVoicePreferencesRuntimeFromPlan(execute.runtimePlan);
    console.log(entry.orch.loadedLogMessage, execute.prefs);
}

function applyLoadVoicePreferencesDefaultsFromPlan(entry) {
    const defaults = entry.defaults;
    if (!defaults || !defaults.shouldApply) return;

    const toggleButton = document.getElementById(defaults.domPlan.labeledToggle.id);
    if (toggleButton) {
        _toggleUI().applyLabeledToggleButton(toggleButton, defaults.domPlan.labeledToggle.enabled);
        if (defaults.setAnnouncementsEnabledFromToggle) {
            voiceAnnouncementsEnabled = defaults.domPlan.labeledToggle.enabled;
        }
    }
    console.log(entry.orch.defaultsLogMessage);
}

/**
 * loadVoicePreferences function
 * @function loadVoicePreferences
 * @returns {*} Return value description
 */
function loadVoicePreferences() {
    const VA = _voiceAnnouncements();
    const orch = VA.buildLoadVoicePreferencesOrchestrationPlan();
    try {
        const saved = localStorage.getItem(orch.storageKey);
        if (saved) {
            const prefs = JSON.parse(saved);
            applyLoadVoicePreferencesSavedFromPlan(
                VA.buildLoadVoicePreferencesSavedEntryOrchestrationPlan(prefs)
            );
            return;
        }

        applyLoadVoicePreferencesDefaultsFromPlan(
            VA.buildLoadVoicePreferencesDefaultsEntryOrchestrationPlan()
        );
    } catch (e) {
        console.log(orch.errorLogPrefix, e);
    }
}


function applyToggleVoiceAnnouncementsFromPlan(execute, button) {
    if (!execute || !execute.shouldApply || !button) return;

    _toggleUI().applyLabeledToggleButton(button, execute.toggle.enabled);
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (execute.updateRuntimeFlag) voiceAnnouncementsEnabled = execute.enabled;
    if (execute.saveVoicePreferences) saveVoicePreferences();
    showStatus(execute.statusMessage, execute.statusType);
    if (execute.saveAllSettings) saveAllSettings();
}

/**
 * toggleVoiceAnnouncements function
 * @function toggleVoiceAnnouncements
 * @returns {*} Return value description
 */
function toggleVoiceAnnouncements() {
    const VA = _voiceAnnouncements();
    const button = document.getElementById(VA.VOICE_PREFS_ELEMENT_IDS.announcementsEnabled);
    if (!button) return;

    applyToggleVoiceAnnouncementsFromPlan(
        VA.buildToggleVoiceAnnouncementsEntryOrchestrationPlan(
            button.classList.contains('active')
        ).execute,
        button
    );
}

// ===== FORM CLEAR ORCHESTRATION =====
// Orchestration lives in static/js/app/form-clear-orchestration.js (bound at file end).

function getFormClearOrchestrationRuntime() {
    return {
        getMap: () => map,
        getStartMarker: () => startMarker,
        getEndMarker: () => endMarker,
        getRouteLayer: () => routeLayer,
        getZoomAnimationDurationMs: () => ZOOM_ANIMATION_DURATION * 1000,
        setLastZoomLevel: (val) => { lastZoomLevel = val; },
        call: {
            clearParkingSelection,
            updateAutoGpsLocation,
        },
    };
}

function clearForm() {
    VoyagrFormClearOrchestration.clearForm();
    document.getElementById('tripInfo').classList.remove('show');
    const alongRouteBtn = document.getElementById('alongRouteSearch');
    if (alongRouteBtn) alongRouteBtn.style.display = 'none';
    hideRoadNameBar();
    clearPOIMarkers();
}

// ===== SEARCH & FAVORITES ORCHESTRATION =====
// Orchestration lives in static/js/app/search-favorites-orchestration.js (bound at file end).

function getSearchFavoritesOrchestrationRuntime() {
    return {
        favorites: () => _favorites(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        call: {
            showStatus,
            getSupabaseAccessToken,
            fetchJsonWithAuth,
            escapeHtml,
            recordRecentDestination,
            expandBottomSheet,
        },
    };
}

function addToSearchHistory(query, resultName, lat, lon) {
    VoyagrSearchFavoritesOrchestration.addToSearchHistory(query, resultName, lat, lon);
}
function loadFavorites() {
    VoyagrSearchFavoritesOrchestration.loadFavorites();
}
function editFavorite(fav) {
    VoyagrSearchFavoritesOrchestration.editFavorite(fav);
}
function deleteFavorite(fav) {
    VoyagrSearchFavoritesOrchestration.deleteFavorite(fav);
}
function addCurrentToFavorites() {
    VoyagrSearchFavoritesOrchestration.addCurrentToFavorites();
}

// ===== PHASE 2 FEATURES: LANE GUIDANCE =====
// Orchestration lives in static/js/app/lane-guidance-orchestration.js (bound at file end).

function getLaneGuidanceOrchestrationRuntime() {
    return {
        laneGuidance: () => _laneGuidance(),
        getVoiceAnnouncementsEnabled: () => voiceAnnouncementsEnabled,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getRoutePolyline: () => routePolyline,
        call: {
            calculateDistanceMeters,
            getCurrentRoadType,
            speakMessage,
        },
    };
}

function updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount) {
    return VoyagrLaneGuidanceOrchestration.updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount);
}

function renderLaneGuidanceUI(data) {
    return VoyagrLaneGuidanceOrchestration.renderLaneGuidanceUI(data);
}

// ===== GPS SPEED WIDGET =====

// Speed widget variables - default to enabled
let speedWidgetEnabled = localStorage.getItem('speedWidgetEnabled') !== 'false';  // Default true
let currentSpeedMph = 0;

// GPS speed tracking
let currentGpsSpeedMph = 0;
let currentGpsSpeedKmh = 0;
let currentSpeedLimitMph = null;
let lastDetectedRoadType = null;
let lastSpeedLimitRegion = 'uk';
let _lastActiveManeuverIdx = -1;
let _smoothedSpeedMph = 0;
let _smoothedSpeedInitAt = 0;
let _lastGoodRawPickMph = 0;
let _consecutiveDisplacementMoves = 0;

/** Unit-tested speed/GPS helpers (modules/navigation/speed-gps.js). */
function _speedGps() { return VoyagrModules.speedGps(); }

/** Unit-tested hazard alert helpers (modules/navigation/hazard-alerts.js). */
function _hazardAlerts() { return VoyagrModules.hazardAlerts(); }

/** Unit-tested offline/resume navigation banner helpers (modules/navigation/offline-navigation.js). */
function _offlineNavigation() { return VoyagrModules.offlineNavigation(); }

/** Unit-tested ML prediction list HTML (modules/navigation/ml-predictions.js). */
function _mlPredictions() { return VoyagrModules.mlPredictions(); }

/** Unit-tested Porcupine wake-word UI plans (modules/navigation/porcupine-wake.js). */
function _porcupineWake() { return VoyagrModules.porcupineWake(); }

/** Unit-tested battery-saving mode plans (modules/navigation/battery-saving.js). */
function _batterySaving() { return VoyagrModules.batterySaving(); }

/** Unit-tested search autocomplete row HTML (modules/navigation/search-autocomplete.js). */
function _searchAutocomplete() { return VoyagrModules.searchAutocomplete(); }

/** Unit-tested device environment hint copy and banner HTML (modules/ui/device-environment.js). */
function _deviceEnvironment() { return VoyagrModules.deviceEnvironment(); }

/** Unit-tested route calculation progress bar HTML (modules/navigation/route-progress.js). */
function _routeProgress() { return VoyagrModules.routeProgress(); }
function _settingsSnapshot() { return VoyagrModules.settingsSnapshot(); }
function _appState() { return VoyagrModules.appState(); }
function _gestureControl() { return VoyagrModules.gestureControl(); }
function _legacyPrefsRestore() { return VoyagrModules.legacyPrefsRestore(); }
function _voiceControl() { return VoyagrModules.voiceControl(); }
function _smartZoom() { return VoyagrModules.smartZoom(); }
function _phase3Features() { return VoyagrModules.phase3Features(); }

/** Unit-tested map preview marker HTML (modules/map/preview-marker.js). */
function _previewMarker() { return VoyagrModules.previewMarker(); }

/** Unit-tested favorites list HTML (modules/navigation/favorites.js). */
function _favorites() { return VoyagrModules.favorites(); }

/** Unit-tested road name bar throttle/display helpers (modules/navigation/road-name-display.js). */
function _roadNameDisplay() { return VoyagrModules.roadNameDisplay(); }
function _roadReport() { return VoyagrModules.roadReport(); }

/** Unit-tested CAZ zones settings panel HTML (modules/navigation/caz-info.js). */
function _cazInfo() { return VoyagrModules.cazInfo(); }

/** Unit-tested vehicle marker SVG/popup HTML (modules/map/vehicle-marker.js). */
function _vehicleMarker() { return VoyagrModules.vehicleMarker(); }

/** Unit-tested OSM map layer marker HTML (modules/map/osm-map-icons.js). */
function _osmMapIcons() { return VoyagrModules.osmMapIcons(); }

/** Unit-tested navigation map control icons (modules/map/map-controls.js). */
function _mapControls() { return VoyagrModules.mapControls(); }
function _mapLayerToggles() { return VoyagrModules.mapLayerToggles(); }
function _mapOverlayToggles() { return VoyagrModules.mapOverlayToggles(); }
function _mapView3D() { return VoyagrModules.mapView3D(); }
function _mapTheme() { return VoyagrModules.mapTheme(); }

/** Unit-tested route geometry helpers (modules/navigation/route-geometry.js). */
function _routeGeometry() { return VoyagrModules.routeGeometry(); }

/** Unit-tested ETA helpers (modules/navigation/eta.js). */
function _eta() { return VoyagrModules.eta(); }
function _liveDataRefresh() { return VoyagrModules.liveDataRefresh(); }

/** Unit-tested turn-by-turn instruction helpers (modules/navigation/turn-instructions.js). */
function _turnInstructions() { return VoyagrModules.turnInstructions(); }

/** Unit-tested voice announcement helpers (modules/navigation/voice-announcements.js). */
function _voiceAnnouncements() { return VoyagrModules.voiceAnnouncements(); }

/** Unit-tested route selection and comparison helpers (modules/navigation/route-selection.js). */
function _routeSelection() { return VoyagrModules.routeSelection(); }

/** Unit-tested camera pitch / follow-padding helpers (modules/navigation/camera-pitch.js). */
function _cameraPitch() { return VoyagrModules.cameraPitch(); }

/** Unit-tested reroute decision helpers (modules/navigation/reroute-decision.js). */
function _rerouteDecision() { return VoyagrModules.rerouteDecision(); }

/** Unit-tested movement-detection helpers (modules/navigation/movement-detection.js). */
function _movementDetection() { return VoyagrModules.movementDetection(); }

/** Unit-tested DOM event helpers (modules/ui/dom-helpers.js). */
function _domHelpers() { return VoyagrModules.domHelpers(); }

/** Unit-tested geocoding / location parse helpers (modules/navigation/geocoding-locations.js). */
function _geocodingLocations() { return VoyagrModules.geocodingLocations(); }
function _googlePlusCodesPrefs() { return VoyagrModules.googlePlusCodesPrefs(); }

/** Unit-tested units / currency / temperature helpers (modules/navigation/units.js). */
function _units() { return VoyagrModules.units(); }

/** Unit-tested route preference helpers (modules/navigation/route-prefs.js). */
function _routePrefs() { return VoyagrModules.routePrefs(); }

/** Unit-tested trip history helpers (modules/navigation/trip-history.js). */
function _tripHistory() { return VoyagrModules.tripHistory(); }

/** Unit-tested toggle button UI helpers (modules/ui/toggle-ui.js). */
function _toggleUI() { return VoyagrModules.toggleUI(); }

/** Unit-tested theme helpers (modules/ui/theme.js). */
function _theme() { return VoyagrModules.theme(); }

/** Unit-tested HTML escape helper (modules/html.js). */
function _html() { return VoyagrModules.html(); }
function escapeHtml(s) {
    return _html().escapeHtml(s);
}

/** Unit-tested polyline encode/decode (modules/navigation/polyline-codec.js). */
function _polylineCodec() { return VoyagrModules.polylineCodec(); }

/** Unit-tested waypoints / multidrop helpers (modules/navigation/waypoints.js). */
function _waypoints() { return VoyagrModules.waypoints(); }

/** Unit-tested recent-destinations storage (modules/navigation/recent-destinations.js). */
function _recentDestinations() { return VoyagrModules.recentDestinations(); }

/** Unit-tested route traffic flow sampling (modules/navigation/route-traffic-flow.js). */
function _routeTrafficFlow() { return VoyagrModules.routeTrafficFlow(); }

/** Unit-tested traffic-change reroute helpers (modules/navigation/traffic-change.js). */
function _trafficChange() { return VoyagrModules.trafficChange(); }

/** Unit-tested route sharing helpers (modules/navigation/route-sharing.js). */
function _routeSharing() { return VoyagrModules.routeSharing(); }

/** Unit-tested weather map layer helpers (modules/map/weather-layer.js). */
function _weatherLayer() { return VoyagrModules.weatherLayer(); }

/** Unit-tested navigation destination resolution (modules/navigation/navigation-destination.js). */
function _navigationDestination() { return VoyagrModules.navigationDestination(); }

/** Unit-tested multimodal parking helpers (modules/navigation/multimodal-parking.js). */
function _multimodalParking() { return VoyagrModules.multimodalParking(); }

/** Unit-tested lane guidance helpers (modules/navigation/lane-guidance.js). */
function _laneGuidance() { return VoyagrModules.laneGuidance(); }

/** Unit-tested POI search helpers (modules/navigation/poi-search.js). */
function _poiSearch() { return VoyagrModules.poiSearch(); }

/** Unit-tested routing request builders (modules/navigation/routing-request.js). */
function _routingRequest() { return VoyagrModules.routingRequest(); }

function applyZoomFollowButtonUi(btn, enabled) {
    const plan = _mapControls().buildZoomFollowButtonUiExecutePlan(enabled);
    if (!btn || !plan.shouldApply) return;
    btn.classList.toggle('active', plan.active);
    btn.style.background = plan.background;
    btn.innerHTML = plan.innerHtml;
}

function applyJourneyOverviewButtonUi(btn, overviewActive) {
    const plan = _mapControls().buildJourneyOverviewButtonUiExecutePlan(overviewActive);
    if (!btn || !plan.shouldApply) return;
    btn.style.background = plan.background;
    btn.innerHTML = plan.innerHtml;
    btn.title = plan.title;
}

/** Unit-tested camera map marker HTML (modules/map/camera-map-markers.js). */
function _cameraMapMarkers() { return VoyagrModules.cameraMapMarkers(); }

/** Unit-tested route hazard map marker HTML (modules/map/hazard-map-markers.js). */
function _hazardMapMarkers() { return VoyagrModules.hazardMapMarkers(); }

/** Unit-tested PWA install banner HTML (modules/ui/pwa-install.js). */
function _pwaInstall() { return VoyagrModules.pwaInstall(); }

/** Unit-tested best-time-to-leave panel HTML (modules/navigation/best-time-leave.js). */
function _bestTimeLeave() { return VoyagrModules.bestTimeLeave(); }

/** Unit-tested speed-limit widget helpers (modules/navigation/speed-limit-widget.js). */
function _speedLimitWidget() { return VoyagrModules.speedLimitWidget(); }

// ===== SPEED WIDGET ORCHESTRATION =====
// Orchestration lives in static/js/app/speed-widget-orchestration.js (bound at file end).

function getSpeedWidgetOrchestrationRuntime() {
    return {
        speedGps: () => _speedGps(),
        speedLimitWidget: () => _speedLimitWidget(),
        routeGeometry: () => _routeGeometry(),
        toggleUI: () => _toggleUI(),
        getSpeedUnit: () => speedUnit,
        getIsTrackingActive: () => isTrackingActive,
        getRouteInProgress: () => routeInProgress,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getIsOffline: () => VoyagrOfflineNavigationOrchestration.getIsOffline(),
        g: (key) => {
            switch (key) {
            case 'speedWidgetEnabled': return speedWidgetEnabled;
            case 'currentGpsSpeedMph': return currentGpsSpeedMph;
            case 'currentGpsSpeedKmh': return currentGpsSpeedKmh;
            case 'currentSpeedLimitMph': return currentSpeedLimitMph;
            case 'lastDetectedRoadType': return lastDetectedRoadType;
            case 'lastSpeedLimitRegion': return lastSpeedLimitRegion;
            case '_smoothedSpeedMph': return _smoothedSpeedMph;
            case '_smoothedSpeedInitAt': return _smoothedSpeedInitAt;
            default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'speedWidgetEnabled': speedWidgetEnabled = val; break;
            case 'currentGpsSpeedMph': currentGpsSpeedMph = val; break;
            case 'currentGpsSpeedKmh': currentGpsSpeedKmh = val; break;
            case 'currentSpeedLimitMph': currentSpeedLimitMph = val; break;
            case 'lastDetectedRoadType': lastDetectedRoadType = val; break;
            case 'lastSpeedLimitRegion': lastSpeedLimitRegion = val; break;
            case '_smoothedSpeedMph': _smoothedSpeedMph = val; break;
            case '_smoothedSpeedInitAt': _smoothedSpeedInitAt = val; break;
            default: break;
            }
        },
        call: {
            getSpeedUnit,
            calculateDistanceMeters,
            cacheSpeedLimit,
            getCachedSpeedLimit,
            saveAllSettings,
        },
    };
}

function smoothGpsSpeedMph(rawMph) { return VoyagrSpeedWidgetOrchestration.smoothGpsSpeedMph(rawMph); }
function updateSpeedWidget(currentSpeedInMph, speedLimitInMph) {
    return VoyagrSpeedWidgetOrchestration.updateSpeedWidget(currentSpeedInMph, speedLimitInMph);
}
function updateSpeedWidgetVisibility() { VoyagrSpeedWidgetOrchestration.updateSpeedWidgetVisibility(); }
function getCurrentRoadType(maneuverIdxOverride, gpsSpeedMph) {
    return VoyagrSpeedWidgetOrchestration.getCurrentRoadType(maneuverIdxOverride, gpsSpeedMph);
}
function getManeuverStreetLabel(maneuver, preferCurrentRoad) {
    return VoyagrSpeedWidgetOrchestration.getManeuverStreetLabel(maneuver, preferCurrentRoad);
}
function normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph) {
    return VoyagrSpeedWidgetOrchestration.normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph);
}
function applySpeedLimitFetchOutcomeFromPlan(outcomeApply) {
    VoyagrSpeedWidgetOrchestration.applySpeedLimitFetchOutcomeFromPlan(outcomeApply);
}
function fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType, valhallaSpeedLimit, headingDeg) {
    return VoyagrSpeedWidgetOrchestration.fetchSpeedLimitThrottled(
        lat, lon, currentSpeedMph, roadType, valhallaSpeedLimit, headingDeg
    );
}
function applySpeedWidgetToggleUi() { VoyagrSpeedWidgetOrchestration.applySpeedWidgetToggleUi(); }
function toggleSpeedWidget() { VoyagrSpeedWidgetOrchestration.toggleSpeedWidget(); }
function toggleZoomAndFollow() {
    const MC = _mapControls();
    const orch = MC.buildToggleZoomAndFollowOrchestrationPlan({
        currentEnabled: zoomAndFollowEnabled,
    });
    zoomAndFollowEnabled = orch.nextEnabled;
    applyZoomFollowButtonUi(document.getElementById(orch.toggleButtonId), zoomAndFollowEnabled);
    localStorage.setItem(orch.storageKey, orch.storageValue);

    if (orch.action === 'enable') {
        const execute = MC.buildToggleZoomAndFollowEnabledExecutePlan({
            hasMap: !!map,
            currentLat,
            currentLon,
        });
        mapFollowingActive = execute.mapFollowingActive;
        showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage);
        if (execute.flyTo) {
            map.flyTo(execute.flyTo);
        }
    } else {
        const execute = MC.buildToggleZoomAndFollowDisabledExecutePlan();
        mapFollowingActive = execute.mapFollowingActive;
        showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage);
    }

    if (orch.updateRecenterVisibility) {
        updateRecenterButtonVisibility();
    }
}

/**
 * Snap GPS position to the active route polyline when navigation is in progress.
 * @param {number} lat
 * @param {number} lon
 * @returns {Object|null}
 */
function resolveGpsRouteSnapForTick(lat, lon) {
    const RG = _routeGeometry();
    const plan = RG.buildGpsRouteSnapTickPlan({
        lat,
        lon,
        routeInProgress,
        routePolyline,
        lastSnappedRouteIndex,
    });
    return plan.snapped;
}

/** Lat/lon for the vehicle icon (snapped to route during navigation). */
function getVehicleDisplayCoordinates() {
    const SG = _speedGps();
    return SG.buildVehicleDisplayCoordinatesPlan({
        lat: currentLat,
        lon: currentLon,
        routeInProgress,
        routePolyline,
        snapped: resolveGpsRouteSnapForTick(currentLat, currentLon),
        lastSnappedRouteIndex,
        prevSnapBlendWeightState: _snapBlendWeightState,
        smoothDisplayLat: _smoothDisplayLat,
        smoothDisplayLon: _smoothDisplayLon,
        useSmoothCoordsOnly: _smoothDisplayLat != null && _smoothDisplayLon != null,
        calculateBearing: (a, b, c, d) => _routeGeometry().bearing(a, b, c, d),
        blendHeadingsCircular: _routeGeometry().blendHeadingsCircular,
    });
}

function metersMapCenterFromVehicle() {
    if (!map || currentLat == null || currentLon == null) return 0;
    const center = map.getCenter();
    const vehicle = getVehicleDisplayCoordinates();
    return calculateDistanceMeters(vehicle.lat, vehicle.lon, center.lat, center.lng);
}

function shouldShowRecenterVehicleButton() {
    const MC = _mapControls();
    const plan = MC.buildShouldShowRecenterVehicleButtonPlan({
        hasMap: !!map,
        currentLat,
        currentLon,
        routeInProgress,
        isTrackingActive,
        journeyOverviewActive,
        zoomAndFollowEnabled,
        mapFollowingActive,
        distanceFromCenterM: metersMapCenterFromVehicle(),
        minDistanceM: MC.RECENTER_MIN_DISTANCE_M,
    });
    return plan.shouldShow;
}

function applyRecenterButtonVisibilityFromPlan(execute) {
    if (!execute || !execute.shouldUpdate) return;
    const btn = document.getElementById(execute.buttonId);
    if (btn) btn.style.display = execute.display;
}

function updateRecenterButtonVisibility() {
    applyRecenterButtonVisibilityFromPlan(
        _mapControls().buildRecenterButtonVisibilityExecutePlan(shouldShowRecenterVehicleButton())
    );
}

function recenterOnVehicle() {
    const MC = _mapControls();
    const { lat, lon } = getVehicleDisplayCoordinates();
    const preflight = MC.buildRecenterOnVehiclePreflightPlan({
        hasMap: !!map,
        currentLat,
        currentLon,
        displayLat: lat,
        displayLon: lon,
        journeyOverviewActive,
        routeInProgress,
    });
    if (!preflight.shouldRecenter) {
        showStatus(preflight.statusMessage, preflight.statusType);
        return;
    }

    if (preflight.exitJourneyOverview) {
        const exit = MC.buildRecenterJourneyOverviewExitPlan();
        journeyOverviewActive = exit.journeyOverviewActive;
        applyJourneyOverviewButtonUi(document.getElementById(exit.journeyBtnId), false);
        if (exit.clearSavedMapState) savedMapState = null;
    }

    if (preflight.routeInProgress) {
        mapFollowingActive = true;
        const speedMps = currentUserMarker && Number.isFinite(currentUserMarker.speed)
            ? currentUserMarker.speed
            : 0;
        const speedMph = speedMps * 2.23694;
        const followInput = MC.buildRecenterNavigationFollowInputPlan({
            lat,
            lon,
            speedMph,
            roadType: getCurrentRoadType(undefined, speedMph),
            heading: (currentUserMarker && Number.isFinite(currentUserMarker.heading))
                ? currentUserMarker.heading
                : map.getBearing(),
            mapBearing: map.getBearing(),
            shouldTilt: shouldTiltDrivingCamera(),
            usePitchedDrivingCamera: shouldUsePitchedDrivingCamera(),
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
        });
        const followCamera = _cameraPitch().buildNavigationFollowCameraPlan(
            Object.assign({}, followInput, {
                computeSmartZoom: (spd, dist, rt) => _routeGeometry().calculateSmartZoom(
                    spd, dist, rt, ZOOM_LEVELS, TURN_ZOOM_THRESHOLD
                ),
            })
        );
        const complete = MC.buildRecenterNavigationCompletePlan();

        if (complete.setLastFollowCenterGeo) {
            window.__voyagrLastFollowCenterGeo = { lat, lon };
        }
        if (complete.setLastFollowEaseAt) {
            window.__voyagrLastFollowEaseAt = Date.now();
        }
        if (followCamera.easeTo) {
            map.easeTo(followCamera.easeTo);
        }
        showStatus(complete.statusMessage, complete.statusType);
    } else {
        const tracking = MC.buildRecenterTrackingEasePlan({
            lat,
            lon,
            currentZoom: map.getZoom(),
        });
        mapFollowingActive = tracking.mapFollowingActive;
        map.easeTo(tracking.easeTo);
        showStatus(tracking.statusMessage, tracking.statusType);
    }

    updateRecenterButtonVisibility();
}

// Journey Overview state
let journeyOverviewActive = false;
let savedMapState = null;

/**
 * Toggle journey overview mode during navigation
 * Shows entire route zoomed out, then returns to following view
 */
function toggleJourneyOverview() {
    const MC = _mapControls();
    const preflight = MC.buildToggleJourneyOverviewPreflightPlan({
        routeInProgress,
        routePolylineLength: routePolyline ? routePolyline.length : 0,
        journeyOverviewActive,
    });
    if (!preflight.shouldToggle) {
        showStatus(preflight.statusMessage, preflight.statusType);
        return;
    }

    const btn = document.getElementById(preflight.journeyBtnId);

    if (!preflight.currentlyActive) {
        const activate = MC.buildToggleJourneyOverviewActivatePlan({
            mapCenter: map.getCenter(),
            mapZoom: map.getZoom(),
            useMultiRouteCoords: VoyagrRouteComparisonOrchestration.getAllRouteLayers().length > 0
                && routeOptions
                && routeOptions[0]
                && routeOptions[0].polyline,
            allRouteCoords: (routeOptions || []).flatMap((r) => r.polyline || []),
            routePolylineLength: routePolyline.length,
            routePolyline,
        });

        savedMapState = activate.saveMapState;
        mapFollowingActive = activate.mapFollowingActive;
        if (activate.fitBounds) {
            MapLibreHelpers.fitMapBounds(
                map,
                activate.fitBounds.coords,
                { padding: activate.fitBounds.padding }
            );
        }
        journeyOverviewActive = activate.journeyOverviewActive;
        applyJourneyOverviewButtonUi(btn, activate.overviewButtonActive);
        showStatus(activate.statusMessage, activate.statusType);
        console.log(activate.logMessage);
        if (activate.updateRecenterVisibility) updateRecenterButtonVisibility();
        return;
    }

    const deactivate = MC.buildToggleJourneyOverviewDeactivatePlan({
        zoomAndFollowEnabled,
        savedMapState,
    });
    journeyOverviewActive = deactivate.journeyOverviewActive;
    if (deactivate.restoreMapFollowing) {
        mapFollowingActive = true;
    }
    if (deactivate.flyTo) {
        map.flyTo(deactivate.flyTo);
    }
    if (deactivate.clearSavedMapState) {
        savedMapState = null;
    }
    applyJourneyOverviewButtonUi(btn, deactivate.overviewButtonActive);
    showStatus(deactivate.statusMessage, deactivate.statusType);
    console.log(deactivate.logMessage);
    if (deactivate.updateRecenterVisibility) updateRecenterButtonVisibility();
}

// ===== DISTANCE CALCULATION & TURN DETECTION =====
/**
 * Calculate distance between two coordinates in meters (Haversine formula).
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    return _routeGeometry().haversineDistanceMeters(lat1, lon1, lat2, lon2);
}

/**
 * Distance along the polyline from a snapped point (snapped onto segment i0) to
 * a target vertex, forward along the line only.
 * @param {Array} routePolyline - [lat, lon] polyline
 * @param {Object} snap - Result of snapToRoutePolyline (index, t, …)
 * @param {number} targetVertexIndex - Maneuver begin_shape_index (clamped to polyline)
 * @returns {number} Meters, >= 0
 */

/**
 * Map a Valhalla maneuver type to a turn-by-turn direction key, or null when it is not
 * an announceable maneuver (start / continue / straight / ramp-straight / stay-straight).
 * Shared by the advance "Then" maneuver (widget + voice). Kept in sync with the inline
 * mappings in detectUpcomingTurn / updateTurnWidgetFromPosition.
 */
function refineManeuverDirectionForRoute(type, direction, maneuver) {
    return VoyagrTurnInstructionWidgetOrchestration.refineManeuverDirectionForRoute(type, direction, maneuver);
}

function getFollowingManeuver(currentIndex) {
    return VoyagrTurnInstructionWidgetOrchestration.getFollowingManeuver(currentIndex);
}

function effectiveRoundaboutExitCount(stepIndex) {
    return VoyagrTurnInstructionWidgetOrchestration.effectiveRoundaboutExitCount(stepIndex);
}

// ordinalEnglishExit / laneOrdinalEnglish / buildTurnLaneHintHtml live in
// modules/navigation/turn-instructions.js — call _turnInstructions() directly.

function buildTurnDisplayInstruction(turnInfo) {
    return VoyagrTurnInstructionWidgetOrchestration.buildTurnDisplayInstruction(turnInfo);
}

function detectUpcomingTurn(userLat, userLon) {
    return VoyagrTurnInstructionWidgetOrchestration.detectUpcomingTurn(userLat, userLon);
}

// ===== VEHICLE ROUTING ORCHESTRATION =====
// Orchestration lives in static/js/app/vehicle-routing-orchestration.js (bound at file end).

function getVehicleRoutingOrchestrationRuntime() {
    return {
        getVehicleIcons: () => vehicleIcons,
        getVehicleIconEmojis: () => vehicleIconEmojis,
        getCurrentVehicleType: () => currentVehicleType,
        setCurrentVehicleType: (val) => { currentVehicleType = val; },
        getCurrentRoutingMode: () => currentRoutingMode,
        setCurrentRoutingMode: (val) => { currentRoutingMode = val; },
        getCurrentUserMarker: () => currentUserMarker,
        setCurrentUserMarker: (val) => { currentUserMarker = val; },
        setCurrentUserMarkerIcon: (val) => { currentUserMarkerIcon = val; },
        getMap: () => map,
        vehicleMarker: () => _vehicleMarker(),
        getMapLibreHelpers: () => MapLibreHelpers,
        call: {
            saveAllSettings,
            showStatus,
            convertSpeed,
            getSpeedUnit,
        },
    };
}

function updateVehicleType() { VoyagrVehicleRoutingOrchestration.updateVehicleType(); }
function setRoutingMode(mode) { VoyagrVehicleRoutingOrchestration.setRoutingMode(mode); }
function createVehicleMarker(lat, lon, speed, accuracy, heading = 0) {
    return VoyagrVehicleRoutingOrchestration.createVehicleMarker(lat, lon, speed, accuracy, heading);
}

// ===== SMART ZOOM ORCHESTRATION =====
// Orchestration lives in static/js/app/smart-zoom-orchestration.js (bound at file end).

function getSmartZoomOrchestrationRuntime() {
    return {
        smartZoom: () => _smartZoom(),
        toggleUI: () => _toggleUI(),
        cameraPitch: () => _cameraPitch(),
        routeGeometry: () => _routeGeometry(),
        getSmartZoomEnabled: () => smartZoomEnabled,
        setSmartZoomEnabled: (val) => { smartZoomEnabled = val; },
        getRouteInProgress: () => routeInProgress,
        getLastZoomLevel: () => lastZoomLevel,
        setLastZoomLevel: (val) => { lastZoomLevel = val; },
        getLastTurnZoomApplied: () => lastTurnZoomApplied,
        setLastTurnZoomApplied: (val) => { lastTurnZoomApplied = val; },
        getZoomLevels: () => ZOOM_LEVELS,
        getTurnZoomThreshold: () => TURN_ZOOM_THRESHOLD,
        getZoomAnimationDurationMs: () => ZOOM_ANIMATION_DURATION * 1000,
        getMap: () => map,
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        getMapFollowingActive: () => mapFollowingActive,
        getCurrentUserMarker: () => currentUserMarker,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        call: {
            saveAllSettings,
            showStatus,
            shouldUsePitchedDrivingCamera,
            shouldTiltDrivingCamera,
        },
    };
}

function toggleSmartZoom() { VoyagrSmartZoomOrchestration.toggleSmartZoom(); }
function applySmartZoomWithAnimation(speedMph, distanceToNextTurn = null, roadType = 'urban', userLat = null, userLon = null) {
    return VoyagrSmartZoomOrchestration.applySmartZoomWithAnimation(speedMph, distanceToNextTurn, roadType, userLat, userLon);
}
function applySmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
    return VoyagrSmartZoomOrchestration.applySmartZoom(speedMph, distanceToNextTurn, roadType);
}

// Initialize Phase 2 features on page load
window.addEventListener('load', () => {
    loadFavorites();
    initPhase3Features();
});

// ===== PHASE 3 FEATURES ORCHESTRATION =====
// Orchestration lives in static/js/app/phase3-features-orchestration.js (bound at file end).

function getPhase3FeaturesOrchestrationRuntime() {
    return {
        phase3Features: () => _phase3Features(),
        gestureControl: () => _gestureControl(),
        mapControls: () => _mapControls(),
        toggleUI: () => _toggleUI(),
        setGestureEnabled: (val) => VoyagrGestureControlOrchestration.setGestureEnabled(val),
        setGestureSensitivity: (val) => VoyagrGestureControlOrchestration.setGestureSensitivity(val),
        setGestureAction: (val) => VoyagrGestureControlOrchestration.setGestureAction(val),
        setIsAREnabled: (val) => { isAREnabled = val; },
        call: {
            updateBatteryStatus,
            loadMLPredictions,
            handleDeviceMotion,
        },
    };
}

function initPhase3Features() {
    VoyagrPhase3FeaturesOrchestration.initPhase3Features();
}

// ===== GESTURE CONTROL ORCHESTRATION =====
// Orchestration lives in static/js/app/gesture-control-orchestration.js (bound at file end).

function getGestureControlOrchestrationRuntime() {
    return {
        gestureControl: () => _gestureControl(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
            calculateRoute,
            clearForm,
        },
    };
}

function handleDeviceMotion(event) { VoyagrGestureControlOrchestration.handleDeviceMotion(event); }
function triggerGestureAction() { VoyagrGestureControlOrchestration.triggerGestureAction(); }
function toggleGestureControl() { VoyagrGestureControlOrchestration.toggleGestureControl(); }
function updateGestureSensitivity() { VoyagrGestureControlOrchestration.updateGestureSensitivity(); }
function updateGestureAction() { VoyagrGestureControlOrchestration.updateGestureAction(); }

// ===== BATTERY SAVING ORCHESTRATION =====
// Orchestration lives in static/js/app/battery-saving-orchestration.js (bound at file end).

function getBatterySavingOrchestrationRuntime() {
    return {
        batterySaving: () => _batterySaving(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
        },
    };
}

function updateBatteryStatus(battery) { VoyagrBatterySavingOrchestration.updateBatteryStatus(battery); }
function applyBatterySavingModeFromPlan(execute) {
    VoyagrBatterySavingOrchestration.applyBatterySavingModeFromPlan(execute);
}
function toggleBatterySavingMode() { VoyagrBatterySavingOrchestration.toggleBatterySavingMode(); }
function enableBatterySavingMode() { VoyagrBatterySavingOrchestration.enableBatterySavingMode(); }
function disableBatterySavingMode() { VoyagrBatterySavingOrchestration.disableBatterySavingMode(); }

// ===== MAP THEME ORCHESTRATION =====
// Orchestration lives in static/js/app/map-theme-orchestration.js (bound at file end).

function getMapThemeOrchestrationRuntime() {
    return {
        mapTheme: () => _mapTheme(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getBuildings3DEnabled: () => buildings3DEnabled,
        getBuildings3DHeightMultiplier: () => buildings3DHeightMultiplier,
        getBuildings3DOpacity: () => buildings3DOpacity,
        call: {
            showStatus,
            saveAllSettings,
            initializeRoadLabels,
        },
    };
}

function setMapTheme(themeOrEvent) { VoyagrMapThemeOrchestration.setMapTheme(themeOrEvent); }

// ===== ML PREDICTIONS ORCHESTRATION =====
// Orchestration lives in static/js/app/ml-predictions-orchestration.js (bound at file end).

function getMlPredictionsOrchestrationRuntime() {
    return {
        mlPredictions: () => _mlPredictions(),
        toggleUI: () => _toggleUI(),
        call: {
            calculateRoute,
            showStatus,
            saveAllSettings,
        },
    };
}

function loadMLPredictions() { VoyagrMlPredictionsOrchestration.loadMLPredictions(); }
function toggleMLPredictions() { VoyagrMlPredictionsOrchestration.toggleMLPredictions(); }

// ===== MAP HINTS ORCHESTRATION =====
// Orchestration lives in static/js/app/map-hints-orchestration.js (bound at file end).

function getMapHintsOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        call: {
            syncBottomSheetOverlapFabs,
        },
    };
}

function updateRoadReportFabVisibility() {
    VoyagrMapHintsOrchestration.updateRoadReportFabVisibility();
}
function voyagrTouchHintsEnabled() {
    return VoyagrMapHintsOrchestration.voyagrTouchHintsEnabled();
}
function voyagrShowMapIconHint(message) {
    VoyagrMapHintsOrchestration.voyagrShowMapIconHint(message);
}
function openMapControlsHintModal() {
    VoyagrMapHintsOrchestration.openMapControlsHintModal();
}
function closeMapControlsHintModal() {
    VoyagrMapHintsOrchestration.closeMapControlsHintModal();
}
function initMobileMapIconHints() {
    VoyagrMapHintsOrchestration.initMobileMapIconHints();
}

// ===== ROAD REPORT ORCHESTRATION =====
// Orchestration lives in static/js/app/road-report-orchestration.js (bound at file end).

function getRoadReportOrchestrationRuntime() {
    return {
        roadReport: () => _roadReport(),
        getCurrentLat: () => (typeof currentLat !== 'undefined' ? currentLat : null),
        getCurrentLon: () => (typeof currentLon !== 'undefined' ? currentLon : null),
        call: {
            showStatus,
        },
    };
}

function openRoadReportModal() { VoyagrRoadReportOrchestration.openRoadReportModal(); }
function closeRoadReportModal() { VoyagrRoadReportOrchestration.closeRoadReportModal(); }
async function submitRoadReport() { return VoyagrRoadReportOrchestration.submitRoadReport(); }

// ===== SERVICE WORKER ORCHESTRATION =====
// Orchestration lives in static/js/app/service-worker-orchestration.js (bound at file end).

function getServiceWorkerOrchestrationRuntime() {
    return {
        pwaInstall: () => _pwaInstall(),
        getRouteInProgress: () => routeInProgress,
        getUpdatePending: () => updatePending,
        setUpdatePending: (val) => { updatePending = val; },
        call: {
            showStatus,
            saveAppState,
            scheduleAppReload,
            warmPicovoiceStaticCache,
        },
    };
}

async function safeServiceWorkerUpdate(registration, reason) {
    return VoyagrServiceWorkerOrchestration.safeServiceWorkerUpdate(registration, reason);
}

// ===== OFFLINE NAVIGATION ORCHESTRATION =====
// Orchestration lives in static/js/app/offline-navigation-orchestration.js (bound at file end).

function getOfflineNavigationOrchestrationRuntime() {
    return {
        offlineNavigation: () => _offlineNavigation(),
        speedLimitWidget: () => _speedLimitWidget(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getRoutePolyline: () => routePolyline,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        call: {
            showStatus,
            buildRoutePayloadFromPersisted,
            startTurnByTurnNavigation,
        },
    };
}

function cacheSpeedLimit(lat, lon, speedLimit, source) {
    return VoyagrOfflineNavigationOrchestration.cacheSpeedLimit(lat, lon, speedLimit, source);
}
function getCachedSpeedLimit(lat, lon) {
    return VoyagrOfflineNavigationOrchestration.getCachedSpeedLimit(lat, lon);
}
function persistActiveRoute() {
    return VoyagrOfflineNavigationOrchestration.persistActiveRoute();
}
function clearPersistedRoute() {
    return VoyagrOfflineNavigationOrchestration.clearPersistedRoute();
}
function schedulePersistRoute() {
    VoyagrOfflineNavigationOrchestration.schedulePersistRoute();
}
function precacheRouteTiles(polyline) {
    return VoyagrOfflineNavigationOrchestration.precacheRouteTiles(polyline);
}
function _tryResumeNavigation() {
    return VoyagrOfflineNavigationOrchestration.tryResumeNavigation();
}

// ===== PHASE 2: Restore app state on page load =====
window.addEventListener('load', () => {
    restoreAppState();
    void initSupabaseAuth();
    _tryResumeNavigation();
    initDeviceEnvironmentNotifications();
    // Show a volume reminder on app open (once per tab session).
    try {
        const openHint = _deviceEnvironment().buildOpenVolumeHintSchedulePlan({
            alreadyShown: sessionStorage.getItem(_deviceEnvironment().OPEN_VOLUME_HINT_SESSION_KEY) === 'true',
        });
        if (openHint.shouldSchedule) {
            sessionStorage.setItem(openHint.sessionStorageKey, openHint.sessionStorageValue);
            setTimeout(() => {
                try {
                    showVolumeHintForNavigation();
                } catch (e) {
                    console.warn(openHint.errorLogPrefix, e);
                }
            }, openHint.delayMs);
        }
    } catch (e) {
        console.warn(_deviceEnvironment().buildOpenVolumeHintSchedulePlan().scheduleErrorLogPrefix, e);
    }
});

// ===== PHASE 3: Initialize battery monitoring (bound at file end) =====

// ===== GPS TRACKING SYSTEM =====
// Variables initialized at the top level
let routeStarted = false;
let routeInProgress = false;

// ===== SCREEN WAKE LOCK (keeps screen on during navigation) =====
window.screenWakeLock = null;

// ===== TURN-BY-TURN NAVIGATION =====
let currentRouteSteps = [];
let currentStepIndex = 0;
let nextManeuverDistance = 0;
let routePolyline = null;

// ===== DRIVER'S PERSPECTIVE =====
// Preference when browsing. During turn-by-turn with zoom-and-follow, 60° is always used regardless.
let driverPerspectiveEnabled = localStorage.getItem('driverPerspectiveEnabled') === 'true';  // Default false (opt-in)

// ===== DRIVER CAMERA ORCHESTRATION =====
// Orchestration lives in static/js/app/driver-camera-orchestration.js (bound at file end).

function getDriverCameraOrchestrationRuntime() {
    return {
        cameraPitch: () => _cameraPitch(),
        mapView3D: () => _mapView3D(),
        toggleUI: () => _toggleUI(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        getMapFollowingActive: () => mapFollowingActive,
        getDriverPerspectiveEnabled: () => driverPerspectiveEnabled,
        setDriverPerspectiveEnabled: (val) => { driverPerspectiveEnabled = val; },
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getCurrentUserMarker: () => currentUserMarker,
        call: {
            showStatus,
            saveAllSettings,
            recomputeMapView3DFromGranular: _recomputeMapView3DFromGranular,
        },
    };
}

function isActiveNavigationFollow() { return VoyagrDriverCameraOrchestration.isActiveNavigationFollow(); }
function userPrefersFlat2D() { return VoyagrDriverCameraOrchestration.userPrefersFlat2D(); }
function decideDrivingCameraState() { return VoyagrDriverCameraOrchestration.decideDrivingCameraState(); }
function shouldUsePitchedDrivingCamera() { return VoyagrDriverCameraOrchestration.shouldUsePitchedDrivingCamera(); }
function shouldTiltDrivingCamera() { return VoyagrDriverCameraOrchestration.shouldTiltDrivingCamera(); }
function applyLiveNavigationCamera() { VoyagrDriverCameraOrchestration.applyLiveNavigationCamera(); }
function toggleDriverPerspective() { VoyagrDriverCameraOrchestration.toggleDriverPerspective(); }
function applyDriverPerspective() { VoyagrDriverCameraOrchestration.applyDriverPerspective(); }

// ===== 2D / 3D MAP VIEW (scene preset) =====
// One user-facing switch that bundles the existing camera-tilt + 3D-building controls:
//   3D = tilted camera (driver perspective) + 3D building extrusions
//   2D = flat camera (pitch 0) + no building extrusions
// It reuses the existing flags/functions (no separate state). The choice applies while
// browsing AND during turn-by-turn navigation: 2D navigation still follows heading-up,
// it just stays flat instead of tilting to 60° (see shouldTiltDrivingCamera()).
let mapView3DEnabled = _mapView3D().resolveMapView3DEnabledFromStorage(
    localStorage.getItem('mapView3DEnabled'),
    driverPerspectiveEnabled || buildings3DEnabled
);

// ===== MAP VIEW 3D ORCHESTRATION =====
// Orchestration lives in static/js/app/map-view-3d-orchestration.js (bound at file end).

function getMapView3DOrchestrationRuntime() {
    return {
        mapView3D: () => _mapView3D(),
        toggleUI: () => _toggleUI(),
        getMapView3DEnabled: () => mapView3DEnabled,
        setMapView3DEnabled: (val) => { mapView3DEnabled = val; },
        getDriverPerspectiveEnabled: () => driverPerspectiveEnabled,
        setDriverPerspectiveEnabled: (val) => { driverPerspectiveEnabled = val; },
        getBuildings3DEnabled: () => buildings3DEnabled,
        setBuildings3DEnabled: (val) => { buildings3DEnabled = val; },
        getBuildings3DHeightMultiplier: () => buildings3DHeightMultiplier,
        getBuildings3DOpacity: () => buildings3DOpacity,
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        call: {
            applyDriverPerspective,
            showStatus,
            saveAllSettings,
        },
    };
}

function syncMapView3DToggleUI() { VoyagrMapView3DOrchestration.syncMapView3DToggleUI(); }
function setMapView3D(enabled) { VoyagrMapView3DOrchestration.setMapView3D(enabled); }
function toggleMapView3D() { VoyagrMapView3DOrchestration.toggleMapView3D(); }
function _recomputeMapView3DFromGranular() {
    return VoyagrMapView3DOrchestration.recomputeMapView3DFromGranular();
}

// ===== AR NAVIGATION ORCHESTRATION =====
// Orchestration lives in static/js/app/ar-navigation-orchestration.js (bound at file end).

let arModeActive = false;
let isAREnabled = false;

function getArNavigationOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        toggleUI: () => _toggleUI(),
        turnInstructions: () => _turnInstructions(),
        getIsAREnabled: () => isAREnabled,
        setIsAREnabled: (val) => { isAREnabled = val; },
        getArModeActive: () => arModeActive,
        setArModeActive: (val) => { arModeActive = val; },
        getRouteInProgress: () => routeInProgress,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getNextManeuverDistance: () => nextManeuverDistance,
        call: {
            showStatus,
        },
    };
}

function toggleARSetting() { VoyagrArNavigationOrchestration.toggleARSetting(); }
function updateARButtonVisibility() { VoyagrArNavigationOrchestration.updateARButtonVisibility(); }
async function toggleARMode() { return VoyagrArNavigationOrchestration.toggleARMode(); }
async function stopARMode() { return VoyagrArNavigationOrchestration.stopARMode(); }
function updateARButtonState(status) { VoyagrArNavigationOrchestration.updateARButtonState(status); }
function updateARInstruction(turnInfo) { VoyagrArNavigationOrchestration.updateARInstruction(turnInfo); }

// ===== TURN INSTRUCTION WIDGET ORCHESTRATION =====
// Orchestration lives in static/js/app/turn-instruction-widget-orchestration.js (bound at file end).

function getTurnInstructionWidgetOrchestrationRuntime() {
    return {
        turnInstructions: () => _turnInstructions(),
        routeGeometry: () => _routeGeometry(),
        speedGps: () => _speedGps(),
        previewMarker: () => _previewMarker(),
        getDistanceUnit: () => distanceUnit,
        getRouteInProgress: () => routeInProgress,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        setCurrentStepIndex: (val) => { currentStepIndex = val; },
        getRoutePolyline: () => routePolyline,
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        getLastTurnDetectRouteVertexIndex: () => lastTurnDetectRouteVertexIndex,
        setLastTurnDetectRouteVertexIndex: (val) => { lastTurnDetectRouteVertexIndex = val; },
        getMap: () => map,
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        call: {
            detectUpcomingTurn,
            updateARInstruction,
            showStatus,
            schedulePersistRoute,
            getCurrentRoadDisplayName: () => VoyagrRoadNameOrchestration.getCurrentRoadDisplayName(),
            getManeuverStreetLabel,
        },
    };
}

function toggleInstructionsList() { VoyagrTurnInstructionWidgetOrchestration.toggleInstructionsList(); }
function showTurnInstructionWidget() { VoyagrTurnInstructionWidgetOrchestration.showTurnInstructionWidget(); }
function hideTurnInstructionWidget() { VoyagrTurnInstructionWidgetOrchestration.hideTurnInstructionWidget(); }
function updateTurnInstructionDisplay(turnInfo) {
    return VoyagrTurnInstructionWidgetOrchestration.updateTurnInstructionDisplay(turnInfo);
}
function updateThenRow(maneuverIndex, currentDistance) {
    return VoyagrTurnInstructionWidgetOrchestration.updateThenRow(maneuverIndex, currentDistance);
}
function populateInstructionsList() { VoyagrTurnInstructionWidgetOrchestration.populateInstructionsList(); }
function previewInstructionOnMap(stepIndex, shapeIndex) {
    return VoyagrTurnInstructionWidgetOrchestration.previewInstructionOnMap(stepIndex, shapeIndex);
}
function showPreviewMarker(lat, lon, label) {
    return VoyagrTurnInstructionWidgetOrchestration.showPreviewMarker(lat, lon, label);
}
function hidePreviewMarker() { VoyagrTurnInstructionWidgetOrchestration.hidePreviewMarker(); }
function updateTurnWidgetFromPosition(lat, lon, turnInfo) {
    return VoyagrTurnInstructionWidgetOrchestration.updateTurnWidgetFromPosition(lat, lon, turnInfo);
}

// ===== JOURNEY SUMMARY BAR =====
function hasUserStartedMoving() { return VoyagrJourneySummaryOrchestration.hasUserStartedMoving(); }
function showJourneySummaryBar() { VoyagrJourneySummaryOrchestration.showJourneySummaryBar(); }
function hideJourneySummaryBar() { VoyagrJourneySummaryOrchestration.hideJourneySummaryBar(); }
function startJourneySummaryUpdates() { VoyagrJourneySummaryOrchestration.startJourneySummaryUpdates(); }
function updateJourneySummaryBar() { VoyagrJourneySummaryOrchestration.updateJourneySummaryBar(); }

// ===== PWA AUTO-RELOAD SYSTEM (PHASE 2) =====
let updatePending = false;
let appStateBeforeReload = null;

// ===== BATTERY-AWARE REFRESH (PHASE 3) =====

// ===== VOICE CONTROL ORCHESTRATION =====
// Orchestration lives in static/js/app/voice-control-orchestration.js (bound at file end).

function getVoiceControlOrchestrationRuntime() {
    return {
        voiceControl: () => _voiceControl(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getRouteInProgress: () => routeInProgress,
        call: {
            maybeResumePorcupineWakeAfterVoice,
            stopPorcupineWakePipeline,
            calculateRoute,
            showStatus,
            speakMessage,
            triggerAutomaticReroute,
        },
    };
}

function initVoiceRecognition() { return VoyagrVoiceControlOrchestration.initVoiceRecognition(); }
function toggleVoiceInput() { return VoyagrVoiceControlOrchestration.toggleVoiceInput(); }
function speakText(text) { VoyagrVoiceControlOrchestration.speakText(text); }
function setupVoiceCommandProcessing() { VoyagrVoiceControlOrchestration.setupVoiceCommandProcessing(); }
function processVoiceCommand(command) { VoyagrVoiceControlOrchestration.processVoiceCommand(command); }
function handleVoiceAction(data) { VoyagrVoiceControlOrchestration.handleVoiceAction(data); }

let currentLat = 51.5074;
let currentLon = -0.1278;

// ===== VEHICLE TYPE & ROUTING MODE =====
let currentVehicleType = 'petrol_diesel';
let currentRoutingMode = 'auto';
let currentUserMarkerIcon = null;

// Vehicle icon mapping - now using custom SVG icons
const vehicleIcons = {
    'petrol_diesel': '/static/images/vehicles/car-aerial.svg',
    'electric': '/static/images/vehicles/electric-aerial.svg',
    'motorcycle': '/static/images/vehicles/motorcycle-aerial.svg',
    'truck': '/static/images/vehicles/truck-aerial.svg',
    'van': '/static/images/vehicles/van-aerial.svg',
    'bicycle': '/static/images/vehicles/bicycle-aerial.svg',
    'pedestrian': '/static/images/vehicles/pedestrian-aerial.svg'
};

// Vehicle icon emoji mapping (for display purposes only)
const vehicleIconEmojis = {
    'petrol_diesel': '🚗',
    'electric': '⚡',
    'motorcycle': '🏍️',
    'truck': '🚚',
    'van': '🚐',
    'bicycle': '🚴',
    'pedestrian': '🚶'
};

// Variables initialized at the top level
let lastTurnZoomApplied = false;
const ZOOM_LEVELS = {
    'motorway_high_speed': 14,      // > 100 km/h
    'main_road_medium_speed': 15,   // 50-100 km/h
    'urban_low_speed': 16,          // 20-50 km/h
    'parking_very_low_speed': 17,   // < 20 km/h
    'turn_ahead': 18                 // Upcoming turn
};
const TURN_ZOOM_THRESHOLD = 500;    // Zoom in when within 500m of turn
const ZOOM_ANIMATION_DURATION = 0.5; // 500ms smooth animation

let isGeocoding = false;

// ===== MAP EXPLORE ORCHESTRATION =====
// Orchestration lives in static/js/app/map-explore-orchestration.js (bound at file end).

function getMapExploreOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getIsTrackingActive: () => isTrackingActive,
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        setZoomAndFollowEnabled: (val) => { zoomAndFollowEnabled = val; },
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        getCurrentLat: () => currentLat,
        setCurrentLat: (val) => { currentLat = val; },
        getCurrentLon: () => currentLon,
        setCurrentLon: (val) => { currentLon = val; },
        call: {
            updateRecenterButtonVisibility,
        },
    };
}

function setupMapMoveHandler() {
    VoyagrMapExploreOrchestration.setupMapMoveHandler();
}

function setupMapExploreHandlers() {
    VoyagrMapExploreOrchestration.setupMapExploreHandlers();
}

// Initialize voice recognition on page load
window.addEventListener('load', () => {
    VoyagrPageInitOrchestration.initOnWindowLoad();
});

// Turn announcement variables
let announcedTurnThresholds = new Set();  // FIXED: Track each threshold independently
const TURN_ANNOUNCEMENT_DISTANCES = [500, 200, 100, 50]; // meters

// Motorway/Highway exit announcement distances (much earlier warnings at speed)
const EXIT_ANNOUNCEMENT_DISTANCES = [2000, 800, 200, 100]; // meters (2km, 800m, 200m, 100m exit now)
let announcedExitThresholds = new Set();  // Track exit announcements separately

// Keep right/left (fork/veer) announcement distances — earlier than turns, less than exits
const KEEP_ANNOUNCEMENT_DISTANCES = [1000, 400, 150, 50]; // meters
let announcedKeepThresholds = new Set();
/** Per-maneuver voice dedup — cleared when maneuver index or category changes. */
let _voiceAnnouncedForManeuverIndex = null;
let _voiceAnnouncedCategory = null;
let lastTurnDetectRouteVertexIndex = 0;
let voiceFrequencyMode = localStorage.getItem('voiceFrequencyMode') || 'all';
let HAZARD_WARNING_DISTANCE = 500;

// Distance-to-destination announcement variables
let lastDestinationAnnouncementDistance = Infinity;
const DESTINATION_ANNOUNCEMENT_DISTANCES = [10000, 5000, 2000, 1000, 500, 100]; // meters (10km, 5km, 2km, 1km, 500m, 100m)

let _navigationArrivalTriggered = false;
let _navigationArrivalZoneSince = 0;

// Odometer for the whole journey actually driven. Accumulated from GPS fixes so the
// end-of-trip summary reflects real distance travelled (including reroutes/detours),
// not just the final route leg stored in window.lastCalculatedRoute.
let _navTraveledMeters = 0;
let _navOdometerLastGeo = null;
let _navStartedAt = 0;

// ETA announcement variables
let lastETAAnnouncementTime = 0;
let lastAnnouncedETA = null;
let initialETAMovementRetries = 0;
const ETA_CHANGE_THRESHOLD_MS = 300000; // Announce if ETA changes by >5 minutes (300,000 ms)
const ETA_MIN_INTERVAL_MS = 60000; // Minimum 1 minute between any ETA announcements (prevents excessive frequency)

let initialETAAnnouncementTimeoutId = null;
let lastNavTrafficFetchAt = 0;
/** Live nav ETA + traffic snapshot (updated during navigation). */
window.navETASnapshot = _eta().createEmptyNavETASnapshot();

/** First-time default: traffic-aware ETA on; only explicit 'false' disables. */

// ===== LIVE DATA REFRESH ORCHESTRATION =====
// Orchestration lives in static/js/app/live-data-refresh-orchestration.js (bound at file end).

function getLiveDataRefreshOrchestrationRuntime() {
    return {
        liveDataRefresh: () => _liveDataRefresh(),
        eta: () => _eta(),
        getRouteInProgress: () => routeInProgress,
        getCurrentBatteryLevel: () => VoyagrBatteryMonitoringOrchestration.getCurrentBatteryLevel(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        getRoutePolyline: () => routePolyline,
        getCurrentRoutingMode: () => currentRoutingMode,
        getVoiceAnnouncementsEnabled: () => voiceAnnouncementsEnabled,
        g: (key) => {
            switch (key) {
            case 'lastETAAnnouncementTime': return lastETAAnnouncementTime;
            case 'lastAnnouncedETA': return lastAnnouncedETA;
            case 'initialETAMovementRetries': return initialETAMovementRetries;
            case 'initialETAAnnouncementTimeoutId': return initialETAAnnouncementTimeoutId;
            default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'lastETAAnnouncementTime': lastETAAnnouncementTime = val; break;
            case 'lastAnnouncedETA': lastAnnouncedETA = val; break;
            case 'initialETAMovementRetries': initialETAMovementRetries = val; break;
            case 'initialETAAnnouncementTimeoutId': initialETAAnnouncementTimeoutId = val; break;
            default: break;
            }
        },
        call: {
            sendNotification,
            speakMessage,
            processNavigationHazardAlerts,
            computeBaseNavigationETAMinutes,
            applyTrafficRatioToBaseRemaining,
            renderTurnInfoETAPanel,
            refreshNavTrafficETAIfDue,
            hasUserStartedMoving,
        },
    };
}

function startLiveDataRefresh() { VoyagrLiveDataRefreshOrchestration.startLiveDataRefresh(); }
function stopLiveDataRefresh() { VoyagrLiveDataRefreshOrchestration.stopLiveDataRefresh(); }
function refreshTrafficData() { VoyagrLiveDataRefreshOrchestration.refreshTrafficData(); }
async function updateETACalculation() { return VoyagrLiveDataRefreshOrchestration.updateETACalculation(); }
function announceETAIfNeeded() { VoyagrLiveDataRefreshOrchestration.announceETAIfNeeded(); }
async function speakInitialETAAnnouncement() {
    return VoyagrLiveDataRefreshOrchestration.speakInitialETAAnnouncement();
}
function scheduleInitialETAAnnouncement() {
    VoyagrLiveDataRefreshOrchestration.scheduleInitialETAAnnouncement();
}
function clearInitialETAAnnouncement() { VoyagrLiveDataRefreshOrchestration.clearInitialETAAnnouncement(); }
function refreshWeatherData() { VoyagrLiveDataRefreshOrchestration.refreshWeatherData(); }

// ===== PWA LIFECYCLE ORCHESTRATION =====
// Orchestration lives in static/js/app/pwa-lifecycle-orchestration.js (bound at file end).

function getPwaLifecycleOrchestrationRuntime() {
    return {
        pwaInstall: () => _pwaInstall(),
        appState: () => _appState(),
        getBottomSheetExpanded: () => (typeof bottomSheetIsExpanded !== 'undefined' ? bottomSheetIsExpanded : true),
        call: {
            showStatus,
            safeServiceWorkerUpdate,
            switchTab,
            expandBottomSheet,
            collapseBottomSheet,
            isAvoidTollsEnabled,
            getCurrentVisibleTab,
        },
    };
}

function scheduleAppReload(reason, delayMs) {
    return VoyagrPwaLifecycleOrchestration.scheduleAppReload(reason, delayMs);
}
function scheduleMapRepaintAfterUiChange() {
    VoyagrPwaLifecycleOrchestration.scheduleMapRepaintAfterUiChange();
}
function restoreUiStateAfterReload() {
    VoyagrPwaLifecycleOrchestration.restoreUiStateAfterReload();
}
function saveAppState() {
    VoyagrPwaLifecycleOrchestration.saveAppState();
}
function restoreAppState() {
    VoyagrPwaLifecycleOrchestration.restoreAppState();
}
function refreshApp() {
    VoyagrPwaLifecycleOrchestration.refreshApp();
}
async function checkForUpdates() {
    return VoyagrPwaLifecycleOrchestration.checkForUpdates();
}
function displayPWAVersion() {
    VoyagrPwaLifecycleOrchestration.displayPWAVersion();
}

// ===== PHASE 3: BATTERY-AWARE REFRESH INTERVALS =====
/**
 * getAdaptiveRefreshInterval function
 * @function getAdaptiveRefreshInterval
 * @param {*} baseInterval - Parameter description
 * @returns {*} Return value description
 */
function getAdaptiveRefreshInterval(baseInterval) {
    return VoyagrLiveDataRefreshOrchestration.getAdaptiveRefreshInterval(baseInterval);
}

// ===== BATTERY MONITORING ORCHESTRATION =====
// Orchestration lives in static/js/app/battery-monitoring-orchestration.js (bound at file end).

function getBatteryMonitoringOrchestrationRuntime() {
    return {
        getRouteInProgress: () => routeInProgress,
        call: {
            sendNotification,
        },
    };
}

function initBatteryMonitoring() {
    VoyagrBatteryMonitoringOrchestration.initBatteryMonitoring();
}

// ===== LOCATION ORCHESTRATION =====
// Orchestration lives in static/js/app/location-orchestration.js (bound at file end).

function getLocationOrchestrationRuntime() {
    return {
        domHelpers: () => _domHelpers(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getStartMarker: () => startMarker,
        setStartMarker: (val) => { startMarker = val; },
        getEndMarker: () => endMarker,
        getRouteLayer: () => routeLayer,
        getCurrentLat: () => currentLat,
        setCurrentLat: (val) => { currentLat = val; },
        getCurrentLon: () => currentLon,
        setCurrentLon: (val) => { currentLon = val; },
        getZoomAnimationDuration: () => ZOOM_ANIMATION_DURATION,
        call: {
            showStatus,
            calculateRoute,
        },
    };
}

function getCurrentLocation() { VoyagrLocationOrchestration.getCurrentLocation(); }
function setCurrentLocation(field) { VoyagrLocationOrchestration.setCurrentLocation(field); }
function swapStartAndDestination() { VoyagrLocationOrchestration.swapStartAndDestination(); }

// ===== AUTO GPS ORCHESTRATION =====
// Orchestration lives in static/js/app/auto-gps-orchestration.js (bound at file end).

function getAutoGpsOrchestrationRuntime() {
    return {
        setCurrentLat: (val) => { currentLat = val; },
        setCurrentLon: (val) => { currentLon = val; },
        call: {
            showStatus,
            calculateDistanceMeters,
        },
    };
}

function toggleAutoGpsLocation() { VoyagrAutoGpsOrchestration.toggleAutoGpsLocation(); }
function startAutoGpsLocation() { VoyagrAutoGpsOrchestration.startAutoGpsLocation(); }
function stopAutoGpsLocation() { VoyagrAutoGpsOrchestration.stopAutoGpsLocation(); }
function updateAutoGpsLocation() { VoyagrAutoGpsOrchestration.updateAutoGpsLocation(); }

// ===== GEOCODING ORCHESTRATION =====
// Orchestration lives in static/js/app/geocoding-orchestration.js (bound at file end).

function getGeocodingOrchestrationRuntime() {
    return {
        geocodingLocations: () => _geocodingLocations(),
        searchAutocomplete: () => _searchAutocomplete(),
        getAutoGpsEnabled: () => VoyagrAutoGpsOrchestration.getAutoGpsEnabled(),
        g: (key) => {
            switch (key) {
            case 'mapPickerMode': return mapPickerMode;
            case 'isGeocoding': return isGeocoding;
            default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'mapPickerMode': mapPickerMode = val; break;
            case 'isGeocoding': isGeocoding = val; break;
            default: break;
            }
        },
        call: {
            showStatus,
            collapseBottomSheet,
            addViaPoint,
            addStop,
            recordRecentDestination,
            fetchJsonWithAuth,
            loadRecentDestinations,
            escapeHtml,
        },
    };
}

function initGeocodeCache() { VoyagrGeocodingOrchestration.initGeocodeCache(); }
async function showAutocomplete(fieldId) { return VoyagrGeocodingOrchestration.showAutocomplete(fieldId); }
async function geocodeAddress(address) { return VoyagrGeocodingOrchestration.geocodeAddress(address); }
async function geocodeLocations(startAddress, endAddress) {
    return VoyagrGeocodingOrchestration.geocodeLocations(startAddress, endAddress);
}
function pickLocationFromMap(field) { VoyagrGeocodingOrchestration.pickLocationFromMap(field); }
function getAutocompleteDropdown(fieldId) { return VoyagrGeocodingOrchestration.getAutocompleteDropdown(fieldId); }

// ===== NAVIGATION LIFECYCLE ORCHESTRATION =====
// Orchestration lives in static/js/app/navigation-lifecycle-orchestration.js (bound at file end).

function getNavigationLifecycleOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        routeSelection: () => _routeSelection(),
        routeGeometry: () => _routeGeometry(),
        turnInstructions: () => _turnInstructions(),
        eta: () => _eta(),
        toggleUI: () => _toggleUI(),
        deviceEnvironment: () => _deviceEnvironment(),
        getRouteOptions: () => routeOptions,
        getSelectedRouteIndex: () => selectedRouteIndex,
        getRouteInProgress: () => routeInProgress,
        setRouteInProgress: (val) => { routeInProgress = val; },
        getRouteJoinConfirmedForDeviation: () => routeJoinConfirmedForDeviation,
        setRouteJoinConfirmedForDeviation: (val) => { routeJoinConfirmedForDeviation = val; },
        getCurrentStepIndex: () => currentStepIndex,
        setCurrentStepIndex: (val) => { currentStepIndex = val; },
        getCurrentRouteSteps: () => currentRouteSteps,
        setCurrentRouteSteps: (val) => { currentRouteSteps = val; },
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        setLastSnappedRouteIndex: (val) => { lastSnappedRouteIndex = val; },
        getLastTurnDetectRouteVertexIndex: () => lastTurnDetectRouteVertexIndex,
        setLastTurnDetectRouteVertexIndex: (val) => { lastTurnDetectRouteVertexIndex = val; },
        getMap: () => map,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getIsTrackingActive: () => isTrackingActive,
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        getJourneyOverviewActive: () => journeyOverviewActive,
        setJourneyOverviewActive: (val) => { journeyOverviewActive = val; },
        getSavedMapState: () => savedMapState,
        setSavedMapState: (val) => { savedMapState = val; },
        getArModeActive: () => arModeActive,
        getDriverPerspectiveEnabled: () => driverPerspectiveEnabled,
        getUpdatePending: () => updatePending,
        setNavTraveledMeters: (val) => { _navTraveledMeters = val; },
        setNavOdometerLastGeo: (val) => { _navOdometerLastGeo = val; },
        setNavStartedAt: (val) => { _navStartedAt = val; },
        setLastETAAnnouncementTime: (val) => { lastETAAnnouncementTime = val; },
        setLastAnnouncedETA: (val) => { lastAnnouncedETA = val; },
        setLastNavTrafficFetchAt: (val) => { lastNavTrafficFetchAt = val; },
        setInitialETAMovementRetries: (val) => { initialETAMovementRetries = val; },
        call: {
            resetVoiceAnnouncementStateForNewRoute,
            resetVehicleMarkerDisplayState,
            resetNavigationArrivalState,
            decodePolyline,
            persistActiveRoute,
            precacheRouteTiles,
            primeVehicleMarkerOnRoute,
            showStatus,
            applyZoomFollowButtonUi,
            updateRoadReportFabVisibility,
            updateRecenterButtonVisibility,
            updateSpeedWidgetVisibility,
            startGPSTracking,
            applyLiveNavigationCamera,
            startLiveDataRefresh,
            updateETACalculation,
            scheduleInitialETAAnnouncement,
            startAutoTrafficUpdates,
            startRouteTrafficUpdates,
            showTurnInstructionWidget,
            updateTurnWidgetFromPosition,
            updateTurnInstructionDisplay,
            showJourneySummaryBar,
            updateNavigationFabVisibility,
            voyagrShowMapIconHint,
            sendNotification,
            speakMessage,
            showVolumeHintForNavigation,
            clearRerouteFailureRetries,
            clearPersistedRoute,
            stopGPSTracking,
            hideRoadNameBar,
            stopLiveDataRefresh,
            clearInitialETAAnnouncement,
            stopAutoTrafficUpdates,
            stopRouteTrafficUpdates,
            hideTurnInstructionWidget,
            hideJourneySummaryBar,
            stopARMode,
            applyDriverPerspective,
            saveAppState,
            buildTraveledJourneyRoute,
            persistCompletedTrip,
            showJourneySummary,
            getTrafficSettingsSnapshot: () => VoyagrTrafficOrchestration.getTrafficSettingsSnapshot(),
            shouldUsePitchedDrivingCamera,
            convertDistance,
            getDistanceUnit,
        },
    };
}

function startTurnByTurnNavigation(routeData, navStartOpts = null) {
    return VoyagrNavigationLifecycleOrchestration.startTurnByTurnNavigation(routeData, navStartOpts);
}
function stopTurnByTurnNavigation() {
    return VoyagrNavigationLifecycleOrchestration.stopTurnByTurnNavigation();
}
function updateTurnGuidance(userLat, userLon) {
    return VoyagrNavigationLifecycleOrchestration.updateTurnGuidance(userLat, userLon);
}

// ===== POI SEARCH ORCHESTRATION =====
// Orchestration lives in static/js/app/poi-search-orchestration.js (bound at file end).

function getPoiSearchOrchestrationRuntime() {
    return {
        poiSearch: () => _poiSearch(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getRoutePolyline: () => routePolyline,
        s: (key, val) => {
            if (key === 'currentLat') currentLat = val;
            else if (key === 'currentLon') currentLon = val;
        },
        call: {
            showStatus,
            calculateRoute,
            formatPoiDistance: (distanceM) => _units().formatPoiDistanceMeters(distanceM, distanceUnit),
        },
    };
}

function quickSearch(type) { VoyagrPoiSearchOrchestration.quickSearch(type); }
function displayPOIResults(results, type, userLat, userLon) {
    VoyagrPoiSearchOrchestration.displayPOIResults(results, type, userLat, userLon);
}
function closePOIModal() { VoyagrPoiSearchOrchestration.closePOIModal(); }
function selectPOI(poiLat, poiLon, poiName, userLat, userLon) {
    VoyagrPoiSearchOrchestration.selectPOI(poiLat, poiLon, poiName, userLat, userLon);
}
function searchAlongRoute() { VoyagrPoiSearchOrchestration.searchAlongRoute(); }
function searchAlongRouteByType(type) { VoyagrPoiSearchOrchestration.searchAlongRouteByType(type); }
function clearPOIMarkers() { VoyagrPoiSearchOrchestration.clearPOIMarkers(); }

// ===== ROUTE AVOIDANCE ORCHESTRATION =====
// Orchestration lives in static/js/app/route-avoidance-orchestration.js (bound at file end).

function getRouteAvoidanceOrchestrationRuntime() {
    return {
        routePrefs: () => _routePrefs(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
            saveAllSettings,
        },
    };
}

function toggleAvoidancePreference(pref) {
    VoyagrRouteAvoidanceOrchestration.toggleAvoidancePreference(pref);
}
function loadAvoidancePreferences() {
    VoyagrRouteAvoidanceOrchestration.loadAvoidancePreferences();
}
function togglePreference(pref) {
    VoyagrRouteAvoidanceOrchestration.togglePreference(pref);
}

// ===== ROAD NAME ORCHESTRATION =====
// Orchestration lives in static/js/app/road-name-orchestration.js (bound at file end).

function getRoadNameOrchestrationRuntime() {
    return {
        roadNameDisplay: () => _roadNameDisplay(),
        call: {
            calculateDistanceMeters,
        },
    };
}

function fetchRoadNameThrottled(lat, lon) {
    VoyagrRoadNameOrchestration.fetchRoadNameThrottled(lat, lon);
}
function hideRoadNameBar() {
    VoyagrRoadNameOrchestration.hideRoadNameBar();
}

// ===== BEST TIME TO LEAVE ORCHESTRATION =====
// Orchestration lives in static/js/app/best-time-leave-orchestration.js (bound at file end).

function getBestTimeLeaveOrchestrationRuntime() {
    return {
        bestTimeLeave: () => _bestTimeLeave(),
        call: {
            showStatus,
        },
    };
}

function analysebestTimeToLeave() {
    VoyagrBestTimeLeaveOrchestration.analysebestTimeToLeave();
}
function applyBestDepartureTime(timeStr) {
    VoyagrBestTimeLeaveOrchestration.applyBestDepartureTime(timeStr);
}

// ===== NOTIFICATIONS ORCHESTRATION =====
// Orchestration lives in static/js/app/notifications-orchestration.js (bound at file end).

function getNotificationsOrchestrationRuntime() {
    return {
        deviceEnvironment: () => _deviceEnvironment(),
        getVoiceAnnouncementsEnabled: () => voiceAnnouncementsEnabled,
        getRouteInProgress: () => routeInProgress,
        getNavigationArrivalTriggered: () => _navigationArrivalTriggered,
        s: (key, val) => {
            if (key === 'navigationArrivalTriggered') _navigationArrivalTriggered = val;
        },
        call: {
            speakMessage,
            stopTurnByTurnNavigation,
        },
    };
}

function sendNotification(title, message, type) {
    return VoyagrNotificationsOrchestration.sendNotification(title, message, type);
}
function showInAppNotification(title, message, type, durationMs) {
    return VoyagrNotificationsOrchestration.showInAppNotification(title, message, type, durationMs);
}
function sendEnvironmentHint(channel, title, message, type) {
    return VoyagrNotificationsOrchestration.sendEnvironmentHint(channel, title, message, type);
}
function initDeviceEnvironmentNotifications() {
    VoyagrNotificationsOrchestration.initDeviceEnvironmentNotifications();
}
function showVolumeHintForNavigation() {
    VoyagrNotificationsOrchestration.showVolumeHintForNavigation();
}
function sendETANotification(eta, distance) {
    VoyagrNotificationsOrchestration.sendETANotification(eta, distance);
}
function sendArrivalNotification() {
    VoyagrNotificationsOrchestration.sendArrivalNotification();
}
// ===== HAZARD PREFERENCES ORCHESTRATION =====
// Orchestration lives in static/js/app/hazard-preferences-orchestration.js (bound at file end).

function getHazardPreferencesOrchestrationRuntime() {
    return {
        hazardAlerts: () => _hazardAlerts(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
            saveAllSettings,
        },
    };
}

async function loadHazardCameraTogglesFromApi() {
    return VoyagrHazardPreferencesOrchestration.loadHazardCameraTogglesFromApi();
}
async function toggleHazardPreferenceApi(hazardType, ev) {
    return VoyagrHazardPreferencesOrchestration.toggleHazardPreferenceApi(hazardType, ev);
}

window.toggleHazardPreferenceApi = toggleHazardPreferenceApi;
window.loadHazardCameraTogglesFromApi = loadHazardCameraTogglesFromApi;

// ===== PREFERENCE FUNCTIONS =====
function getLegacyPreferencesOrchestrationRuntime() {
    return {
        routePrefs: () => _routePrefs(),
        toggleUI: () => _toggleUI(),
        gestureControl: () => _gestureControl(),
        legacyPrefsRestore: () => _legacyPrefsRestore(),
        batterySaving: () => _batterySaving(),
        setGestureEnabled: (val) => VoyagrGestureControlOrchestration.setGestureEnabled(val),
        setAutoGpsEnabled: (val) => VoyagrAutoGpsOrchestration.setAutoGpsEnabled(val),
        call: {
            loadHazardCameraTogglesFromApi,
            handleDeviceMotion,
            startAutoGpsLocation,
            applyBatterySavingModeFromPlan,
            applySpeedWidgetToggleUi,
        },
    };
}

function loadPreferences() {
    VoyagrLegacyPreferencesOrchestration.loadPreferences();
}


// Update calculateRoute to show trip info
const originalCalculateRoute = calculateRoute;
calculateRoute = function (...args) {
    // calculateRoute is async; forward its promise so `await calculateRoute()`
    // callers actually wait for the calculation to finish (and not resolve early).
    return originalCalculateRoute.apply(this, args);
}

// ===== PAGE INIT ORCHESTRATION =====
// Orchestration lives in static/js/app/page-init-orchestration.js (bound at file end).

function getPageInitOrchestrationRuntime() {
    return {
        porcupineWake: () => _porcupineWake(),
        getMap: () => map,
        getCurrentVehicleType: () => currentVehicleType,
        getCurrentRoutingMode: () => currentRoutingMode,
        getSmartZoomEnabled: () => smartZoomEnabled,
        call: {
            initVoiceRecognition,
            setupVoiceCommandProcessing,
            initGeocodeCache,
            ensureDefaultTrafficAwareRouting,
            loadAllSettings,
            applySettingsToUI,
            loadParkingPreferences,
            loadVoicePreferences,
            loadPorcupineWakeUi,
            picovoiceClientConfigured,
            startPorcupineWakePipeline,
            loadPreferences,
            initTrafficLayer,
            initWeatherLayer,
            initializeRoadLabels,
        },
    };
}

// ===== MOBILE PWA ORCHESTRATION =====
// Orchestration lives in static/js/app/mobile-pwa-orchestration.js (bound at file end).

function getMobilePwaOrchestrationRuntime() {
    return {
        pwaInstall: () => _pwaInstall(),
        domHelpers: () => _domHelpers(),
        getMap: () => map,
        getIsTrackingActive: () => isTrackingActive,
        getGpsWatchId: () => gpsWatchId,
        call: {
            collapseBottomSheet,
            startGPSTracking,
        },
    };
}

window.addEventListener('load', () => {
    VoyagrMobilePwaOrchestration.initOnPageLoad();
});

// ===== JOURNEY SUMMARY & SETTINGS CONSOLIDATION =====
function getJourneySummaryOrchestrationRuntime() {
    return {
        eta: () => _eta(),
        routeGeometry: () => _routeGeometry(),
        movementDetection: () => _movementDetection(),
        units: () => _units(),
        getTrackingHistory: () => trackingHistory,
        getRouteInProgress: () => routeInProgress,
        getRoutePolyline: () => routePolyline,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        getDistanceUnit: () => distanceUnit,
        getNavTraveledMeters: () => _navTraveledMeters,
        getNavStartedAt: () => _navStartedAt,
        call: {
            applyTrafficRatioToBaseRemaining,
            convertDistance,
            getDistanceUnit,
            convertSpeed,
            getSpeedUnit,
            getCurrencySymbol,
            adjustCostForUnits,
            expandBottomSheet,
            switchTab,
            clearForm,
        },
    };
}

function buildTraveledJourneyRoute(route) {
    return VoyagrJourneySummaryOrchestration.buildTraveledJourneyRoute(route);
}
function showJourneySummary(routeData) {
    VoyagrJourneySummaryOrchestration.showJourneySummary(routeData);
}
function closeJourneySummary() {
    VoyagrJourneySummaryOrchestration.closeJourneySummary();
}

VoyagrParkingOrchestration.bind(getParkingOrchestrationRuntime());
VoyagrRerouteMapOrchestration.bind(getRerouteMapOrchestrationRuntime());
VoyagrTrafficOrchestration.bind(getTrafficOrchestrationRuntime());
VoyagrPorcupineOrchestration.bind(getPorcupineOrchestrationRuntime());
VoyagrGpsOrchestration.bind(getGpsOrchestrationRuntime());
VoyagrLiveDataRefreshOrchestration.bind(getLiveDataRefreshOrchestrationRuntime());
VoyagrTripHistoryOrchestration.bind(getTripHistoryOrchestrationRuntime());
VoyagrRouteSavingOrchestration.bind(getRouteSavingOrchestrationRuntime());
VoyagrGeocodingOrchestration.bind(getGeocodingOrchestrationRuntime());
VoyagrSpeedWidgetOrchestration.bind(getSpeedWidgetOrchestrationRuntime());
VoyagrWaypointsOrchestration.bind(getWaypointsOrchestrationRuntime());
VoyagrRouteSharingOrchestration.bind(getRouteSharingOrchestrationRuntime());
VoyagrNotificationsOrchestration.bind(getNotificationsOrchestrationRuntime());
VoyagrRoutePreferencesOrchestration.bind(getRoutePreferencesOrchestrationRuntime());
VoyagrOfflineNavigationOrchestration.bind(getOfflineNavigationOrchestrationRuntime());
VoyagrSearchFavoritesOrchestration.bind(getSearchFavoritesOrchestrationRuntime());
VoyagrPoiSearchOrchestration.bind(getPoiSearchOrchestrationRuntime());
VoyagrBestTimeLeaveOrchestration.bind(getBestTimeLeaveOrchestrationRuntime());
VoyagrCazOrchestration.bind(getCazOrchestrationRuntime());
VoyagrRouteAvoidanceOrchestration.bind(getRouteAvoidanceOrchestrationRuntime());
VoyagrRoadNameOrchestration.bind(getRoadNameOrchestrationRuntime());
VoyagrMobilePwaOrchestration.bind(getMobilePwaOrchestrationRuntime());
VoyagrHazardPreferencesOrchestration.bind(getHazardPreferencesOrchestrationRuntime());
VoyagrBottomSheetOrchestration.bind(getBottomSheetOrchestrationRuntime());
VoyagrProfileStoreOrchestration.bind(getProfileStoreOrchestrationRuntime());
VoyagrSettingsOrchestration.bind(getSettingsOrchestrationRuntime());
VoyagrVoiceControlOrchestration.bind(getVoiceControlOrchestrationRuntime());
VoyagrMapExploreOrchestration.bind(getMapExploreOrchestrationRuntime());
VoyagrBatteryMonitoringOrchestration.bind(getBatteryMonitoringOrchestrationRuntime());
VoyagrPhase3FeaturesOrchestration.bind(getPhase3FeaturesOrchestrationRuntime());
VoyagrGestureControlOrchestration.bind(getGestureControlOrchestrationRuntime());
VoyagrBatterySavingOrchestration.bind(getBatterySavingOrchestrationRuntime());
VoyagrUnitsPreferencesOrchestration.bind(getUnitsPreferencesOrchestrationRuntime());
VoyagrSmartZoomOrchestration.bind(getSmartZoomOrchestrationRuntime());
VoyagrMapThemeOrchestration.bind(getMapThemeOrchestrationRuntime());
VoyagrFormClearOrchestration.bind(getFormClearOrchestrationRuntime());
VoyagrMapHintsOrchestration.bind(getMapHintsOrchestrationRuntime());
VoyagrDarkModeOrchestration.bind(getDarkModeOrchestrationRuntime());
VoyagrRoadReportOrchestration.bind(getRoadReportOrchestrationRuntime());
VoyagrRecentDestinationsOrchestration.bind(getRecentDestinationsOrchestrationRuntime());
VoyagrMapView3DOrchestration.bind(getMapView3DOrchestrationRuntime());
VoyagrArNavigationOrchestration.bind(getArNavigationOrchestrationRuntime());
VoyagrTurnInstructionWidgetOrchestration.bind(getTurnInstructionWidgetOrchestrationRuntime());
VoyagrLaneGuidanceOrchestration.bind(getLaneGuidanceOrchestrationRuntime());
VoyagrNavigationLifecycleOrchestration.bind(getNavigationLifecycleOrchestrationRuntime());
VoyagrTabNavigationOrchestration.bind(getTabNavigationOrchestrationRuntime());
VoyagrDriverCameraOrchestration.bind(getDriverCameraOrchestrationRuntime());
VoyagrPwaLifecycleOrchestration.bind(getPwaLifecycleOrchestrationRuntime());
VoyagrServiceWorkerOrchestration.bind(getServiceWorkerOrchestrationRuntime());
VoyagrMlPredictionsOrchestration.bind(getMlPredictionsOrchestrationRuntime());
VoyagrVehicleRoutingOrchestration.bind(getVehicleRoutingOrchestrationRuntime());
VoyagrAutoGpsOrchestration.bind(getAutoGpsOrchestrationRuntime());
VoyagrLocationOrchestration.bind(getLocationOrchestrationRuntime());
VoyagrPageInitOrchestration.bind(getPageInitOrchestrationRuntime());
VoyagrRoutePreviewOrchestration.bind(getRoutePreviewOrchestrationRuntime());
VoyagrLegacyPreferencesOrchestration.bind(getLegacyPreferencesOrchestrationRuntime());
VoyagrMapLayersOrchestration.bind(getMapLayersOrchestrationRuntime());
VoyagrMapOverlayOrchestration.bind(getMapOverlayOrchestrationRuntime());
VoyagrRouteComparisonOrchestration.bind(getRouteComparisonOrchestrationRuntime());
VoyagrJourneySummaryOrchestration.bind(getJourneySummaryOrchestrationRuntime());

VoyagrBatteryMonitoringOrchestration.initBatteryMonitoring();



// NOTE: toggleDriverPerspective is defined earlier in the file (around line 7711)
// This duplicate was removed to fix the driver's perspective mode conflict
