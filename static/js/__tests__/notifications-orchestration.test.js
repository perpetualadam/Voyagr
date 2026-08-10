/**
 * @jest-environment jsdom
 * @file Leave-animation dismiss must ignore bubbled/cancelled animationend events.
 */

global.VoyagrDeviceEnvironment = require('../modules/ui/device-environment.js');

describe('notifications-orchestration leave animationend', () => {
    let Notifications;
    let originalRaf;

    function dispatchAnimationEnd(target, animationName, bubbles) {
        const event = new Event('animationend', {
            bubbles: bubbles !== false,
            cancelable: true,
        });
        Object.defineProperty(event, 'animationName', {
            configurable: true,
            value: animationName,
        });
        target.dispatchEvent(event);
        return event;
    }

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        global.VoyagrDeviceEnvironment = require('../modules/ui/device-environment.js');
        Notifications = require('../app/notifications-orchestration.js');

        originalRaf = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => {
            cb(0);
            return 0;
        };

        document.body.innerHTML = '<div id="notificationContainer"></div>';

        Notifications.bind({
            deviceEnvironment: () => global.VoyagrDeviceEnvironment,
            getVoiceAnnouncementsEnabled: () => false,
            getRouteInProgress: () => false,
            getNavigationArrivalTriggered: () => false,
            s: jest.fn(),
            call: {
                speakMessage: jest.fn(),
                stopTurnByTurnNavigation: jest.fn(),
            },
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        global.requestAnimationFrame = originalRaf;
        document.body.innerHTML = '';
    });

    test('toast dismiss ignores progress-bar and enter animationend until leave completes', () => {
        Notifications.showInAppNotification('Title', 'Message', 'info', 5000);
        const toast = document.querySelector('.voyagr-toast');
        expect(toast).toBeTruthy();
        expect(toast.classList.contains('is-visible')).toBe(true);

        const progress = toast.querySelector('.voyagr-toast__progress-bar');
        expect(progress).toBeTruthy();

        toast.querySelector('.voyagr-toast__dismiss').click();
        expect(toast.dataset.leaving).toBe('1');
        expect(toast.classList.contains('is-leaving')).toBe(true);
        expect(toast.parentElement).toBeTruthy();

        // Bubbled progress completion must not remove the toast.
        dispatchAnimationEnd(progress, 'voyagrToastProgress', true);
        expect(document.body.contains(toast)).toBe(true);

        // Cancelled enter animation on the toast itself must not remove it.
        dispatchAnimationEnd(toast, 'voyagrToastIn', false);
        expect(document.body.contains(toast)).toBe(true);

        // Leave animation end removes the toast.
        dispatchAnimationEnd(toast, 'voyagrToastOut', false);
        expect(document.body.contains(toast)).toBe(false);
    });

    test('toast dismiss accepts mobile leave animation name', () => {
        Notifications.showInAppNotification('Title', 'Message', 'info', 5000);
        const toast = document.querySelector('.voyagr-toast');
        toast.querySelector('.voyagr-toast__dismiss').click();

        dispatchAnimationEnd(toast, 'voyagrToastOutMobile', false);
        expect(document.body.contains(toast)).toBe(false);
    });

    test('volume hint dismiss ignores enter animationend until leave completes', () => {
        Notifications.showVolumeHintForNavigation();
        const chip = document.getElementById('volumeHintBanner') ||
            document.querySelector('.voyagr-volume-hint');
        expect(chip).toBeTruthy();
        expect(chip.classList.contains('is-visible')).toBe(true);

        chip.querySelector('#volumeHintDismiss').click();
        expect(chip.dataset.leaving).toBe('1');
        expect(chip.classList.contains('is-leaving')).toBe(true);
        expect(document.body.contains(chip)).toBe(true);

        dispatchAnimationEnd(chip, 'voyagrVolumeIn', false);
        expect(document.body.contains(chip)).toBe(true);

        dispatchAnimationEnd(chip, 'voyagrVolumeOut', false);
        expect(document.body.contains(chip)).toBe(false);
    });
});
