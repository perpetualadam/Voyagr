/**
 * @file Supabase auth, support/Stripe links, and promo code orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var win = root;
    var SOFT_AUTH_BANNER_DISMISS_KEY = 'voyagr_soft_auth_banner_dismissed';
    var STRIPE_ONBOARD_SKIP_PREFIX = 'voyagr_skip_stripe_onboard:';
    var supabaseClient = null;
    var supabasePublicConfig = null;
    var authGateStripeOffer = null;

    function rt() {
        if (!runtime) {
            throw new Error('[SupabaseAuth] Orchestration runtime not bound');
        }
        return runtime;
    }

    function stripeOnboardSkipKey(userId) {
        return userId ? STRIPE_ONBOARD_SKIP_PREFIX + userId : null;
    }

    function openVoyagerPremiumSection() {
        try {
            if (typeof rt().call.expandBottomSheet === 'function') {
                rt().call.expandBottomSheet();
            }
            rt().call.switchTab('settings');
            setTimeout(function () {
                var el = document.getElementById('supportVoyagrSection');
                if (!el) return;
                if (el.style.display === 'none') {
                    rt().call.showStatus('Voyager Premium is not configured on this server yet (add Stripe or tip URLs in .env).', 'info');
                    return;
                }
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        } catch (e) {
            console.warn('[Voyager Premium] open section failed', e);
        }
    }

    function applySupportLinksFromConfig(cfg) {
        var section = document.getElementById('supportVoyagrSection');
        if (!section || !cfg) return;

        var pl = (cfg.stripe_payment_link_url || '').trim();
        var bmc = (cfg.buy_me_a_coffee_url || '').trim();
        var pat = (cfg.patreon_url || '').trim();
        var checkout = !!(cfg.stripe_subscription_checkout_available || cfg.stripe_checkout_available);

        var btnStripe = document.getElementById('supportStripePremiumBtn');
        var btnBmc = document.getElementById('supportBmcBtn');
        var btnPat = document.getElementById('supportPatreonBtn');
        var regionNote = (cfg.service_region_note || '').trim();
        var stripePremium = !!(pl || checkout);
        var show = !!(stripePremium || bmc || pat || regionNote);
        section.style.display = show ? 'block' : 'none';

        var regionEl = document.getElementById('serviceRegionNote');
        if (regionEl) {
            if (regionNote) {
                regionEl.style.display = 'block';
                regionEl.textContent = regionNote;
            } else {
                regionEl.style.display = 'none';
                regionEl.textContent = '';
            }
        }

        var trialNote = document.getElementById('supportStripeTrialNote');
        var trialDays = parseInt(cfg.stripe_subscription_trial_days, 10);
        var usesCheckout = !pl && checkout;
        if (trialNote) {
            if (Number.isFinite(trialDays) && trialDays > 0 && usesCheckout) {
                trialNote.style.display = 'block';
                trialNote.textContent =
                    'Voyager Premium checkout includes a ' + trialDays + '-day free trial; billing starts after that. Set STRIPE_SUCCESS_URL to your public site (domain B) if you want users to land there after checkout.';
            } else {
                trialNote.style.display = 'none';
                trialNote.textContent = '';
            }
        }

        if (btnStripe) {
            btnStripe.style.display = stripePremium ? 'block' : 'none';
            if (pl) {
                btnStripe.onclick = function () { window.open(pl, '_blank', 'noopener,noreferrer'); };
            } else if (checkout) {
                btnStripe.onclick = function () { void startStripeSubscriptionCheckout(); };
            } else {
                btnStripe.onclick = null;
            }
        }
        if (btnBmc) {
            btnBmc.style.display = bmc ? 'block' : 'none';
            btnBmc.onclick = bmc ? function () { window.open(bmc, '_blank', 'noopener,noreferrer'); } : null;
        }
        if (btnPat) {
            btnPat.style.display = pat ? 'block' : 'none';
            btnPat.onclick = pat ? function () { window.open(pat, '_blank', 'noopener,noreferrer'); } : null;
        }
    }

    async function startStripeSubscriptionCheckout(sessionOpt) {
        try {
            rt().call.showStatus('Opening subscription checkout…', 'info');
            var origin = window.location.origin;
            var session = sessionOpt;
            if (session == null && supabaseClient) {
                var sessionData = await supabaseClient.auth.getSession();
                session = sessionData.data?.session || null;
            }
            var body = {
                success_url: origin + '/?subscribe=success',
                cancel_url: origin + '/?subscribe=cancelled',
            };
            if (session?.user?.email) body.customer_email = session.user.email;
            if (session?.user?.id) body.supabase_user_id = session.user.id;
            var res = await fetch('/api/support/stripe-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            var data = await res.json();
            if (!res.ok || !data.success || !data.url) {
                rt().call.showStatus(data.error || 'Subscription checkout unavailable', 'error');
                return;
            }
            window.location.href = data.url;
        } catch (e) {
            console.error('[Support] Stripe subscription checkout failed', e);
            rt().call.showStatus('Could not start subscription checkout', 'error');
        }
    }

    function voyagrSoftAuthBannerAllowedHost() {
        try {
            var h = String(window.location.hostname || '').toLowerCase();
            return h === 'vibevoyager.org' || h === 'www.vibevoyager.org';
        } catch (e) {
            return false;
        }
    }

    function syncSoftAuthBannerVisibility(wantGuestPrompt) {
        var el = document.getElementById('softAuthBanner');
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
            if (sessionStorage.getItem(SOFT_AUTH_BANNER_DISMISS_KEY) === 'true') {
                el.style.display = 'none';
                return;
            }
        } catch (e) { /* ignore */ }
        el.style.display = 'flex';
    }

    function voyagrDismissSoftAuthBanner() {
        try {
            sessionStorage.setItem(SOFT_AUTH_BANNER_DISMISS_KEY, 'true');
        } catch (e) { /* ignore */ }
        syncSoftAuthBannerVisibility(false);
    }

    function voyagrOpenSignInFromBanner() {
        try {
            if (typeof rt().call.expandBottomSheet === 'function') {
                rt().call.expandBottomSheet();
            }
            rt().call.switchTab('settings');
            setTimeout(function () {
                var el = document.getElementById('accountSection');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        } catch (e) {
            console.warn('[Auth] Open sign-in from banner failed:', e);
        }
    }

    function getStripeOnboardingOffer(cfg) {
        if (!cfg) return null;
        var pl = (cfg.stripe_payment_link_url || '').trim();
        var checkout = !!(cfg.stripe_subscription_checkout_available || cfg.stripe_checkout_available);
        var trialDays = parseInt(cfg.stripe_subscription_trial_days, 10);
        var hasTrial = Number.isFinite(trialDays) && trialDays > 0;
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
            var qs = new URLSearchParams(window.location.search || '');
            var sub = qs.get('subscribe');
            if (sub === 'success' && userId) {
                var k = stripeOnboardSkipKey(userId);
                if (k) localStorage.setItem(k, '1');
            }
            if (sub === 'success' || sub === 'cancelled') {
                var url = new URL(window.location.href);
                url.searchParams.delete('subscribe');
                url.searchParams.delete('session_id');
                window.history.replaceState({}, '', url.pathname + url.search + url.hash);
            }
        } catch (e) {
            console.warn('[Stripe gate] URL cleanup:', e);
        }
    }

    function setAuthGateFormStatus(message, kind) {
        var statusEl = document.getElementById('authGateStatus');
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.className = 'auth-required-gate__status';
        if (kind === 'error') statusEl.classList.add('auth-required-gate__status--error');
        else if (kind === 'ok') statusEl.classList.add('auth-required-gate__status--ok');
    }

    function syncAuthRequiredGate(mode, offer) {
        var gate = document.getElementById('authRequiredGate');
        var loadingEl = document.getElementById('authGateLoading');
        var formEl = document.getElementById('authGateForm');
        var stripeEl = document.getElementById('authGateStripeTrial');
        var titleEl = document.getElementById('authGateTitle');
        if (!gate) return;

        if (mode === 'off') {
            authGateStripeOffer = null;
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
            var hint = document.getElementById('authGateStripeHint');
            var td = offer.trialDays;
            if (hint) {
                hint.textContent =
                    'Continue to Stripe to start your ' + td + '-day Voyager Premium trial. Billing begins after the trial unless you cancel in the Stripe portal.';
            }
            var ssl = document.getElementById('authGateStripeStatus');
            if (ssl) {
                ssl.textContent = '';
                ssl.className = 'auth-required-gate__status';
            }
            var primary = document.getElementById('authGateStripePrimaryBtn');
            if (primary) {
                primary.textContent = offer.kind === 'payment_link' ? 'Open Stripe checkout' : 'Continue to Stripe';
            }
            stripeEl.style.display = 'block';
        }
    }

    async function showPostAuthStripeGateIfNeeded(session) {
        var uid = session?.user?.id;
        if (!uid || !supabasePublicConfig) {
            syncAuthRequiredGate('off');
            return;
        }
        consumeStripeReturnQueryForUser(uid);
        try {
            if (localStorage.getItem(stripeOnboardSkipKey(uid)) === '1') {
                syncAuthRequiredGate('off');
                return;
            }
        } catch (e) { /* ignore quota */ }

        var offer = getStripeOnboardingOffer(supabasePublicConfig);
        if (!offer || offer.trialDays <= 0) {
            syncAuthRequiredGate('off');
            return;
        }
        authGateStripeOffer = offer;
        syncAuthRequiredGate('stripe_trial', offer);
    }

    async function authGateStripeContinue() {
        var st = document.getElementById('authGateStripeStatus');
        var setSt = function (msg, kind) {
            if (!st) return;
            st.textContent = msg || '';
            st.className = 'auth-required-gate__status';
            if (kind === 'error') st.classList.add('auth-required-gate__status--error');
        };
        var offer = authGateStripeOffer;
        if (!offer) {
            syncAuthRequiredGate('off');
            return;
        }
        if (!supabaseClient) {
            setSt('Session unavailable. Refresh the page.', 'error');
            return;
        }
        var sessionData = await supabaseClient.auth.getSession();
        var sess = sessionData.data?.session || null;
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
            var origin = window.location.origin;
            var res = await fetch('/api/support/stripe-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success_url: origin + '/?subscribe=success',
                    cancel_url: origin + '/?subscribe=cancelled',
                    customer_email: sess?.user?.email || undefined,
                    supabase_user_id: sess?.user?.id || undefined,
                }),
            });
            var resData = await res.json();
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
            var sessionData = await supabaseClient.auth.getSession();
            var uid = sessionData.data?.session?.user?.id;
            var k = stripeOnboardSkipKey(uid);
            if (k) localStorage.setItem(k, '1');
        } catch (e) { /* ignore */ }
        authGateStripeOffer = null;
        syncAuthRequiredGate('off');
    }

    async function authSignInEmailGate() {
        if (!supabaseClient) {
            setAuthGateFormStatus('Sign-in is unavailable. Try again later.', 'error');
            return;
        }
        var email = document.getElementById('authGateEmail')?.value?.trim();
        var password = document.getElementById('authGatePassword')?.value || '';
        if (!email || !password) {
            setAuthGateFormStatus('Enter your email and password.', 'error');
            return;
        }
        setAuthGateFormStatus('Signing in…', '');
        var result = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
        if (result.error) {
            setAuthGateFormStatus(result.error.message || 'Sign-in failed', 'error');
            return;
        }
        setAuthGateFormStatus('', '');
    }

    async function authSignUpEmailGate() {
        if (!supabaseClient) {
            setAuthGateFormStatus('Sign-up is unavailable. Try again later.', 'error');
            return;
        }
        var email = document.getElementById('authGateEmail')?.value?.trim();
        var password = document.getElementById('authGatePassword')?.value || '';
        if (!email || !password) {
            setAuthGateFormStatus('Enter your email and password.', 'error');
            return;
        }
        setAuthGateFormStatus('Creating account…', '');
        var result = await supabaseClient.auth.signUp({ email: email, password: password });
        if (result.error) {
            setAuthGateFormStatus(result.error.message || 'Sign-up failed', 'error');
            return;
        }
        setAuthGateFormStatus('Account created. Check your email if confirmation is required.', 'ok');
    }

    function setAccountUIState(opts) {
        var signedIn = opts.signedIn;
        var email = opts.email;
        var message = opts.message;
        var statusEl = document.getElementById('accountStatus');
        var signedOutEl = document.getElementById('accountSignedOut');
        var signedInEl = document.getElementById('accountSignedIn');
        var emailEl = document.getElementById('accountEmail');

        if (statusEl) statusEl.textContent = message || '';
        if (signedOutEl) signedOutEl.style.display = signedIn ? 'none' : 'block';
        if (signedInEl) signedInEl.style.display = signedIn ? 'block' : 'none';
        if (emailEl) emailEl.textContent = email || '-';
    }

    async function handleSupabaseSession(session) {
        if (session && session.user) {
            syncSoftAuthBannerVisibility(false);
            var userId = session.user.id;
            var email = session.user.email || '';
            setAccountUIState({ signedIn: true, email: email, message: 'Signed in.' });

            var userProfileId = 'sb:' + userId;
            rt().call.ensureProfileExists(userProfileId);

            var store = rt().call.getProfileStore();
            var guestSnap = store['guest'];
            var userSnap = store[userProfileId];
            var guestHasData = !!(guestSnap?.voyagr_all_settings && guestSnap.voyagr_all_settings.length > 10) ||
                !!(guestSnap?.savedRoutes && guestSnap.savedRoutes !== '[]');
            var userHasData = !!(userSnap?.voyagr_all_settings && userSnap.voyagr_all_settings.length > 10) ||
                !!(userSnap?.savedRoutes && userSnap.savedRoutes !== '[]');

            if (guestHasData && !userHasData) {
                var importChoice = confirm('Import your current on-device (guest) profile into this account profile?');
                if (importChoice) {
                    rt().call.switchActiveProfile(userProfileId, { importFromProfileId: 'guest' });
                    rt().call.showStatus('Imported guest profile into account profile', 'success');
                    rt().call.scheduleSupabaseProfileSync();
                    await refreshPromoCodeSection(session || null);
                    await showPostAuthStripeGateIfNeeded(session);
                    return;
                }
            }

            rt().call.switchActiveProfile(userProfileId);
            await rt().call.pullProfileSnapshotFromSupabase(userProfileId);
            rt().call.scheduleSupabaseProfileSync();
            await refreshPromoCodeSection(session || null);
            await showPostAuthStripeGateIfNeeded(session);
            return;
        }

        setAccountUIState({ signedIn: false, message: 'Not signed in (guest profile).' });
        rt().call.switchActiveProfile('guest');
        await refreshPromoCodeSection(session || null);
        syncAuthRequiredGate('off');
        syncSoftAuthBannerVisibility(!!supabaseClient);
    }

    async function initSupabaseAuth() {
        try {
            var res = await fetch('/api/config', { cache: 'no-store' });
            var data = await res.json();
            supabasePublicConfig = data;
            applySupportLinksFromConfig(data);

            var url = data.supabase_url;
            var anonKey = data.supabase_anon_key;

            if (!url || !anonKey || typeof supabase === 'undefined') {
                setAccountUIState({
                    signedIn: false,
                    message: 'Account login not configured on this server.',
                });
                var accountSection = document.getElementById('accountSection');
                if (accountSection) accountSection.style.display = 'none';
                syncAuthRequiredGate('off');
                syncSoftAuthBannerVisibility(false);
                return;
            }

            var createClient = supabase.createClient;
            supabaseClient = createClient(url, anonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                },
            });
            win.supabaseClient = supabaseClient;

            var sessionData = await supabaseClient.auth.getSession();
            await handleSupabaseSession(sessionData.data?.session || null);

            supabaseClient.auth.onAuthStateChange(async function (_event, nextSession) {
                await handleSupabaseSession(nextSession || null);
            });
        } catch (e) {
            console.error('[Auth] initSupabaseAuth failed:', e);
            setAccountUIState({ signedIn: false, message: 'Account login unavailable (config error).' });
            syncAuthRequiredGate('off');
            syncSoftAuthBannerVisibility(false);
        }
    }

    async function authSignInEmail() {
        if (!supabaseClient) return rt().call.showStatus('Auth not configured', 'error');
        var email = document.getElementById('authEmail')?.value?.trim();
        var password = document.getElementById('authPassword')?.value || '';
        if (!email || !password) return rt().call.showStatus('Enter email + password', 'error');

        var result = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
        if (result.error) return rt().call.showStatus(result.error.message || 'Sign-in failed', 'error');
        rt().call.showStatus('Signed in', 'success');
    }

    async function authSignUpEmail() {
        if (!supabaseClient) return rt().call.showStatus('Auth not configured', 'error');
        var email = document.getElementById('authEmail')?.value?.trim();
        var password = document.getElementById('authPassword')?.value || '';
        if (!email || !password) return rt().call.showStatus('Enter email + password', 'error');

        var result = await supabaseClient.auth.signUp({ email: email, password: password });
        if (result.error) return rt().call.showStatus(result.error.message || 'Sign-up failed', 'error');
        rt().call.showStatus('Account created. Check your email if confirmation is required.', 'success');
    }

    async function authSignInProvider(provider) {
        if (!supabaseClient) return rt().call.showStatus('Auth not configured', 'error');
        var result = await supabaseClient.auth.signInWithOAuth({
            provider: provider,
            options: { redirectTo: window.location.origin },
        });
        if (result.error) return rt().call.showStatus(result.error.message || 'OAuth sign-in failed', 'error');
    }

    async function authSignOut() {
        if (!supabaseClient) return;
        var result = await supabaseClient.auth.signOut();
        if (result.error) return rt().call.showStatus(result.error.message || 'Sign-out failed', 'error');
        rt().call.showStatus('Signed out', 'info');
    }

    async function refreshPromoCodeSection(session) {
        var block = document.getElementById('promoCodeBlock');
        var guestNote = document.getElementById('promoCodeGuestNote');
        var formWrap = document.getElementById('promoCodeFormWrap');
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
            var summary = document.getElementById('promoEntitlementSummary');
            if (summary) summary.textContent = '';
        }
    }

    async function loadPromoEntitlementStatus() {
        var summary = document.getElementById('promoEntitlementSummary');
        if (!summary) return;
        var token = await getSupabaseAccessToken();
        if (!token) {
            summary.textContent = '';
            return;
        }
        try {
            var authResult = await fetchJsonWithAuth('/api/coupons/status');
            var res = authResult.res;
            var data = authResult.data;
            if (res.status === 401 || !res.ok || !data.success) {
                summary.textContent = '';
                return;
            }
            if (data.lifetime) {
                summary.textContent = 'Promo access: lifetime.';
                summary.style.color = '#2e7d32';
            } else if (data.trial_active && data.trial_expires_at) {
                var d = new Date(data.trial_expires_at * 1000);
                summary.textContent = 'Promo access: trial until ' + d.toLocaleString() + '.';
                summary.style.color = '#1565c0';
            } else {
                summary.textContent = 'Promo access: none applied.';
                summary.style.color = '#666';
            }
        } catch (_e) {
            summary.textContent = '';
        }
    }

    async function redeemPromoCode() {
        var input = document.getElementById('promoCodeInput');
        var statusEl = document.getElementById('promoCodeStatus');
        var code = input?.value?.trim();
        if (!code) {
            if (statusEl) statusEl.textContent = 'Enter a code.';
            return;
        }
        if (statusEl) statusEl.textContent = 'Applying…';
        try {
            var authResult = await fetchJsonWithAuth('/api/coupons/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code }),
            });
            var data = authResult.data;
            if (data.success) {
                rt().call.showStatus(data.message || 'Code applied', 'success');
                if (statusEl) statusEl.textContent = data.message || 'Applied.';
                if (input) input.value = '';
                await loadPromoEntitlementStatus();
            } else {
                if (statusEl) statusEl.textContent = data.error || 'Could not apply code.';
                rt().call.showStatus(data.error || 'Could not apply code', 'error');
            }
        } catch (_e) {
            if (statusEl) statusEl.textContent = 'Network error.';
            rt().call.showStatus('Could not apply code', 'error');
        }
    }

    async function getSupabaseAccessToken() {
        try {
            if (!supabaseClient) return null;
            var sessionData = await supabaseClient.auth.getSession();
            return sessionData.data?.session?.access_token || null;
        } catch (_e) {
            return null;
        }
    }

    async function fetchJsonWithAuth(url, options) {
        if (options === undefined) options = {};
        var token = await getSupabaseAccessToken();
        if (!token) {
            return {
                res: { status: 401, ok: false, headers: { get: function () { return ''; } } },
                data: { success: false, error: 'Unauthorized' },
            };
        }
        var headers = Object.assign({}, options.headers || {});
        headers.Authorization = 'Bearer ' + token;
        var res = await fetch(url, Object.assign({}, options, { headers: headers }));
        var contentType = res.headers.get('content-type') || '';
        var data = contentType.includes('application/json') ? await res.json() : await res.text();
        return { res: res, data: data };
    }

    function getSupabaseClient() {
        return supabaseClient;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        win.authSignInEmail = authSignInEmail;
        win.authSignUpEmail = authSignUpEmail;
        win.authSignInProvider = authSignInProvider;
        win.authSignOut = authSignOut;
        win.redeemPromoCode = redeemPromoCode;
    }

    var api = {
        bind: bind,
        openVoyagerPremiumSection: openVoyagerPremiumSection,
        applySupportLinksFromConfig: applySupportLinksFromConfig,
        startStripeSubscriptionCheckout: startStripeSubscriptionCheckout,
        voyagrDismissSoftAuthBanner: voyagrDismissSoftAuthBanner,
        voyagrOpenSignInFromBanner: voyagrOpenSignInFromBanner,
        authGateStripeContinue: authGateStripeContinue,
        authGateStripeSkip: authGateStripeSkip,
        authSignInEmailGate: authSignInEmailGate,
        authSignUpEmailGate: authSignUpEmailGate,
        initSupabaseAuth: initSupabaseAuth,
        authSignInEmail: authSignInEmail,
        authSignUpEmail: authSignUpEmail,
        authSignInProvider: authSignInProvider,
        authSignOut: authSignOut,
        redeemPromoCode: redeemPromoCode,
        getSupabaseAccessToken: getSupabaseAccessToken,
        fetchJsonWithAuth: fetchJsonWithAuth,
        getSupabaseClient: getSupabaseClient,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSupabaseAuthOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
