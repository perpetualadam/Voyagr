'use strict';
// Native GH11 alternatives and ordered legs through the real, disposable UK page.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const origin=process.argv[2];assert.equal(new URL(origin).hostname,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({serviceWorkers:'block'});
 let selectedCase='matrix_3',fault='',phase='boot';const pageErrors=[];
 const requirements=[{category:'motorways',enabled:true,mode:'mandatory'},{category:'railway_crossings',enabled:true,mode:'preference'},{category:'tolls',enabled:false,mode:'preference'}];
 try{
  await context.addInitScript(({requirements})=>{
   localStorage.setItem('pref_avoid_motorways','true');
   localStorage.setItem('pref_avoidance_requirements',JSON.stringify(requirements));
   localStorage.setItem('routePreferences',JSON.stringify({avoidHighways:true,avoidTolls:false,avoidCAZ:false,preferScenic:false,preferQuiet:true,avoidUnpaved:false,routeOptimization:'fastest',maxDetour:17}));
   localStorage.setItem('uk-matrix-sentinel','retained');
  },{requirements});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname.startsWith('/map/'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(url.pathname==='/api/route')return route.continue({headers:{...route.request().headers(),'X-GH11-UK-Test':'synthetic-only','X-GH11-UK-Case':selectedCase,'X-GH11-UK-Fault':fault}});
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>pageErrors.push(error.name));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoyagrJourneyModes&&window.VoyagrCalculateRouteOrchestration?.endpointIntentReady()&&window.VoyagrNavigationLifecycleOrchestration?.endpointIntentReady());
  await page.evaluate(()=>VoyagrLocalData.ready());
  if(await page.locator('#safetyNoticeOverlay').isVisible()){
   await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();
  }
  await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.isStyleLoaded());
  await page.evaluate(()=>VoyagrProfileStoreOrchestration.switchActiveProfile('guest'));
  await page.evaluate(requirements=>{
   window.__labMounted=()=>VoyagrRouteComparisonOrchestration.getAllRouteLayers().concat(VoyagrCalculateRouteOrchestration.getRouteLayer()||[]).some(handle=>{
    const route=lastCalculatedRoute,source=handle.sourceId||handle.id,line=map.getLayer(handle.id),data=map.getStyle().sources[source]?.data;
    return handle._added===true&&line?.type==='line'&&line.source===source&&!!map.getSource(source)&&data?.geometry?.type==='LineString'&&JSON.stringify(data.geometry.coordinates)===JSON.stringify(route.polyline.map(point=>[point[1],point[0]]));
   });
   VoyagrAutoGpsOrchestration.setAutoGpsEnabled(false);VoyagrAutoGpsOrchestration.stopAutoGpsLocation();
   document.getElementById('optimizeStopOrder').checked=false;saveMultiDropPreferences();
   document.getElementById('preferQuiet').checked=true;
   document.getElementById('maxDetour').value='17';saveRoutePreferences();
   localStorage.setItem('pref_avoid_motorways','true');
   localStorage.setItem('pref_avoidance_requirements',JSON.stringify(requirements));
   for(const [id,point] of [['start',[0,0]],['end',[0,.02]]]){
    const input=document.getElementById(id);input.value=point.join(',');
    Object.assign(input.dataset,{lat:String(point[0]),lon:String(point[1]),displayName:input.value,journeySource:'coordinates'});
   }
  },requirements);
  async function calculate(expected){
   const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/route');
   await page.evaluate(()=>calculateRoute());
   const response=await pending;assert.equal(response.status(),expected,phase);
   return {body:await response.json(),request:response.request().postDataJSON()};
  }
  const evidence=async()=>await (await page.request.get(origin+'/__lab__/evidence')).json();
  const snapshot=async()=>await page.evaluate(()=>JSON.stringify({id:lastCalculatedRoute.id,geometry:lastCalculatedRoute.geometry,steps:lastCalculatedRoute.maneuvers,index:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),routes:VoyagrRouteComparisonOrchestration.getRouteOptions().map(route=>route.id),mounted:__labMounted(),live:VoyagrNavigationLifecycleOrchestration.getRouteInProgress(),marker:localStorage.getItem('uk-matrix-sentinel')}));
  const counts=[];
  for(const count of [3,2,1]){
   phase='native alternatives '+count;selectedCase='matrix_'+count;
   const returned=await calculate(200);assert.equal(returned.body.routes.length,count);
   await page.waitForFunction(id=>window.lastCalculatedRoute?.id===id,returned.body.routes[0].id);
   await page.waitForFunction(()=>!VoyagrJourneyModes.isJourneyCommitPending());
   const accepted=(await evidence()).accepted.at(-1);
   assert.deepEqual(accepted.app_request,returned.request);assert.equal(accepted.settings.avoid_motorways,true,'motorway flag');
   assert.equal(accepted.settings.max_detour,17);assert.equal(accepted.settings.prefer_quiet,true,'quiet preference');
   assert.deepEqual(accepted.settings.avoidance_requirements,requirements);
   assert.deepEqual(accepted.forbidden,Array(count).fill(0));
   for(let i=0;i<count;i++){
    phase='native alternatives '+count+' selection '+i;
    assert.equal(await page.evaluate(index=>VoyagrRouteComparisonOrchestration.selectRoute(index),i),true);
    await page.waitForFunction(()=>__labMounted());
    const selected=await page.evaluate(()=>{
     const api=VoyagrRouteComparisonOrchestration,route=lastCalculatedRoute;
     const inspected=VoyagrJourneyPlan.inspection(route,VoyagrAvoidanceIntegrity);
     return {id:route.id,context:route.routing_context,allowed:route.navigation_allowed,automatic:route.automatic_selection_allowed,rules:route.avoidance_assessment.requirements,legs:inspected.ranges.length,points:route.polyline.length,mounted:__labMounted(),start:VoyagrNavigationLifecycleOrchestration.startTurnByTurnNavigation(route)};
    });
    assert.equal(selected.id,returned.body.routes[i].id);
    assert.equal(selected.context.request_binding,accepted.binding);assert.equal(selected.allowed,false);assert.equal(selected.automatic,false);
    for(const key of ['graph_version','source_version','policy_version'])assert.equal(selected.context[key],accepted.versions[key]);
    assert.equal(selected.legs,1);assert.ok(selected.points>2&&selected.mounted);assert.equal(selected.start,false);
    for(const rule of requirements)assert.ok(selected.rules.some(row=>row.category===rule.category&&row.enabled===rule.enabled&&row.mode===rule.mode));
   }
   counts.push(count);
  }
  phase='zero routes retain previous preview';selectedCase='matrix_0';let before=await snapshot();
  await calculate(422);assert.equal(await snapshot(),before);
  phase='broken third candidate cannot partially publish';selectedCase='matrix_3';fault='third_metrics';before=await snapshot();
  await calculate(422);assert.equal(await snapshot(),before);fault='';
  phase='three ordered legs';selectedCase='matrix_via';
  await page.evaluate(()=>{clearAllWaypoints();addViaPoint(.003,.006,'Synthetic first via','coordinates');addViaPoint(.003,.014,'Synthetic second via','coordinates');});
  const via=await calculate(200);assert.equal(via.request.optimize_stop_order,false);
  assert.deepEqual(via.request.via_points.map(point=>[point.lat,point.lon]),[[.003,.006],[.003,.014]]);
  await page.waitForFunction(id=>window.lastCalculatedRoute?.id===id,via.body.routes[0].id);
  await page.waitForFunction(()=>!VoyagrJourneyModes.isJourneyCommitPending());
  await page.waitForFunction(()=>__labMounted());
  const inspected=await page.evaluate(()=>({ranges:VoyagrJourneyPlan.inspection(lastCalculatedRoute,VoyagrAvoidanceIntegrity).ranges,points:lastCalculatedRoute.polyline,rules:lastCalculatedRoute.avoidance_assessment.requirements,allowed:lastCalculatedRoute.navigation_allowed,context:lastCalculatedRoute.routing_context}));
  assert.equal(inspected.ranges.length,3);assert.equal(inspected.allowed,false);
  const accepted=(await evidence()).accepted.at(-1);assert.deepEqual(accepted.app_request,via.request);assert.deepEqual(accepted.legs,[3]);
  assert.deepEqual(accepted.forbidden,[0]);assert.deepEqual(accepted.settings.avoidance_requirements,requirements);
  for(const rule of requirements)assert.ok(inspected.rules.some(row=>row.category===rule.category&&row.enabled===rule.enabled&&row.mode===rule.mode));
  assert.equal(inspected.context.request_binding,accepted.binding);
  const visits=[[0,0],[.003,.006],[.003,.014],[0,.02]];
  const fixed=point=>point.map(value=>Math.round(value*1e6));
  for(let i=0;i<3;i++){
   const leg=inspected.ranges[i];assert.deepEqual(fixed(inspected.points[leg.begin_shape_index]),fixed(visits[i]));assert.deepEqual(fixed(inspected.points[leg.end_shape_index]),fixed(visits[i+1]));
   assert.equal(leg.preview_only,true);if(i)assert.equal(leg.begin_shape_index,inspected.ranges[i-1].end_shape_index);
  }
  phase='broken last leg cannot partially publish';before=await snapshot();fault='last_leg';
  await calculate(422);assert.equal(await snapshot(),before);fault='';
  phase='unsupported optimization refuses before Java';let executions=(await evidence()).engine;
  await page.evaluate(()=>{document.getElementById('optimizeStopOrder').checked=true;saveMultiDropPreferences();});
  const optimized=await calculate(422);assert.equal(optimized.request.optimize_stop_order,true);assert.equal((await evidence()).engine,executions);assert.equal(await snapshot(),before);
  await page.evaluate(()=>{document.getElementById('optimizeStopOrder').checked=false;saveMultiDropPreferences();});
  phase='reversed visits refuse before Java';before=await snapshot();executions=(await evidence()).engine;
  await page.evaluate(()=>{clearAllWaypoints();addViaPoint(.003,.014,'Synthetic second via','coordinates');addViaPoint(.003,.006,'Synthetic first via','coordinates');});
  await calculate(422);assert.equal((await evidence()).engine,executions);assert.equal(await snapshot(),before);
  phase='timed stop refuses before Java';
  await page.evaluate(()=>{clearAllWaypoints();addStop(.003,.006,'Synthetic timed stop',15,'coordinates');});
  const stopped=await calculate(422);assert.equal(stopped.request.stops.length,1);assert.equal((await evidence()).engine,executions);assert.equal(await snapshot(),before);
  phase='unsupported mandatory rule refuses before Java';
  await page.evaluate(()=>{clearAllWaypoints();localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'railway_crossings',enabled:true,mode:'mandatory'}]));});
  selectedCase='matrix_3';await calculate(422);assert.equal((await evidence()).engine,executions);assert.equal(await snapshot(),before);
  const final=await evidence();assert.equal(final.engine,7);assert.equal(final.route,11);assert.equal(final.refused,7);assert.deepEqual(pageErrors,[]);
  console.log(JSON.stringify({status:'PASS_UK_ALTERNATIVES_AND_LEGS',native_counts:counts,ordered_legs:3,engine:final.engine,route:final.route,refused:final.refused,external_requests_sent:0,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }catch(error){throw Error('UK matrix '+phase+': '+error.message);}
 finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
