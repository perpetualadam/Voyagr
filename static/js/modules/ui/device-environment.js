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

    /**
     * @param {string} title
     * @param {string} message
     * @returns {string}
     */
    function buildInAppNotificationHtml(title, message) {
        return (
            '<div style="display: flex; justify-content: space-between; align-items: start;">' +
                '<div>' +
                    '<div style="font-weight: bold; margin-bottom: 4px;">' + (title || '') + '</div>' +
                    '<div style="font-size: 14px; opacity: 0.9;">' + (message || '') + '</div>' +
                '</div>' +
                '<button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; cursor: pointer; font-size: 18px;">×</button>' +
            '</div>'
        );
    }

    /**
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
            'padding:14px 16px',
            'background:#E3F2FD',
            'border:2px solid #2196F3',
            'border-radius:14px',
            'box-shadow:0 8px 28px rgba(0,0,0,.22)',
            'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
            'font-size:15px',
            'color:#0d47a1',
            'text-align:center',
        ].join(';');
    }

    /**
     * @param {string} line
     * @param {string} detail
     * @returns {string}
     */
    function buildVolumeHintBannerHtml(line, detail) {
        return (
            '<div style="display:flex;justify-content:flex-end;margin:-4px -4px 4px 0;">' +
                '<button type="button" id="volumeHintDismiss" aria-label="Dismiss" title="Dismiss" ' +
                    'style="border:none;background:transparent;color:#1565c0;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;">×</button>' +
            '</div>' +
            '<strong style="display:block;margin-bottom:6px;">🔊 Check volume</strong>' +
            '<span>' + (line || '') + '</span><br>' +
            '<span style="font-size:13px;opacity:.9">' + (detail || '') + '</span>' +
            '<div style="margin-top:10px;">' +
                '<button type="button" id="volumeHintOk" style="padding:8px 18px;border:none;border-radius:10px;' +
                    'background:#2196F3;color:#fff;font-weight:600;cursor:pointer;font-size:14px;">OK</button>' +
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

    var api = {
        VOLUME_HINT_BANNER_ID: VOLUME_HINT_BANNER_ID,
        ENV_HINT_MIN_MS: ENV_HINT_MIN_MS,
        ENV_HINT_MESSAGES: ENV_HINT_MESSAGES,
        VOLUME_HINT: VOLUME_HINT,
        buildInAppNotificationHtml: buildInAppNotificationHtml,
        getVolumeHintBannerStyleCssText: getVolumeHintBannerStyleCssText,
        buildVolumeHintBannerHtml: buildVolumeHintBannerHtml,
        buildShowVolumeHintExecutePlan: buildShowVolumeHintExecutePlan,
        buildNavStartVolumeHintSchedulePlan: buildNavStartVolumeHintSchedulePlan,
        buildOpenVolumeHintSchedulePlan: buildOpenVolumeHintSchedulePlan,
        OPEN_VOLUME_HINT_SESSION_KEY: OPEN_VOLUME_HINT_SESSION_KEY,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDeviceEnvironment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
