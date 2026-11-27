'use strict';
// Disposable UK page; registered public synthetic stops; no live navigation.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const origin=process.argv[2];assert.equal(new URL(origin).hostname,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({serviceWorkers:'block'});let phase='boot';
 try{
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname.startsWith('/map/'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(url.pathname==='/api/route')return route.continue({headers:{...route.request().headers(),'X-GH11-UK-Test':'synthetic-only','X-GH11-UK-Case':'via'}});
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  async function ready(){
   await page.waitForFunction(()=>window.VoyagrJourneyModes&&window.VoyagrCalculateRouteOrchestration?.endpointIntentReady());
   await page.evaluate(()=>VoyagrLocalData.ready());
   if(await page.locator('#safetyNoticeOverlay').isVisible()){await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();}
   await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.loaded()&&!map.isMoving());
  }
  await page.goto(origin,{waitUntil:'load'});await ready();
  await page.evaluate(()=>{
   VoyagrAutoGpsOrchestration.setAutoGpsEnabled(false);VoyagrAutoGpsOrchestration.stopAutoGpsLocation();
   document.getElementById('optimizeStopOrder').checked=false;saveMultiDropPreferences();
   for(const [id,p] of [['start',[0,0]],['end',[0,.02]]]){const el=document.getElementById(id);el.value=p.join(',');Object.assign(el.dataset,{lat:String(p[0]),lon:String(p[1]),displayName:el.value,journeySource:'coordinates'});}
  });
  for(const dwell of [0,15]){
   phase='calculate '+dwell+' minute stop';
   await page.evaluate(dwell=>{clearAllWaypoints();addStop(.003,.01,'Synthetic continuous stop',dwell,'coordinates');},dwell);
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/route');
   await page.evaluate(()=>calculateRoute());const response=await pending;assert.equal(response.status(),200);
   const body=await response.json(),route=body.routes[0];
   await page.waitForFunction(id=>lastCalculatedRoute?.id===id&&!VoyagrJourneyModes.isJourneyCommitPending(),route.id);
   const actual=await page.evaluate(()=>({row:lastCalculatedRoute,ranges:VoyagrJourneyPlan.inspection(lastCalculatedRoute,VoyagrAvoidanceIntegrity).ranges,mounted:VoyagrRouteComparisonOrchestration.getAllRouteLayers().concat(VoyagrCalculateRouteOrchestration.getRouteLayer()||[]).some(h=>MapLibreHelpers.isPolylineLayerMounted(map,h,VoyagrAvoidanceIntegrity.geometryPoints(lastCalculatedRoute)))}));
   assert.equal(actual.row.dwell_duration_minutes,dwell);assert.equal(actual.row.duration_minutes,route.driving_duration_minutes+dwell);
   assert.equal(actual.ranges.length,2);assert.equal(actual.row.journey_context.ordered_stops[0].duration_minutes,dwell);
   assert.equal(actual.row.stop_semantics.access_verification,'UNVERIFIED');assert.equal(actual.mounted,true);
   assert.equal(await page.evaluate(()=>VoyagrJourneyModes.startNavigation()),false);
  }
  phase='save and reload stop preview';
  await page.evaluate(()=>{document.getElementById('routeName').value='Synthetic stop plan';saveCurrentRoute();});
  await page.waitForFunction(async()=>(await VoyagrLocalData.getRoutes()).some(r=>r.name==='Synthetic stop plan'));
  const saved=await page.evaluate(async()=>(await VoyagrLocalData.getRoutes()).find(r=>r.name==='Synthetic stop plan'));
  await page.reload({waitUntil:'load'});await ready();
  assert.equal(await page.evaluate(id=>VoyagrRouteSavingOrchestration.useSavedRoute(id),saved.id),true);
  const restored=await page.evaluate(()=>lastCalculatedRoute);
  assert.equal(restored.geometry,saved.geometry);assert.equal(restored.dwell_duration_minutes,15);
  assert.equal(restored.driving_duration_minutes,saved.driving_duration_minutes);
  assert.equal(restored.duration_minutes,saved.duration_minutes);
  assert.equal(restored.journey_context.ordered_stops[0].duration_minutes,15);
  assert.equal(await page.evaluate(()=>VoyagrJourneyModes.startNavigation()),false);
  const stats=await (await page.request.get(origin+'/__lab__/evidence')).json();assert.equal(stats.engine,2);
  console.log(JSON.stringify({status:'PASS_UK_CONTINUOUS_STOP_PREVIEW',durations:[0,15],saved_restored:true,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }catch(error){throw Error('UK stop '+phase+': '+error.message);}
 finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
