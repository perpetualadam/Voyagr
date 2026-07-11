/**
 * Tests for modules/map/map-theme.js
 */
const MT = require('../modules/map/map-theme.js');

describe('map-theme module', () => {
    test('resolveMapThemeName accepts string or event dataset', () => {
        expect(MT.resolveMapThemeName('dark')).toBe('dark');
        expect(MT.resolveMapThemeName({
            target: { dataset: { theme: 'satellite' } },
        })).toBe('satellite');
        expect(MT.resolveMapThemeName({})).toBe(MT.DEFAULT_MAP_THEME);
    });

    test('buildMapThemeStyleUrlsPlan applies fallback style for vector themes', () => {
        const plan = MT.buildMapThemeStyleUrlsPlan({
            theme: 'standard',
            preferredFallbackStyleUrl: '/fallback/style.json',
            toAbs: (url) => 'https://app.test' + url,
        });
        expect(plan.styleUrls.standard).toBe('/fallback/style.json');
        expect(plan.styleUrls.dark).toBe('/fallback/style.json');
        expect(plan.chosenUrl).toBe('https://app.test/fallback/style.json');
    });

    test('buildSetMapThemeExecutePlan skips reload when theme unchanged', () => {
        const execute = MT.buildSetMapThemeExecutePlan({
            themeOrEvent: 'standard',
            currentMapTheme: 'standard',
            hasMap: true,
        });
        expect(execute.skipStyleReload).toBe(true);
        expect(execute.storageKey).toBe(MT.MAP_THEME_STORAGE_KEY);
        expect(execute.persistApiBody).toEqual({ map_theme: 'standard' });
    });
});
