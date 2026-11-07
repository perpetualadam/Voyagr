/* Real Chromium + bundled MapLibre, synthetic background style and API responses.
 * No tile/provider/GPS calls; this is not production or physical-device acceptance.
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
   if(r.request().url().includes('/api/traffic-lights/area?'))return r.fulfill({json:{success:true,traffic_lights:[{lat:53.5,lon:-1.19}],coverage:{status:'PARTIAL',response_state:'VALID_WITH_DATA'}}});
   if(r.request().url().endsWith('/api/traffic-lights'))return r.fulfill({json:{success:true,lights:mode==='data'?[{id:'mapped',lat:53.5,lng:-1.19,name:'<img src=x onerror=alert(1)>'}]:[],coverage:{status:mode==='failure'?'UNKNOWN':'PARTIAL',response_state:mode==='empty'?'VALID_EMPTY':mode==='failure'?'UNAVAILABLE':'VALID_WITH_DATA'}}});
   if(r.request().url().startsWith('https://fixture.test'))return r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="map" style="position:absolute;inset:0 0 110px"></div><p id="routeTrafficLightStatus" style="position:absolute;bottom:0"></p><button id="trafficLightsToggle">Traffic lights</button><p id="osmTrafficLightDataStatus"></p><button id="showOsmTrafficLightsToggle">Map signals</button></body></html>'});
   return r.abort();
  });
  await page.goto('https://fixture.test/');
  await page.addStyleTag({content:read('static/vendor/maplibre-gl.css')});
  await page.addScriptTag({content:read('static/vendor/maplibre-gl.js')});
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   window.map=new maplibregl.Map({container:'map',style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#ddd'}}]},center:[-1.19,53.5],zoom:15,attributionControl:false});
   map.once('load',resolve);map.once('error',e=>reject(Error('Synthetic MapLibre style failed')));
  }));
  await page.addScriptTag({content:read('static/js/modules/traffic-lights.js')});
  await page.evaluate(()=>TrafficLights.plotTrafficLightsOnRoute([[53.5,-1.2],[53.5,-1.18]]));
  assert.equal(await page.locator('.traffic-light-marker').count(),1);
  const marker=await page.locator('.traffic-light-marker').boundingBox();assert(marker&&marker.x>=0&&marker.x<width);
  await page.locator('.traffic-light-marker').click();assert((await page.locator('.traffic-light-popup').innerText()).includes('Unknown'));assert.equal(await page.locator('.traffic-light-popup img').count(),0);
  assert((await page.locator('#routeTrafficLightStatus').innerText()).includes('Live signal state is unavailable'));
  mode='empty';await page.evaluate(()=>TrafficLights.plotTrafficLightsOnRoute([[53.5,-1.2],[53.5,-1.18]]));assert.equal(await page.locator('.traffic-light-marker').count(),0);assert((await page.locator('#routeTrafficLightStatus').innerText()).includes('No mapped'));
  mode='failure';await page.evaluate(()=>TrafficLights.plotTrafficLightsOnRoute([[53.5,-1.2],[53.5,-1.18]]));assert((await page.locator('#routeTrafficLightStatus').innerText()).includes('unavailable'));
  for(const file of ['static/js/maplibre-helpers.js','static/js/modules/map/map-overlay-toggles.js','static/js/modules/map/osm-map-icons.js','static/js/modules/ui/toggle-ui.js','static/js/app/map-overlay-orchestration.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(async()=>{
   VoyagrMapOverlayOrchestration.bind({getMap:()=>map,mapOverlayToggles:()=>VoyagrMapOverlayToggles,toggleUI:()=>VoyagrToggleUI,osmMapIcons:()=>VoyagrOsmMapIcons,getMapLibreHelpers:()=>MapLibreHelpers,call:{saveAllSettings:()=>{}}});
   VoyagrMapOverlayOrchestration.setShowOsmTrafficLightsEnabled(false);
   await VoyagrMapOverlayOrchestration.toggleShowOsmTrafficLights();
  });
  assert.equal(await page.evaluate(()=>osmTrafficLightMarkers.length),1);
  assert((await page.locator('#osmTrafficLightDataStatus').innerText()).includes('Live signal state is unavailable'));
  await page.evaluate(()=>{VoyagrMapOverlayOrchestration.toggleShowOsmTrafficLights();TrafficLights.toggleTrafficLights();map.remove();});assert.equal(await page.evaluate(()=>osmTrafficLightMarkers.length),0);await page.close();
 }
 console.log('Traffic-light overlays: portrait and landscape Chromium + MapLibre marker/popup/coverage checks passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
