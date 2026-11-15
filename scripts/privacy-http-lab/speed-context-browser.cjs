'use strict';
// Full application bootstrap and real GPS/controller/DOM wiring. Only GPS and
// provider data are controlled fixtures; this is not physical-phone verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
module.exports = async function speedContextBrowser(origin, check) {
  const url = new URL(origin);
  assert.ok(url.protocol === 'http:' && url.hostname === '127.0.0.1' && ['5000', '18151'].includes(url.port), 'Disposable loopback candidate required');
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({viewport: {width: 390, height: 844},
      permissions: ['geolocation'], geolocation: {latitude: 53.524, longitude: -1.13, accuracy: 17.7}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    let primaryRelease;
    const primaryGate=new Promise(resolve=>{primaryRelease=resolve;});
    let primaryRequests=0;
    let release;
    const responseGate = new Promise(resolve => { release = resolve; });
    let requested;
    const requestSeen = new Promise(resolve => { requested = resolve; });
    await context.addInitScript(() => {
      window.__speedWatchCallbacks = 0;
      const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.watchPosition = function(success, failure, options) {
        window.__emitStationarySpeedFixture=(offset,speed,heading=0)=>{
          window.__speedWatchCallbacks++;
          success({timestamp:Date.now(),coords:{latitude:53.524+offset/111195,longitude:-1.13,accuracy:17.7,heading,speed}});
        };
        return watch(position => { window.__speedWatchCallbacks++; success(position); }, failure, options);
      };
    });
    await page.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (target.origin !== origin) return route.abort();
      if (target.pathname === '/api/speed-limit/observation') {
        primaryRequests++;
        const body=route.request().postDataJSON();
        check('Actual native GPS creates a complete primary request',
          Number.isFinite(body.lat)&&Math.abs(body.lat-53.524)<.0002&&body.lon===-1.13&&body.accuracy===17.7&&body.vehicle_type==='car');
        await primaryGate;
        return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'AVAILABLE',observation:{
          source:'TomTom',evidence_state:'MAPPED_OBSERVATION',applicable:false,speed_limit_mph:40,
          position_uncertain:true,acquired_at_ms:Date.now()}})});
      }
      if (target.pathname === '/api/road-context') {
        requested(); await responseGate;
        const now = Date.now();
        return route.fulfill({contentType: 'application/json', body: JSON.stringify({success: true, evidence_status: 'AVAILABLE', context: {
          schema_version: 1, source: 'Overpass', source_kind: 'OSM_EXTRACT', revision: 'synthetic-speed-context',
          acquired_at_ms: now, source_data_at_ms: now - 86400000, served_at_ms: now,
          bounds: [53.52, -1.134, 53.528, -1.126], coverage: 'PARTIAL', speed_observations_only: true, restrictions: [],
          roads: [{osm_way_id: 'fixture-10', node_ids: [1, 2], geometry: [[53.52, -1.13], [53.528, -1.13]], tags: {highway: 'residential', maxspeed: '30 mph'}}],
        }})});
      }
      if (target.pathname.startsWith('/map/')) return route.fulfill({contentType: 'application/json', body: JSON.stringify({
        version: 8, sources: {}, layers: [{id: 'background', type: 'background', paint: {'background-color': '#eee'}}],
      })});
      return route.continue();
    });
    await page.goto(origin, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.VoyagrLocalData && window.VoyagrSpeedWidgetOrchestration && window.VoyagrGpsOrchestration);
    await page.evaluate(() => VoyagrLocalData.ready());
    // Allow initial profile/settings hydration before requesting the real watch.
    await page.waitForTimeout(1500);
    await page.evaluate(() => VoyagrSpeedWidgetOrchestration.useGpsForSpeedWidget());
    let requestTimer;
    try {
      await Promise.race([requestSeen, new Promise((_, reject) => { requestTimer = setTimeout(() => reject(Error('GPS did not request fixture context')), 10000); })]);
    } finally { clearTimeout(requestTimer); }
    check('Full candidate starts GPS and initially shows unknown before source response', await page.evaluate(() =>
      VoyagrGpsOrchestration.getIsTrackingActive() && document.getElementById('speedLimitValue').textContent === '—'));
    const callbacks = await page.evaluate(() => window.__speedWatchCallbacks);
    release();
    await page.waitForFunction(() => document.getElementById('speedLimitValue').textContent === '30', null, {timeout: 5000});
    check('Delayed road context updates the actual widget without another GPS callback', await page.evaluate(n => window.__speedWatchCallbacks === n, callbacks));
    check('Actual widget identifies the uncertain value as Mapped est.', await page.locator('#speedLimitMappedLabel').isVisible() && await page.textContent('#speedLimitMappedLabel') === 'Mapped est.');
    check('Mapped observation never populates legal overspeed state', await page.evaluate(() => VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph() === null));
    check('Info reports the mapped acquisition reason through the common outcome contract', await page.textContent('#routeSpeedDataStatus').then(text=>text.includes('MAPPED_SPEED_CONSENSUS')));
    await page.evaluate(() => { const select=document.getElementById('speedUnit'); select.value='kmh'; select.dispatchEvent(new Event('change',{bubbles:true})); });
    check('Actual unit control converts mapped observation to km/h without losing its label', await page.textContent('#speedLimitValue')==='48' && await page.textContent('#speedLimitMappedLabel')==='Mapped est.');
    await page.evaluate(() => { const select=document.getElementById('speedUnit'); select.value='mph'; select.dispatchEvent(new Event('change',{bubbles:true})); });
    check('Actual unit control restores mapped mph without another GPS callback', await page.textContent('#speedLimitValue')==='30' && await page.evaluate(n=>window.__speedWatchCallbacks===n,callbacks));
    check('Unit changes do not promote mapped estimates into legal alert state', await page.evaluate(()=>VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph()===null));
    primaryRelease();
    await page.waitForFunction(()=>document.getElementById('speedLimitValue').textContent==='40');
    check('Actual primary request replaces the Overpass fallback without another GPS callback',primaryRequests===1&&await page.evaluate(n=>window.__speedWatchCallbacks===n,callbacks));
    check('Primary value has an estimate label and cannot authorize legal alerts',await page.textContent('#speedLimitMappedLabel')==='Provider est.'&&await page.evaluate(()=>VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph()===null));
    await page.evaluate(()=>{const select=document.getElementById('speedUnit');select.value='kmh';select.dispatchEvent(new Event('change',{bubbles:true}));});
    check('Primary estimate survives unit conversion through the shared renderer',await page.textContent('#speedLimitValue')==='64'&&await page.textContent('#speedLimitMappedLabel')==='Provider est.');
    for(const [offset,speed] of [[9,8.5],[0,0],[9,8.5],[0,0]]){
      await page.waitForTimeout(250);
      await page.evaluate(([offset,speed])=>__emitStationarySpeedFixture(offset,speed),[offset,speed]);
      check('Stationary GPS noise does not become a displayed driving speed',await page.textContent('#speedValue')==='0');
    }
    check('Stationary GPS updates retain a fresh primary limit',await page.textContent('#speedLimitValue')==='64'&&await page.textContent('#speedLimitMappedLabel')==='Provider est.');
    const previousPrimary=await page.evaluate(()=>VoyagrRoadMatchOrchestration.getPrimarySpeedObservation().acquired_at_ms);
    await page.waitForTimeout(6000);
    await page.evaluate(()=>__emitStationarySpeedFixture(0,0));
    await page.waitForFunction(previous=>VoyagrRoadMatchOrchestration.getPrimarySpeedObservation()?.acquired_at_ms>previous,previousPrimary);
    await page.waitForTimeout(250);
    await page.evaluate(()=>__emitStationarySpeedFixture(1.5,1.5,180));
    check('A bounded handset sweep from a stopped primary anchor retains the limit',await page.textContent('#speedLimitValue')==='64'&&await page.textContent('#speedLimitMappedLabel')==='Provider est.');
    check('Handset sweep remains stopped on the display and grants no legal alert authority',await page.textContent('#speedValue')==='0'&&await page.evaluate(()=>VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph()===null));
    check('Candidate uses coherent immutable assets without an asset error', await page.evaluate(() => !!window.VoyagrAssetRelease && !document.getElementById('voyagr-asset-error')));
    await page.evaluate(() => VoyagrGpsOrchestration.stopGPSTracking());
    check('Stopping GPS clears the mapped display', await page.textContent('#speedLimitValue') === '—');
    check('Full speed-context flow has no uncaught page exceptions', errors.length === 0);
    await context.close();
  } finally { await browser.close(); }
};
if (require.main === module) module.exports(process.env.VOYAGR_SPEED_TEST_ORIGIN || 'http://127.0.0.1:5000', (label, condition) => {
  assert.ok(condition, label); console.log('PASS: ' + label);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
