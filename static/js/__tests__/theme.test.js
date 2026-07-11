/**
 * Tests for modules/ui/theme.js
 */
const Theme = require('../modules/ui/theme.js');

describe('theme module', () => {
    describe('shouldUseDarkMode', () => {
        test('dark theme always true', () => {
            expect(Theme.shouldUseDarkMode('dark', false)).toBe(true);
        });
        test('light theme always false', () => {
            expect(Theme.shouldUseDarkMode('light', true)).toBe(false);
        });
        test('auto follows system preference', () => {
            expect(Theme.shouldUseDarkMode('auto', true)).toBe(true);
            expect(Theme.shouldUseDarkMode('auto', false)).toBe(false);
        });
    });

    describe('toggleBetweenLightAndDark', () => {
        test('toggles dark to light and vice versa', () => {
            expect(Theme.toggleBetweenLightAndDark('dark')).toBe('light');
            expect(Theme.toggleBetweenLightAndDark('light')).toBe('dark');
            expect(Theme.toggleBetweenLightAndDark('auto')).toBe('dark');
        });
    });

    describe('activeThemeButtonId', () => {
        test('maps theme to button id', () => {
            expect(Theme.activeThemeButtonId('light')).toBe('themeLight');
            expect(Theme.activeThemeButtonId('dark')).toBe('themeDark');
            expect(Theme.activeThemeButtonId('auto')).toBe('themeAuto');
            expect(Theme.activeThemeButtonId('unknown')).toBeNull();
        });
    });
});
