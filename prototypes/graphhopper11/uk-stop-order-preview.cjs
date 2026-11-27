'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const origin=process.argv[2];assert.equal(new URL(origin).hostname,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({serviceWorkers:'block'});let fault='',phase='boot';
 try{
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname.startsWith('/map/'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(url.pathname==='/api/route')return route.continue({headers:{...route.request().headers(),'X-GH11-UK-Test':'synthetic-only','X-GH11-UK-Case':'opt_012','X-GH11-UK-Fault':fault}});
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  async function ready(){
   await page.waitForFunction(()=>window.VoyagrJourneyModes&&window.VoyagrCalculateRouteOrchestration?.endpointIntentReady());
   await page.evaluate(()=>VoyagrLocalData.ready());
   if(await page.locator('#safetyNoticeOverlay').isVisible()){await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();}
   await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.loaded()&&!map.isMoving());
   await page.evaluate(()=>{VoyagrAutoGpsOrchestration.setAutoGpsEnabled(false);VoyagrAutoGpsOrchestration.stopAutoGpsLocation();});
  }
  await page.goto(origin,{waitUntil:'load'});await ready();
  await page.evaluate(()=>{
   document.getElementById('optimizeStopOrder').checked=true;saveMultiDropPreferences();
   for(const [id,p] of [['start',[0,0]],['end',[0,.02]]]){const input=document.getElementById(id);input.value=p.join(',');Object.assign(input.dataset,{lat:String(p[0]),lon:String(p[1]),displayName:input.value,journeySource:'coordinates'});}
   clearAllWaypoints();addStop(0,.004,'Synthetic A',0,'coordinates');addStop(0,.012,'Synthetic B',5,'coordinates');addStop(0,.008,'Synthetic C',10,'coordinates');
  });
  phase='evaluate all registered orders';let pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/route');
  await page.evaluate(()=>calculateRoute());let response=await pending;assert.equal(response.status(),200);
  const body=await response.json();
  assert.equal(response.request().postDataJSON().optimize_stop_order,true);
  await page.waitForFunction(id=>lastCalculatedRoute?.id===id&&!VoyagrJourneyModes.isJourneyCommitPending(),body.routes[0].id);
  await page.waitForFunction(()=>VoyagrRouteComparisonOrchestration.getAllRouteLayers().concat(VoyagrCalculateRouteOrchestration.getRouteLayer()||[]).some(h=>MapLibreHelpers.isPolylineLayerMounted(map,h,VoyagrAvoidanceIntegrity.geometryPoints(lastCalculatedRoute))));
  const current=await page.evaluate(()=>({row:lastCalculatedRoute,ranges:VoyagrJourneyPlan.inspection(lastCalculatedRoute,VoyagrAvoidanceIntegrity).ranges.length}));
  const report=current.row.journey_context.registered_stop_order_optimization;
  assert.deepEqual(report.requested_order,[0,1,2]);assert.deepEqual(report.resolved_order,[0,2,1]);assert.equal(report.evaluated_orders,6);
  assert.equal(current.row.driving_duration_minutes,Math.min(...report.scores.map(score=>score.driving_minutes)));
  assert.equal(current.row.dwell_duration_minutes,15);assert.equal(current.ranges,4);
  assert.deepEqual(current.row.journey_context.ordered_stops.map(stop=>stop.original_index),[0,2,1]);
  assert.equal(await page.evaluate(()=>VoyagrJourneyModes.startNavigation()),false);
  phase='last order failure retains complete earlier preview';fault='optimizer_last_order';
  pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/route');await page.evaluate(()=>calculateRoute());response=await pending;
  assert.equal(response.status(),504);fault='';
  assert.equal(await page.evaluate(()=>lastCalculatedRoute.id),current.row.id);
  assert.equal(await page.evaluate(()=>lastCalculatedRoute.geometry),current.row.geometry);
  phase='device save/reload';
  await page.evaluate(()=>{document.getElementById('routeName').value='Synthetic optimized plan';saveCurrentRoute();});
  await page.waitForFunction(async()=>(await VoyagrLocalData.getRoutes()).some(r=>r.name==='Synthetic optimized plan'));
  const saved=await page.evaluate(async()=>(await VoyagrLocalData.getRoutes()).find(r=>r.name==='Synthetic optimized plan'));
  await page.reload({waitUntil:'load'});await ready();
  assert.equal(await page.evaluate(id=>VoyagrRouteSavingOrchestration.useSavedRoute(id),saved.id),true);
  assert.deepEqual(await page.evaluate(()=>lastCalculatedRoute.journey_context.ordered_stops.map(stop=>stop.original_index)),[0,2,1]);
  assert.equal(await page.evaluate(()=>lastCalculatedRoute.journey_context.registered_stop_order_optimization.evaluated_orders),6);
  assert.equal(await page.evaluate(()=>VoyagrJourneyModes.startNavigation()),false);
  const stats=await (await page.request.get(origin+'/__lab__/evidence')).json();assert.equal(stats.engine,11);assert.equal(stats.engine_outages,1);
  console.log(JSON.stringify({status:'PASS_REGISTERED_STOP_ORDER_PREVIEW',evaluated_orders:6,chosen_order:[0,2,1],saved_restored:true,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }catch(error){throw Error('UK stop-order '+phase+': '+error.message);}
 finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
