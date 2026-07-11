/**
 * @file toggle-ui glue tests (REAL module: modules/ui/toggle-ui.js)
 *
 * Behaviour-first tests for the shared on/off toggle glue extracted from the monolith:
 * button styling, DOM application against real jsdom elements, and boolean-preference
 * persistence against an explicit in-memory Storage.
 */

const T = require('../../modules/ui/toggle-ui.js');

function memoryStorage() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        _map: m,
    };
}

describe('toggle-ui (real module)', () => {
    describe('toggleButtonStyle', () => {
        test('enabled -> green active style', () => {
            expect(T.toggleButtonStyle(true)).toEqual({
                active: true, background: '#4CAF50', borderColor: '#4CAF50',
            });
        });

        test('disabled -> grey inactive style', () => {
            expect(T.toggleButtonStyle(false)).toEqual({
                active: false, background: '#ddd', borderColor: '#999',
            });
        });

        test('honours colour overrides', () => {
            const s = T.toggleButtonStyle(false, { inactiveBackground: '#ccc', inactiveBorder: '#aaa' });
            expect(s.background).toBe('#ccc');
            expect(s.borderColor).toBe('#aaa');
        });

        test('coerces truthy/falsy inputs to booleans', () => {
            expect(T.toggleButtonStyle(1).active).toBe(true);
            expect(T.toggleButtonStyle(0).active).toBe(false);
        });

        test('optional text colours when activeColor/inactiveColor provided', () => {
            const on = T.toggleButtonStyle(true, { activeColor: 'white', inactiveColor: '#333' });
            expect(on.color).toBe('white');
            const off = T.toggleButtonStyle(false, { activeColor: 'white', inactiveColor: '#333' });
            expect(off.color).toBe('#333');
        });
    });

    describe('applyToggleButton', () => {
        test('adds active class and green styling when enabled', () => {
            const el = document.createElement('button');
            const style = T.applyToggleButton(el, true);
            expect(el.classList.contains('active')).toBe(true);
            // jsdom normalises `background` to rgb() but leaves borderColor as hex.
            expect(el.style.background).toBe('rgb(76, 175, 80)'); // #4CAF50 normalised
            expect(el.style.borderColor).toMatch(/#4caf50|rgb\(76, 175, 80\)/i);
            expect(style).toEqual({ active: true, background: '#4CAF50', borderColor: '#4CAF50' });
        });

        test('removes active class and greys out when disabled', () => {
            const el = document.createElement('button');
            el.classList.add('active');
            T.applyToggleButton(el, false);
            expect(el.classList.contains('active')).toBe(false);
            expect(el.style.background).toBe('rgb(221, 221, 221)'); // #ddd
        });

        test('null element is a safe no-op that still returns the style', () => {
            expect(() => T.applyToggleButton(null, true)).not.toThrow();
            expect(T.applyToggleButton(null, true).active).toBe(true);
        });

        test('applies optional text colour when colour opts provided', () => {
            const el = document.createElement('button');
            T.applyToggleButton(el, true, { activeColor: 'white', inactiveColor: '#333' });
            expect(el.style.color).toBe('white');
            T.applyToggleButton(el, false, { activeColor: 'white', inactiveColor: '#333' });
            expect(el.style.color).toBe('rgb(51, 51, 51)');
        });
    });

    describe('readBoolPref / writeBoolPref', () => {
        test('reads stored true/false', () => {
            const s = memoryStorage();
            s.setItem('k', 'true');
            expect(T.readBoolPref('k', false, s)).toBe(true);
            s.setItem('k', 'false');
            expect(T.readBoolPref('k', true, s)).toBe(false);
        });

        test('returns the default when key is absent', () => {
            const s = memoryStorage();
            expect(T.readBoolPref('missing', true, s)).toBe(true);
            expect(T.readBoolPref('missing', false, s)).toBe(false);
        });

        test('write persists canonical "true"/"false" strings', () => {
            const s = memoryStorage();
            T.writeBoolPref('k', true, s);
            expect(s.getItem('k')).toBe('true');
            T.writeBoolPref('k', false, s);
            expect(s.getItem('k')).toBe('false');
        });

        test('round-trips through write then read', () => {
            const s = memoryStorage();
            T.writeBoolPref('feature', true, s);
            expect(T.readBoolPref('feature', false, s)).toBe(true);
        });
    });

    describe('nextToggleState', () => {
        test('flips the boolean', () => {
            expect(T.nextToggleState(false)).toBe(true);
            expect(T.nextToggleState(true)).toBe(false);
        });
    });

    describe('applyLabeledToggleButton', () => {
        test('exports shared label colour opts', () => {
            expect(T.LABELED_TOGGLE_OPTS).toEqual({ activeColor: 'white', inactiveColor: '#333' });
        });

        test('applies white label colour when enabled', () => {
            const el = document.createElement('button');
            T.applyLabeledToggleButton(el, true);
            expect(el.style.color).toBe('white');
            expect(el.classList.contains('active')).toBe(true);
        });
    });
});
