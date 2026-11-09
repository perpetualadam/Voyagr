// Real MapLibre rendering of production Dark paint/layout using offline geometry
// and licensed glyphs. No live tile/provider availability claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const original = JSON.parse(read('static/map/styles/dark/style.json'));
const glyphs = fs.readFileSync(path.join(root, 'static/js/__tests__/fixtures/map-glyphs/metropolis-regular-0-255.pbf'));
(async () => {
 const browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
 try {
  for (const width of [390, 1280]) for (const zoom of [5, 8, 14, 17]) {
   const page = await browser.newPage({viewport: {width, height: 844}, deviceScaleFactor: 1});
   const errors = [];
   await page.route('**/*', route => new URL(route.request().url()).pathname.includes('/fonts/')
    ? route.fulfill({contentType: 'application/x-protobuf', body: glyphs}) : route.abort());
   await page.setContent(`<style>${read('static/vendor/maplibre-gl.css')}body{margin:0}#map{width:${width}px;height:844px}</style><div id="map"></div>`);
   for (const file of ['static/vendor/maplibre-gl.js', 'static/js/maplibre-helpers.js', 'static/js/modules/map/map-theme.js']) await page.addScriptTag({content: read(file)});
   await page.evaluate(({original, zoom}) => {
    const style = structuredClone(original);
    delete style.sprite;
    style.glyphs = 'https://dark-contrast.invalid/fonts/{fontstack}/{range}.pbf';
    style.sources = {openmaptiles: {type: 'geojson', data: {type: 'FeatureCollection', features: []}}};
    for (const l of style.layers) {
     if (l['source-layer']) {
      l.filter = ['all', ['==', 'fixture_layer', l['source-layer']], ...(l.filter ? [l.filter] : [])];
      delete l['source-layer'];
     }
     if (l.layout?.['text-font']) l.layout['text-font'] = ['Metropolis Regular'];
    }
    window.map = new maplibregl.Map({container: 'map', style, center: [-1.47, 53.38], zoom, preserveDrawingBuffer: true, fadeDuration: 0});
    window.mapErrors = [];
    map.on('error', e => mapErrors.push(e.error.message));
    map.on('styleimagemissing', e => {if (!map.hasImage(e.id)) map.addImage(e.id, {width: 1, height: 1, data: new Uint8Array(4)});});
   }, {original, zoom});
   await page.waitForFunction(() => map.isStyleLoaded());
   await page.evaluate(() => {
    const w = map.getCanvas().width;
    const coord = (x, y) => map.unproject([x, y]).toArray();
    const features = [];
    const add = (source, geometry, props) => features.push({type: 'Feature', geometry, properties: {fixture_layer: source, ...props}});
    const line = y => ({type: 'LineString', coordinates: [coord(10, y), coord(w - 10, y)]});
    for (const [cls, y, label] of [['motorway', 110, 'M1'], ['primary', 240, 'FRANCES STREET'], ['minor', 360, 'KING STREET'], ['path', 440, 'PARK PATH']]) {
     add('transportation', line(y), {class: cls, brunnel: '', ramp: 0});
     if (cls === 'motorway' || cls === 'primary') add('transportation_name', line(y), {class: cls, ref: label, 'name:latin': label, 'name:nonlatin': ''});
    }
    add('water', {type: 'Polygon', coordinates: [[coord(10, 540), coord(w - 10, 540), coord(w - 10, 650), coord(10, 650), coord(10, 540)]]}, {});
    add('water_name', line(590), {'name:latin': 'RIVER DON', 'name:nonlatin': ''});
    add('place', {type: 'Point', coordinates: coord(w / 2, 730)}, {class: 'city', rank: 5, 'name:latin': 'SHEFFIELD', 'name:nonlatin': ''});
    map.getSource('openmaptiles').setData({type: 'FeatureCollection', features});
    // Apply the same runtime road label paint as the app; leave fixture zoom
    // ranges intact so this checks the static overview palette too.
    MapLibreHelpers.configureRoadLabels(map, {enabled: true, ...VoyagrMapTheme.buildRoadLabelPaintPlan('dark')});
    const H = MapLibreHelpers;
    window.route = H.addPolyline(map, [coord(w - 50, 60), coord(w - 50, 480)].map(([lon, lat]) => [lat, lon]), {color: '#5B9EFF', weight: 6});
    const [lon, lat] = coord(w - 50, 690);
    window.marker = H.createMarker(lat, lon, {html: '<div style="width:20px;height:20px;background:red;border-radius:50%"></div>', iconSize: [20,20], iconAnchor: [10,10], popup: 'Camera fixture'}).addTo(map);
   });
   await page.waitForFunction(() => map.isStyleLoaded() && map.areTilesLoaded() && map.queryRenderedFeatures({layers: ['highway_name_motorway']}).length > 0);
   await page.waitForTimeout(400); // Finish symbol placement before pixel sampling.
   const state = await page.evaluate(() => new Promise(resolve => {
    map.once('render', () => {
    const canvas = map.getCanvas();
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const sample = (x, y) => {const p = new Uint8Array(4);gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);return [...p];};
    const ids = [...new Set(map.queryRenderedFeatures().map(f => f.layer.id))];
    const rows = [110,240,360,440].map(y => Array.from({length: 17}, (_, i) => sample(25 + i * 4, y)));
    resolve({ids, rows, bg: sample(5,500), route: sample(canvas.width - 50,180), errors: mapErrors, marker: marker.getElement().isConnected, filter: getComputedStyle(canvas).filter});
    });
    map.triggerRepaint();
   }));
   errors.push(...state.errors);
   assert.deepEqual(errors, []);
   assert(state.ids.includes('highway_name_motorway'), 'Real motorway glyphs not rendered');
   if (zoom >= 14) assert(state.ids.includes('highway_name_other'), 'Real street glyphs not rendered');
   assert(state.ids.includes('water_name'), 'Real water glyphs not rendered');
   if (zoom < 14) assert(state.ids.includes('place_city'), 'Real place glyphs not rendered');
   const bright = p => (p[0] + p[1] + p[2]) / 3;
   // Antialiasing and narrow overview line widths reduce edge-pixel brightness;
   // require visible ink while the separate palette tests check nominal contrast.
   assert(Math.max(...state.rows[0].map(bright)) > bright(state.bg) + 25, 'Overview motorway disappears');
   if (zoom >= 8) assert(Math.max(...state.rows[1].map(bright)) > bright(state.bg) + 25, 'Major road disappears');
   if (zoom >= 14) {
    assert(Math.max(...state.rows[2].map(bright)) > bright(state.bg) + 25, 'Minor road disappears');
    assert(Math.max(...state.rows[3].map(bright)) > bright(state.bg) + 25, 'Dashed path disappears');
   }
   assert(state.route[2] > 200 && state.route[0] < 130, `Blue route paint altered: ${JSON.stringify(state.route)}`);
   assert(state.marker); assert.equal(state.filter, 'none');
   await page.screenshot({path: `/tmp/voyagr-dark-contrast-${width}-${zoom}.png`});
   await page.evaluate(() => marker.getElement().click());
   await page.waitForFunction(() => !!document.querySelector('.maplibregl-popup-content'));
   console.log(`${width}px zoom ${zoom}: real glyphs at visible zooms, road/path pixels, blue route and camera popup passed`);
   await page.evaluate(() => map.remove()); await page.close();
  }
 } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exit(1);});
