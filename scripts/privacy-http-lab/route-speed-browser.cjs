'use strict';
// Complete candidate runtime with controlled GPS/provider boundaries. Lifecycle
// setters seed a GraphHopper-shaped route; this does not test engine output or
// the Start transaction, and is not physical-phone verification.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function routeSpeedBrowser(origin,check){
const u=new URL(origin);assert.ok(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&['5000','18151'].includes(u.port),'Disposable loopback candidate required');
const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
 const page=await b.newPage({viewport:{width:390,height:844}});
 const assetResponses=[];page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/_voyagr/assets/')&&r.status()>=400)assetResponses.push({status:r.status(),asset:u.pathname.split('/').pop()});});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
 let release;
 Object.defineProperty(window,'VoyagrAssetRelease',{configurable:true,get:()=>release,set(value){
 release=value;
 const enter=value.enter,complete=value.complete;let last=-1;
 value.enter=function(r,i){const accepted=enter.call(this,r,i);if(!accepted&&!window.__routeSpeedAssetFailure)window.__routeSpeedAssetFailure={incoming:i,completed:last};return accepted;};
 value.complete=function(r,i){complete.call(this,r,i);last=i;};
 }});
 });
 await page.addInitScript(()=>{let ok;Object.defineProperty(navigator,'geolocation',{value:{watchPosition(success){ok=success;return 1},clearWatch(){ok=null},getCurrentPosition(success){success({timestamp:Date.now(),coords:{latitude:53.52394,longitude:-1.13,accuracy:4,speed:5,heading:0}})}}});window.__emitRouteGps=lat=>ok({timestamp:Date.now(),coords:{latitude:lat,longitude:-1.13,accuracy:4,speed:5,heading:0}});});
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname==='/api/speed-limit/observation')return r.fulfill({contentType:'application/json',body:'{"status":"UNAVAILABLE","observation":null}'});if(u.pathname==='/api/road-context')return r.fulfill({contentType:'application/json',body:'{"success":true,"context":null,"evidence_status":"UNMATCHED"}'});if(u.pathname.startsWith('/map/'))return r.fulfill({contentType:'application/json',body:JSON.stringify({version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#eee'}}]})});if(u.pathname==='/api/route')return r.abort();return r.continue()});
 await page.goto(origin,{waitUntil:'domcontentloaded'});try {
 await page.waitForFunction(()=>window.VoyagrLocalData&&window.VoyagrGpsOrchestration&&window.VoyagrSpeedWidgetOrchestration);
 } catch(error) {
 const state=await page.evaluate(()=>({ready:document.readyState,local:!!window.VoyagrLocalData,gps:!!window.VoyagrGpsOrchestration,widget:!!window.VoyagrSpeedWidgetOrchestration,assetError:!!document.getElementById('voyagr-asset-error'),sequence:window.__routeSpeedAssetFailure||null}));
 throw Error('Route-speed bootstrap failed: '+JSON.stringify(state)+'; asset responses: '+JSON.stringify(assetResponses)+'; exception types: '+errors.map(x=>String(x).split(':')[0]).join(','));
 }await page.evaluate(()=>VoyagrLocalData.ready());
 await page.waitForTimeout(1800);
 await page.evaluate(()=>{const line=[[53.5239,-1.13],[53.524,-1.13],[53.5241,-1.13],[53.5242,-1.13],[53.53,-1.13]];
 const steps=[30,20,null,40].map((speed,i)=>({type:8,instruction:'Continue north',begin_shape_index:i,end_shape_index:i+1,speed_limit:speed,road_class:'residential'}));window.lastCalculatedRoute={id:'controlled-graphhopper',source:'GraphHopper',polyline:line,maneuvers:steps,duration_minutes:10,distance_km:1};
 const life=VoyagrNavigationLifecycleOrchestration;life.setRoutePolyline(line);life.setCurrentRouteSteps(steps);life.setRouteInProgress(true);life.setRouteStarted(true);VoyagrGpsOrchestration.startGPSTracking();});
 const expected=['—','30','20','—','40'];let i=0;
 for(const lat of [53.52394,53.52395,53.52405,53.52415,53.52425]){
  await page.waitForTimeout(120);
 await page.evaluate(lat=>__emitRouteGps(lat),lat);
 await page.waitForTimeout(50);
  const result=await page.evaluate(()=>({state:VoyagrGpsOrchestration.getNavigationPositionEvidence()?.state,
   display:document.getElementById('speedLimitValue').textContent,badge:document.getElementById('speedLimitMappedLabel').textContent,
   legal:VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph(),details:document.getElementById('routeSpeedDataStatus').textContent,
   collapsed:!document.getElementById('previewRouteInfo').open}));
  check('Full GPS route speed step '+(i+1)+' displays '+expected[i]+' with Overpass unavailable',result.display===expected[i]);
  if(i===1){
   check('Route limit retains its source label and no legal-alert state',result.badge==='Route'&&result.legal===null);
   check('Speed details distinguish selected route data and unavailable map data',result.details.includes('Route steps carrying limits: 3/4')&&result.details.includes('Road data: unavailable'));
   check('Unavailable map data retains its reason while the route value remains usable',result.details.includes('SOURCE_UNAVAILABLE'));
   check('Speed details are collapsed and omit coordinates and provider names',result.collapsed&&!/53\.52|-1\.13|GraphHopper|Valhalla|TomTom/.test(result.details));
   await page.evaluate(()=>{const select=document.getElementById('speedUnit');select.value='kmh';select.dispatchEvent(new Event('change',{bubbles:true}));});
   check('Unit control converts the selected-route observation and preserves Route label',await page.textContent('#speedLimitValue')==='48'&&await page.textContent('#speedLimitMappedLabel')==='Route');
   await page.evaluate(()=>{const select=document.getElementById('speedUnit');select.value='mph';select.dispatchEvent(new Event('change',{bubbles:true}));});
   check('Unit control restores selected-route mph without legal alert authority',await page.textContent('#speedLimitValue')==='30'&&await page.evaluate(()=>VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph()===null));
  }
  i++;
 }
 check('Full route-speed browser flow has no page exceptions',errors.length===0);
}finally{await b.close()}
};
if(require.main===module)module.exports(process.env.VOYAGR_SPEED_TEST_ORIGIN||'http://127.0.0.1:5000',(label,condition)=>{
 assert.ok(condition,label);console.log('PASS: '+label);
}).catch(e=>{console.error(e.message);process.exitCode=1});
