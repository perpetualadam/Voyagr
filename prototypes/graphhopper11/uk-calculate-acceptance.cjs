'use strict';
// Normally booted UK page, real Calculate, actual local GH11; synthetic data only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const origin=process.argv[2];assert.equal(new URL(origin).hostname,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 let context=await browser.newContext({serviceWorkers:'block'});let phase='boot';const external=[],messages=[];
 try{
  const wire=async target=>target.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin){external.push(url.hostname);return route.abort();}
   if(url.pathname.startsWith('/map/'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(url.pathname==='/api/route')return route.continue({headers:{...route.request().headers(),'X-GH11-UK-Test':'synthetic-only'}});
   return route.continue();
  });
  await wire(context);
  let page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('console',message=>{if(message.text().includes('calculateRoute')||message.type()==='error')messages.push(message.text().slice(0,160));});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoyagrJourneyModes&&window.VoyagrCalculateRouteOrchestration?.endpointIntentReady()&&window.VoyagrNavigationLifecycleOrchestration?.endpointIntentReady());
  await page.evaluate(()=>VoyagrLocalData.ready());
  if(await page.locator('#safetyNoticeOverlay').isVisible()){
   await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();
  }
  await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.isStyleLoaded());
  if(await page.locator('#voyagr-add-homescreen-banner button').filter({hasText:'Not now'}).isVisible())await page.locator('#voyagr-add-homescreen-banner button').filter({hasText:'Not now'}).click();
  await page.evaluate(()=>{
   expandBottomSheet();
   VoyagrAutoGpsOrchestration.setAutoGpsEnabled(false);VoyagrAutoGpsOrchestration.stopAutoGpsLocation();
   localStorage.setItem('uk-calculate-synthetic-marker','retained');
   for(const [id,point] of [['start',[0,0]],['end',[0,.02]]]){
    const input=document.getElementById(id);input.value=point.join(',');
    Object.assign(input.dataset,{lat:String(point[0]),lon:String(point[1]),displayName:input.value,journeySource:'coordinates'});
   }
  });
  phase='normal Calculate';
  const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/route').catch(()=>null);
  await page.locator('button[onclick="calculateRoute()"]').click();
  const response=await responsePromise;assert.ok(response,'Calculate must reach the registered bridge');assert.equal(response.status(),200);
  const responseBody=await response.json();assert.equal(responseBody.navigation_allowed,false);
  await page.waitForFunction(()=>window.lastCalculatedRoute?.source==='GraphHopper 11.1 isolated preview');
  const displayed=await page.evaluate(()=>({id:lastCalculatedRoute.id,points:lastCalculatedRoute.polyline.length,steps:lastCalculatedRoute.maneuvers.length,allowed:lastCalculatedRoute.navigation_allowed,mode:VoyagrJourneyModes.getState(),mounted:MapLibreHelpers.isPolylineLayerMounted(map,VoyagrCalculateRouteOrchestration.getRouteLayer(),lastCalculatedRoute.polyline),context:lastCalculatedRoute.journey_context}));
  assert.equal(displayed.id,responseBody.routes[0].id);assert.ok(displayed.points>2&&displayed.steps>0);
  assert.equal(displayed.allowed,false);assert.equal(displayed.mounted,true);assert.notEqual(displayed.mode,'LIVE');
  assert.equal(displayed.context.authority,'request_metadata_only');
  phase='actual Start refusal';
  assert.equal(await page.evaluate(()=>VoyagrJourneyModes.startNavigation()),false);
  assert.equal(await page.evaluate(()=>VoyagrNavigationLifecycleOrchestration.getRouteInProgress()),false);
  phase='unsupported mandatory replacement';
  await page.evaluate(()=>localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'railway_crossings',enabled:true,mode:'mandatory'}])));
  const refusedPromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/route');
  await page.evaluate(()=>calculateRoute());assert.equal((await refusedPromise).status(),422);
  const retained=await page.evaluate(()=>({id:lastCalculatedRoute.id,marker:localStorage.getItem('uk-calculate-synthetic-marker'),live:VoyagrNavigationLifecycleOrchestration.getRouteInProgress(),mounted:MapLibreHelpers.isPolylineLayerMounted(map,VoyagrCalculateRouteOrchestration.getRouteLayer(),lastCalculatedRoute.polyline)}));
  assert.equal(retained.id,displayed.id);assert.equal(retained.marker,'retained');assert.equal(retained.live,false);assert.equal(retained.mounted,true);
  phase='synthetic active baseline';
  // A separate disposable device context owns the active baseline. Do not
  // overwrite the first page's durably committed inspection journey.
  const preview=await page.evaluate(()=>lastCalculatedRoute);
  await context.close();context=await browser.newContext({serviceWorkers:'block'});await wire(context);
  page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoyagrJourneyModes&&window.VoyagrNavigationLifecycleOrchestration?.endpointIntentReady());
  await page.evaluate(()=>VoyagrLocalData.ready());
  if(await page.locator('#safetyNoticeOverlay').isVisible()){
   await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();
  }
  await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.isStyleLoaded());
  await page.evaluate(candidate=>{window.__labGhPreview=candidate;},preview);
  const started=await page.evaluate(async()=>{
   await VoyagrProfileStoreOrchestration.switchActiveProfile('guest');
   VoyagrAutoGpsOrchestration.setAutoGpsEnabled(false);VoyagrAutoGpsOrchestration.stopAutoGpsLocation();
   for(const [id,point] of [['start',[0,0]],['end',[0,.02]]]){
    const input=document.getElementById(id);input.value=point.join(',');
    Object.assign(input.dataset,{lat:String(point[0]),lon:String(point[1]),displayName:input.value,journeySource:'coordinates'});
   }
   const points=[[53,-1],[53.01,-1]],geometry=VoyagrPolylineCodec.encodePolyline(points,6);
   const baseline={id:'uk-calculate-active-synthetic',source:'Synthetic acceptance baseline',destination:'53.01,-1',geometry,geometry_precision:6,polyline:points,geometry_complete:true,distance_km:1,duration_minutes:2,maneuvers:[{type:8,instruction:'Synthetic continuation',begin_shape_index:0,end_shape_index:1}],avoidance_preferences_snapshot:VoyagrAvoidanceIntegrity.snapshot(localStorage),avoidance_assessment:{status:'SATISFIED',checked_at:Date.now()/1000,geometry_valid:true,requirements:[]},journey_context:{version:1,purpose:'planning',origin:{kind:'searched',coordinates:[53,-1]},destination:{kind:'searched',coordinates:[53.01,-1]},ordered_stops:[]}};
   baseline.avoidance_assessment.geometry_binding=VoyagrAvoidanceIntegrity.geometryBinding(baseline);
   window.lastCalculatedRoute=baseline;VoyagrRouteComparisonOrchestration.setRouteOptions([baseline]);VoyagrRouteComparisonOrchestration.setSelectedRouteIndex(0);VoyagrJourneyModes.onPreview();
   return await VoyagrJourneyModes.startNavigation();
  });
  assert.equal(started,true);
  phase='actual selection and live replacement refusal';
  const guarded=await page.evaluate(()=>{
   const life=VoyagrNavigationLifecycleOrchestration;
   const snapshot=()=>JSON.stringify({id:lastCalculatedRoute.id,line:life.getRoutePolyline(),steps:life.getCurrentRouteSteps(),index:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),options:VoyagrRouteComparisonOrchestration.getRouteOptions().map(route=>route.id),mode:VoyagrJourneyModes.getState(),live:life.getRouteInProgress()});
   VoyagrRouteComparisonOrchestration.setRouteOptions([lastCalculatedRoute,__labGhPreview]);
   const before=snapshot();
   const selection=VoyagrRouteComparisonOrchestration.selectRoute(1);
   const start=life.startTurnByTurnNavigation(__labGhPreview);
   const replacement=VoyagrRerouteMapOrchestration.updateRouteOnMap(__labGhPreview);
   window.__labActiveSnapshot=before;window.__labSnapshot=snapshot;
   return {selection,start,replacement:replacement.ok,retained:before===snapshot()};
  });
  assert.equal(guarded.start,false);assert.equal(guarded.replacement,false);assert.equal(guarded.retained,true);
  phase='normal Calculate cannot replace active journey with preview';
  const activeResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/route');
  await page.evaluate(()=>calculateRoute());assert.equal((await activeResponse).status(),200);
  assert.equal(await page.evaluate(()=>__labSnapshot()===__labActiveSnapshot),true);
  await page.evaluate(()=>VoyagrNavigationLifecycleOrchestration.stopTurnByTurnNavigation());
  const evidence=await (await page.request.get(origin+'/__lab__/evidence')).json();
  assert.equal(evidence.engine,2);assert.equal(evidence.route,3);assert.equal(evidence.refused,1);
  console.log(JSON.stringify({status:'PASS_UK_CALCULATE_GH11_PREVIEW',...evidence,displayed:true,start_refused:true,failed_replacement_retained:true,active_journey_retained:true,external_requests_sent:0,blocked_external_requests:external.length,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }catch(error){throw Error('UK Calculate phase '+phase+': '+error.message+'; synthetic console: '+JSON.stringify(messages.slice(-8)));}
 finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
