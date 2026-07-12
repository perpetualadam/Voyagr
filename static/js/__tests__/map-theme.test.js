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

    test('dark map theme uses Voyagr dark style not light Positron', () => {
        expect(MT.MAP_THEME_STYLE_PATHS.dark).toBe('/static/map/styles/dark/style.json');
        const plan = MT.buildMapThemeStyleUrlsPlan({ theme: 'dark' });
        expect(plan.chosenPath).toBe('/static/map/styles/dark/style.json');
    });

    test('buildRoadLabelPaintPlan uses light text on dark basemap', () => {
        const dark = MT.buildRoadLabelPaintPlan('dark');
        expect(dark.textColor).toBe('#dde4f0');
        const light = MT.buildRoadLabelPaintPlan('standard');
        expect(light.textColor).toBe('#1a1a1a');
    });

    test('buildRouteDisplayContrastPlan brightens routes on dark basemap', () => {
        const contrast = MT.buildRouteDisplayContrastPlan('dark');
        expect(contrast.darkBasemap).toBe(true);
        expect(contrast.routeColors[0]).toBe('#5B9EFF');
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
