const style = require('../../map/styles/dark/style.json');
const MT = require('../modules/map/map-theme');
const layer = id => style.layers.find(l => l.id === id);
const rgb = color => color.startsWith('#')
    ? color.slice(1).match(/../g).map(c => parseInt(c, 16))
    : color.match(/[\d.]+/g).slice(0, 3).map(Number);
const luminance = color => rgb(color).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test.each(['highway_path', 'highway_minor', 'highway_major_inner', 'highway_major_subtle', 'highway_motorway_inner', 'highway_motorway_subtle', 'road_pier'])(
    '%s remains distinguishable against dark land surfaces including opacity', id => {
        const paint = layer(id).paint;
        for (const surface of ['#141820', '#1e2630', '#181e28']) {
            const ink = rgb(paint['line-color']);
            const bg = rgb(surface);
            const alpha = paint['line-opacity'] ?? 1;
            const composited = '#' + ink.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
            expect(contrast(composited, surface)).toBeGreaterThanOrEqual(3);
        }
    }
);
test.each(style.layers.filter(l => l.id.startsWith('place_') || ['water_name', 'highway_name_other', 'highway_name_motorway'].includes(l.id)).map(l => l.id))(
    '%s uses readable text and a dark separating halo', id => {
        const p = layer(id).paint;
        expect(contrast(p['text-color'], p['text-halo-color'])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p['text-color'], '#1c2434')).toBeGreaterThanOrEqual(4.5);
        expect(p['text-halo-width']).toBeGreaterThanOrEqual(1.5);
    }
);
test('static road labels agree with the runtime dark label treatment', () => {
    const plan = MT.buildRoadLabelPaintPlan('dark');
    const p = layer('highway_name_other').paint;
    expect(p['text-color']).toBe(plan.textColor);
    expect(p['text-halo-color']).toBe(plan.textHaloColor);
});
