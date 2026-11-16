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
    test('volume reminder is compact and expires normally while idle',()=>{
        Notifications.showVolumeHintForNavigation();
        const chip=document.getElementById('volumeHintBanner');
        expect(chip.querySelector('details').open).toBe(false);
        jest.advanceTimersByTime(14000+320);
        expect(document.getElementById('volumeHintBanner')).toBeNull();
    });
    test('reading Info pauses expiry and restarting it never alters disclosure state',()=>{
        Notifications.showVolumeHintForNavigation();
        const chip=document.getElementById('volumeHintBanner'),info=chip.querySelector('details');
        info.open=true;info.dispatchEvent(new Event('toggle'));
        jest.advanceTimersByTime(60000);expect(chip.isConnected).toBe(true);expect(info.open).toBe(true);
        info.open=false;info.dispatchEvent(new Event('toggle'));
        jest.advanceTimersByTime(13999);expect(chip.dataset.leaving).not.toBe('1');
        jest.advanceTimersByTime(321);expect(chip.isConnected).toBe(false);
    });
    test('keyboard focus pauses expiry and dismissal returns focus to its opener',()=>{
        const opener=document.createElement('button');document.body.appendChild(opener);opener.focus();
        Notifications.showVolumeHintForNavigation();
        const chip=document.getElementById('volumeHintBanner'),close=chip.querySelector('#volumeHintDismiss');
        close.focus();jest.advanceTimersByTime(60000);expect(chip.isConnected).toBe(true);
        close.click();expect(document.activeElement).toBe(opener);jest.advanceTimersByTime(320);expect(chip.isConnected).toBe(false);
    });
    test('hover pauses expiry and reopening replaces only the previous reminder',()=>{
        Notifications.showVolumeHintForNavigation();const old=document.getElementById('volumeHintBanner');
        old.dispatchEvent(new Event('pointerenter'));jest.advanceTimersByTime(60000);expect(old.isConnected).toBe(true);
        Notifications.showVolumeHintForNavigation();expect(document.querySelectorAll('#volumeHintBanner')).toHaveLength(1);
        expect(old.isConnected).toBe(false);
    });

});
