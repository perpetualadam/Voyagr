/**
 * @jest-environment jsdom
 * @file Tests for app/gesture-control-orchestration.js stubs after shake UI removal.
 */

describe('gesture-control-orchestration stubs', () => {
    let Orchestration;
    let gestureControl;

    beforeEach(() => {
        jest.resetModules();
        gestureControl = require('../modules/navigation/gesture-control.js');
        Orchestration = require('../app/gesture-control-orchestration.js');

        document.body.innerHTML = '';

        Orchestration.bind({
            gestureControl: () => gestureControl,
            toggleUI: () => ({
                applyToggleButton: jest.fn(),
            }),
            call: {
                showStatus: jest.fn(),
            },
        });
    });

    test('updateGestureSensitivity no-ops when sensitivity control is missing', () => {
        expect(document.getElementById(gestureControl.GESTURE_SENSITIVITY_ID)).toBeNull();
        expect(() => Orchestration.updateGestureSensitivity()).not.toThrow();
    });

    test('updateGestureAction no-ops when action control is missing', () => {
        expect(document.getElementById(gestureControl.GESTURE_ACTION_ID)).toBeNull();
        expect(() => Orchestration.updateGestureAction()).not.toThrow();
    });
});
