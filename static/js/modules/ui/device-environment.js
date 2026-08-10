/**
 * @file Pure device environment hint copy and notification/banner HTML (no DOM).
 * @module modules/ui/device-environment
 */
(function (root) {
    'use strict';

    var VOLUME_HINT_BANNER_ID = 'volumeHintBanner';
    var ENV_HINT_MIN_MS = 45000;

    var ENV_HINT_MESSAGES = {
        offline: {
            title: 'No internet connection',
            message:
                'You are offline. New routes, search, and live data need a connection. Saved routes and GPS can still work when location is allowed.',
            type: 'warning',
        },
        online: {
            title: 'Back online',
            message: 'Connection restored. Live routing and updates are available again.',
            type: 'success',
        },
        gps: {
            title: 'Location blocked',
            message:
                'Enable location access for this site in your browser or system settings so GPS navigation and position updates work.',
            type: 'warning',
        },
    };

    var VOLUME_HINT = {
        line: 'Turn your device volume up to hear turn-by-turn directions.',
        detail: 'Browsers cannot detect mute or low volume.',
        spokenLine: 'Turn your device volume up to hear spoken directions.',
        notificationTitle: 'Voice guidance',
        autoDismissMs: 14000,
    };

    var TOAST_ICONS = {
        info: 'ℹ️',
        success: '✓',
        warning: '!',
        error: '✕',
    };

    /**
     * Escape a value for safe insertion into HTML text.
     * @param {*} value
     * @returns {string}
     */
    function escapeHtml(value) {
        if (root.VoyagrHtml && typeof root.VoyagrHtml.escapeHtml === 'function') {
            return root.VoyagrHtml.escapeHtml(value);
        }
        if (value === null || value === undefined) return '';
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    /**
     * @param {string} type
     * @returns {string}
     */
    function normalizeToastType(type) {
        var t = String(type || 'info').toLowerCase();
        if (t === 'success' || t === 'warning' || t === 'error' || t === 'info') return t;
        return 'info';
    }

    /**
     * Build inner HTML for an in-app toast card (outer element is created by orchestration).
     * @param {string} title
     * @param {string} message
     * @param {string} [type]
     * @returns {string}
     */
    function buildInAppNotificationHtml(title, message, type) {
        var kind = normalizeToastType(type);
        var icon = TOAST_ICONS[kind] || TOAST_ICONS.info;
        var safeTitle = escapeHtml(title);
        var safeMessage = escapeHtml(message);
        var messageHtml = safeMessage
            ? '<p class="voyagr-toast__message">' + safeMessage + '</p>'
            : '';

        return (
            '<span class="voyagr-toast__icon" aria-hidden="true">' + icon + '</span>' +
            '<div class="voyagr-toast__body">' +
                '<p class="voyagr-toast__title">' + safeTitle + '</p>' +
                messageHtml +
            '</div>' +
            '<button type="button" class="voyagr-toast__dismiss" aria-label="Dismiss notification" title="Dismiss">×</button>' +
            '<div class="voyagr-toast__progress" aria-hidden="true">' +
                '<span class="voyagr-toast__progress-bar"></span>' +
            '</div>'
        );
    }

    /**
     * @deprecated Prefer CSS class voyagr-volume-hint; kept for tests/compat.
     * @returns {string}
     */
    function getVolumeHintBannerStyleCssText() {
        return [
            'position:fixed',
            'left:50%',
            'bottom:max(108px, calc(env(safe-area-inset-bottom, 0px) + 88px))',
            'transform:translateX(-50%)',
            'z-index:10001',
            'max-width:min(420px,92vw)',
        ].join(';');
    }

    /**
     * @param {string} line
     * @param {string} detail
     * @returns {string}
     */
    function buildVolumeHintBannerHtml(line, detail) {
        return (
            '<div class="voyagr-volume-hint__toolbar">' +
                '<button type="button" id="volumeHintDismiss" class="voyagr-volume-hint__dismiss" ' +
                    'aria-label="Dismiss" title="Dismiss">×</button>' +
            '</div>' +
            '<div class="voyagr-volume-hint__row">' +
                '<span class="voyagr-volume-hint__icon" aria-hidden="true">🔊</span>' +
                '<div class="voyagr-volume-hint__copy">' +
                    '<strong class="voyagr-volume-hint__title">Check volume</strong>' +
                    '<span class="voyagr-volume-hint__line">' + escapeHtml(line) + '</span>' +
                    '<span class="voyagr-volume-hint__detail">' + escapeHtml(detail) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="voyagr-volume-hint__actions">' +
                '<button type="button" id="volumeHintOk" class="voyagr-volume-hint__ok">Got it</button>' +
            '</div>'
        );
    }

    /**
     * Execute plan for showing the navigation volume reminder banner/toast.
     * @param {Object} [input]
     * @param {boolean} [input.voiceAnnouncementsEnabled]
     * @returns {Object}
     */
    function buildShowVolumeHintExecutePlan(input) {
        input = input || {};
        return {
            shouldShow: true,
            speakIfVoiceEnabled: !!input.voiceAnnouncementsEnabled,
            spokenLine: VOLUME_HINT.spokenLine,
            spokenPriority: 'high',
            bannerId: VOLUME_HINT_BANNER_ID,
            bannerClassName: 'voyagr-volume-hint',
            bannerStyleCssText: getVolumeHintBannerStyleCssText(),
            bannerHtml: buildVolumeHintBannerHtml(VOLUME_HINT.line, VOLUME_HINT.detail),
            dismissButtonId: 'volumeHintDismiss',
            okButtonId: 'volumeHintOk',
            autoDismissMs: VOLUME_HINT.autoDismissMs,
            showNotification: true,
            notificationTitle: VOLUME_HINT.notificationTitle,
            notificationBody: VOLUME_HINT.line + ' ' + VOLUME_HINT.detail,
            notificationTag: 'voyagr-volume-hint',
            notificationSilent: true,
            notificationIcon: '/favicon.ico',
        };
    }

    /**
     * Schedule plan for deferring the volume hint after navigation starts.
     * @param {Object} [input]
     * @param {number} [input.delayMs]
     * @returns {Object}
     */
    function buildNavStartVolumeHintSchedulePlan(input) {
        input = input || {};
        return {
            shouldSchedule: Number.isFinite(input.delayMs) && input.delayMs >= 0,
            delayMs: input.delayMs != null ? input.delayMs : 2600,
            action: 'showVolumeHintForNavigation',
            errorLogPrefix: '[EnvHint] volume hint:',
            scheduleErrorLogPrefix: '[EnvHint] volume hint schedule:',
        };
    }

    var OPEN_VOLUME_HINT_SESSION_KEY = 'voyagr_volume_hint_on_open_shown';

    /**
     * Schedule plan for showing volume hint once per tab session on app open.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildOpenVolumeHintSchedulePlan(input) {
        input = input || {};
        var alreadyShown = !!input.alreadyShown;
        return {
            shouldSchedule: !alreadyShown,
            sessionStorageKey: OPEN_VOLUME_HINT_SESSION_KEY,
            sessionStorageValue: 'true',
            delayMs: input.delayMs != null ? input.delayMs : 1800,
            action: 'showVolumeHintForNavigation',
            errorLogPrefix: '[EnvHint] open volume hint:',
            scheduleErrorLogPrefix: '[EnvHint] open volume hint schedule:',
        };
    }

    /**
     * Listener registration plan for device environment hints on app init.
     * Connectivity hints are skipped when offline-navigation owns banner/status handling.
     * @param {Object} [input]
     * @param {boolean} [input.connectivityHandledElsewhere]
     * @param {boolean} [input.initiallyOffline]
     * @returns {Object}
     */
    function buildInitDeviceEnvironmentListenersPlan(input) {
        input = input || {};
        var connectivityElsewhere = !!input.connectivityHandledElsewhere;
        return {
            registerConnectivityListeners: !connectivityElsewhere,
            notifyInitialOffline: !connectivityElsewhere && !!input.initiallyOffline,
            registerGpsPermissionListener: true,
            offlineChannel: 'offline',
            onlineChannel: 'online',
            gpsChannel: 'gps',
        };
    }

    var api = {
        VOLUME_HINT_BANNER_ID: VOLUME_HINT_BANNER_ID,
        ENV_HINT_MIN_MS: ENV_HINT_MIN_MS,
        ENV_HINT_MESSAGES: ENV_HINT_MESSAGES,
        VOLUME_HINT: VOLUME_HINT,
        TOAST_ICONS: TOAST_ICONS,
        escapeHtml: escapeHtml,
        normalizeToastType: normalizeToastType,
        buildInAppNotificationHtml: buildInAppNotificationHtml,
        getVolumeHintBannerStyleCssText: getVolumeHintBannerStyleCssText,
        buildVolumeHintBannerHtml: buildVolumeHintBannerHtml,
        buildShowVolumeHintExecutePlan: buildShowVolumeHintExecutePlan,
        buildNavStartVolumeHintSchedulePlan: buildNavStartVolumeHintSchedulePlan,
        buildOpenVolumeHintSchedulePlan: buildOpenVolumeHintSchedulePlan,
        buildInitDeviceEnvironmentListenersPlan: buildInitDeviceEnvironmentListenersPlan,
        OPEN_VOLUME_HINT_SESSION_KEY: OPEN_VOLUME_HINT_SESSION_KEY,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDeviceEnvironment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
