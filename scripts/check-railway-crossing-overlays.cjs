/* Real Chromium/MapLibre and production crossing owner/helper; synthetic map and API.
 * No production, tile, routing-provider, train-state or GPS calls.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 for(const [width,height] of [[390,844],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});let mode='data';
  await page.route('**/*',r=>{
   if(r.request().url().includes('/api/railway-crossings/area?'))return r.fulfill({json:{success:true,railway_crossings:mode==='data'?[{lat:53.505,lon:-1.195}]:[],coverage:{status:mode==='failure'?'UNKNOWN':'PARTIAL',response_state:mode==='data'?'VALID_WITH_DATA':mode==='empty'?'VALID_EMPTY':'UNAVAILABLE'}}});
   if(r.request().url().startsWith('https://fixture.test'))return r.fulfill({contentType:'text/html',body:'<!doctype html><div id="map" style="position:absolute;inset:0 0 80px"></div><p id="osmRailwayCrossingDataStatus" style="position:absolute;bottom:0"></p><button id="showOsmRailwayCrossingsToggle">Crossings</button>'});
   return r.abort();
  });
  await page.goto('https://fixture.test/');await page.addStyleTag({content:read('static/vendor/maplibre-gl.css')});await page.addScriptTag({content:read('static/vendor/maplibre-gl.js')});
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   window.map=new maplibregl.Map({container:'map',style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#ddd'}}]},center:[-1.195,53.505],zoom:15,attributionControl:false});
   map.once('load',resolve);map.once('error',()=>reject(Error('Synthetic map failed')));
  }));
  for(const file of ['static/js/maplibre-helpers.js','static/js/modules/map/map-overlay-toggles.js','static/js/modules/map/osm-map-icons.js','static/js/modules/ui/toggle-ui.js','static/js/app/map-overlay-orchestration.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(async()=>{
   VoyagrMapOverlayOrchestration.bind({getMap:()=>map,mapOverlayToggles:()=>VoyagrMapOverlayToggles,toggleUI:()=>VoyagrToggleUI,osmMapIcons:()=>VoyagrOsmMapIcons,getMapLibreHelpers:()=>MapLibreHelpers,call:{saveAllSettings:()=>{}}});
   VoyagrMapOverlayOrchestration.setShowOsmRailwayCrossingsEnabled(false);await VoyagrMapOverlayOrchestration.toggleShowOsmRailwayCrossings();
  });
  assert.equal(await page.evaluate(()=>osmRailwayCrossingMarkers.length),1);
  assert((await page.locator('#osmRailwayCrossingDataStatus').innerText()).includes('Live barrier or train state is unavailable'));
  await page.locator('.maplibregl-marker').click();assert((await page.locator('.maplibregl-popup-content').innerText()).includes('Level crossing'));assert((await page.locator('.maplibregl-popup-content').innerText()).includes('Live barrier or train state is unavailable'));
  const refresh=async()=>page.evaluate(async()=>{VoyagrMapOverlayOrchestration.setShowOsmRailwayCrossingsEnabled(false);await VoyagrMapOverlayOrchestration.toggleShowOsmRailwayCrossings();});
  mode='empty';await refresh();assert.equal(await page.locator('.maplibregl-marker').count(),0);assert((await page.locator('#osmRailwayCrossingDataStatus').innerText()).includes('No mapped'));
  mode='failure';await refresh();assert((await page.locator('#osmRailwayCrossingDataStatus').innerText()).includes('Coverage is unknown'));
  mode='data';await refresh();await page.evaluate(()=>VoyagrMapOverlayOrchestration.toggleShowOsmRailwayCrossings());assert.equal(await page.locator('.maplibregl-marker').count(),0);assert((await page.locator('#osmRailwayCrossingDataStatus').innerText()).includes('off'));
  await page.evaluate(()=>map.remove());await page.close();
 }
 console.log('Railway crossing overlays: portrait/landscape Chromium + MapLibre marker, popup, coverage and toggle checks passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
