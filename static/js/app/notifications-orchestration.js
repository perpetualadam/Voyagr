/**
 * @file In-app and browser notification orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var lastNotificationTime = 0;
    var NOTIFICATION_THROTTLE_MS = 3000;
    var _envHintLast = { offline: 0, online: 0, gps: 0, volume: 0 };

    function rt() {
        if (!runtime) {
            throw new Error('[Notifications] Orchestration runtime not bound');
        }
        return runtime;
    }

    function DE() { return rt().deviceEnvironment(); }

    function sendNotification(title, message, type) {
        if (type === undefined) type = 'info';
        const now = Date.now();
        if (now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) {
            return;
        }
        lastNotificationTime = now;

        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const notification = new Notification(title, {
                    body: message,
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: type,
                    requireInteraction: type === 'warning' || type === 'error'
                });

                if (type !== 'warning' && type !== 'error') {
                    setTimeout(() => notification.close(), 5000);
                }

                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };
            } catch (e) {
                console.log('Notification error:', e);
            }
        }

        showInAppNotification(title, message, type);
    }

    function showInAppNotification(title, message, type, durationMs) {
        if (type === undefined) type = 'info';
        const notifContainer = document.getElementById('notificationContainer');
        if (!notifContainer) {
            console.log('Notification container not found');
            return;
        }

        const notif = document.createElement('div');
        notif.className = `in-app-notification notification-${type}`;
        notif.innerHTML = DE().buildInAppNotificationHtml(title, message);

        notifContainer.appendChild(notif);

        const ttl = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 5000;
        setTimeout(() => {
            if (notif.parentElement) {
                notif.remove();
            }
        }, ttl);
    }

    function sendEnvironmentHint(channel, title, message, type) {
        if (type === undefined) type = 'warning';
        const mod = DE();
        const now = Date.now();
        if (now - (_envHintLast[channel] || 0) < mod.ENV_HINT_MIN_MS) return;
        _envHintLast[channel] = now;

        showInAppNotification(title, message, type);

        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body: message,
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: `voyagr-env-${channel}`,
                    requireInteraction: type === 'warning' || type === 'error'
                });
            } catch (e) {
                console.log('[EnvHint] Notification API:', e);
            }
        }
    }

    function initDeviceEnvironmentNotifications() {
        try {
            const mod = DE();
            const hints = mod.ENV_HINT_MESSAGES;
            const listeners = mod.buildInitDeviceEnvironmentListenersPlan({
                connectivityHandledElsewhere: true,
                initiallyOffline: typeof navigator !== 'undefined' && !navigator.onLine,
            });

            const notifyOffline = () =>
                sendEnvironmentHint(listeners.offlineChannel, hints.offline.title, hints.offline.message, hints.offline.type);
            const notifyOnline = () =>
                sendEnvironmentHint(listeners.onlineChannel, hints.online.title, hints.online.message, hints.online.type);

            if (listeners.notifyInitialOffline) {
                notifyOffline();
            }

            if (listeners.registerConnectivityListeners) {
                window.addEventListener('offline', notifyOffline);
                window.addEventListener('online', notifyOnline);
            }

            if (listeners.registerGpsPermissionListener && navigator.permissions && typeof navigator.permissions.query === 'function') {
                try {
                    navigator.permissions
                        .query({ name: 'geolocation' })
                        .then((status) => {
                            const onChange = () => {
                                if (status.state === 'denied') {
                                    sendEnvironmentHint(
                                        'gps',
                                        hints.gps.title,
                                        hints.gps.message,
                                        hints.gps.type
                                    );
                                }
                            };
                            onChange();
                            status.addEventListener('change', onChange);
                        })
                        .catch(() => { /* Safari / older browsers */ });
                } catch (e) {
                    console.log('[EnvHint] permissions.query not available:', e);
                }
            }
        } catch (e) {
            console.warn('[EnvHint] initDeviceEnvironmentNotifications:', e);
        }
    }

    function showVolumeHintForNavigation() {
        const execute = DE().buildShowVolumeHintExecutePlan({
            voiceAnnouncementsEnabled: rt().getVoiceAnnouncementsEnabled(),
        });
        if (!execute.shouldShow) return;

        if (execute.speakIfVoiceEnabled) {
            try {
                rt().call.speakMessage(execute.spokenLine, execute.spokenPriority);
            } catch (e) {
                console.log('[EnvHint] volume TTS:', e);
            }
        }

        let chip = document.getElementById(execute.bannerId);
        if (chip) chip.remove();
        chip = document.createElement('div');
        chip.id = execute.bannerId;
        chip.setAttribute('role', 'status');
        chip.style.cssText = execute.bannerStyleCssText;
        chip.innerHTML = execute.bannerHtml;
        document.body.appendChild(chip);
        const dismiss = chip.querySelector('#' + execute.dismissButtonId);
        if (dismiss) dismiss.onclick = () => chip.remove();
        const ok = chip.querySelector('#' + execute.okButtonId);
        if (ok) ok.onclick = () => chip.remove();

        setTimeout(() => {
            const el = document.getElementById(execute.bannerId);
            if (el) el.remove();
        }, execute.autoDismissMs);

        if (execute.showNotification && 'Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(execute.notificationTitle, {
                    body: execute.notificationBody,
                    icon: execute.notificationIcon,
                    tag: execute.notificationTag,
                    silent: execute.notificationSilent,
                });
            } catch (e) {
                console.log('[EnvHint] volume Notification:', e);
            }
        }
    }

    function sendETANotification(eta, distance) {
        const etaTime = new Date(eta);
        const timeStr = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        sendNotification('ETA Update', `Arriving at ${timeStr} (${distance} remaining)`, 'info');
    }

    function sendArrivalNotification() {
        if (!rt().getRouteInProgress() || rt().getNavigationArrivalTriggered()) {
            return;
        }
        rt().s('navigationArrivalTriggered', true);
        sendNotification('🎉 Destination Reached', 'You have arrived at your destination', 'success');
        rt().call.speakMessage('You have arrived at your destination');
        rt().call.stopTurnByTurnNavigation();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        sendNotification: sendNotification,
        showInAppNotification: showInAppNotification,
        sendEnvironmentHint: sendEnvironmentHint,
        initDeviceEnvironmentNotifications: initDeviceEnvironmentNotifications,
        showVolumeHintForNavigation: showVolumeHintForNavigation,
        sendETANotification: sendETANotification,
        sendArrivalNotification: sendArrivalNotification,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrNotificationsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
