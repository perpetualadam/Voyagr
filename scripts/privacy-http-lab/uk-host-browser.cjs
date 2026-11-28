'use strict';
// Real full UK page and preview frame; no active journey, engine or physical GPS.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function ukHostBrowser(origin,check){
 const target=new URL(origin);assert.ok(target.protocol==='http:'&&target.hostname==='127.0.0.1','Disposable loopback host required');
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({serviceWorkers:'block'});
 let phase='bootstrap';const routeAttempts=[],external=[],errors=[];
 try{
  context.on('page',page=>page.on('pageerror',()=>errors.push('pageerror')));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin){external.push(url.hostname);return route.abort();}
   if(url.pathname==='/api/prototype/cases')return route.fulfill({json:{cases:['public_case'],case_requests:{},case_settings:{public_case:{profile:'car',alternatives:false,no_motorways:false,mandatory_associations:[],both_directions:false}},case_bindings:{public_case:'a'.repeat(64)},policy_categories:[]}});
   if(url.pathname==='/api/prototype/versions')return route.fulfill({json:{graph_version:'1'.repeat(64),source_version:'2'.repeat(64),policy_version:'3'.repeat(64)}});
   if(url.pathname==='/api/route'||url.pathname.startsWith('/api/prototype/')){routeAttempts.push(url.pathname);return route.abort();}
   if(url.pathname.startsWith('/map/'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   return route.continue();
  });
  const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoyagrLocalData&&window.VoyagrJourneyModes&&window.VoyagrGpsOrchestration&&window.VoyagrNavigationLifecycleOrchestration?.endpointIntentReady());
  await page.evaluate(()=>VoyagrLocalData.ready());
  await page.waitForFunction(()=>!document.getElementById('accountStatus')?.textContent.includes('Loading account status'));
  if(await page.locator('#safetyNoticeOverlay').isVisible()){await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();await page.locator('#safetyNoticeOverlay').waitFor({state:'hidden'});}
  const initial=await page.evaluate(()=>({state:VoyagrJourneyModes.getState(),live:VoyagrNavigationLifecycleOrchestration.getRouteInProgress()}));
  check('UK host boots its actual modules in planning mode',initial.state==='PLANNING'&&initial.live===false);
  await page.evaluate(async()=>{
   await VoyagrLocalData.update('routes',()=>[{id:'uk-host-synthetic-sentinel',name:'Retained test plan'}]);
   localStorage.setItem('uk-host-synthetic-marker','retained');
   window.__labOriginalModules=[VoyagrLocalData,VoyagrJourneyModes,VoyagrNavigationLifecycleOrchestration,VoyagrGpsOrchestration];
   const frame=document.createElement('iframe');frame.id='gh11HostPreview';frame.style.cssText='position:fixed;inset:5%;width:90%;height:90%;z-index:2147483000;background:white';frame.src='/__lab__/gh11-preview';document.body.append(frame);
  });
  const frame=await (await page.waitForSelector('#gh11HostPreview')).contentFrame();
  await frame.waitForFunction(()=>window.VoyagrGH11UKHostBoot&&!document.getElementById('calculate').disabled);
  phase='explicit connection';
  const connection=await frame.evaluate(()=>{
   window.__labConnection=VoyagrGH11UKHostBoot.connect({hostWindow:parent,previewWindow:window});
   return {allowed:__labConnection.navigation_allowed,owner:VoyagrGH11SavedSession.capture().owner,parentOwner:parent.VoyagrLocalData.capture().owner};
  });
  check('Full UK page connects actual owner/lifecycle/GPS modules to the preview',connection.allowed===false&&connection.owner===connection.parentOwner);
  phase='inactive journey click';await frame.locator('#calculate').click();
  phase='inactive journey refusal';
  await frame.waitForFunction(()=>document.getElementById('status').textContent.includes('Journey evidence'));
  check('Planning-mode host refuses preview routing before any engine request',routeAttempts.length===0);
  check('Refusal keeps preview navigation and saving unavailable',await frame.locator('#strictStart').isDisabled()&&await frame.locator('#saveCurrentPlan').isDisabled()&&await frame.locator('#line').getAttribute('points')==='');
  phase='owner transition';
  await page.evaluate(()=>VoyagrLocalData.switchOwner('sb:uk_host_synthetic'));
  await frame.waitForFunction(()=>VoyagrGH11SavedSession.capture().owner==='sb:uk_host_synthetic');
  check('Actual UK owner event updates the preview scope without account login',true);
  phase='close and retention';await frame.evaluate(()=>__labConnection.close());
  const retained=await page.evaluate(async()=>{
   const db=VoyagrLocalStore.create(indexedDB);try{return {rows:await db.read('guest','routes'),marker:localStorage.getItem('uk-host-synthetic-marker'),state:VoyagrJourneyModes.getState(),live:VoyagrNavigationLifecycleOrchestration.getRouteInProgress(),same:__labOriginalModules.every((value,i)=>value===[VoyagrLocalData,VoyagrJourneyModes,VoyagrNavigationLifecycleOrchestration,VoyagrGpsOrchestration][i])};}finally{db.close();}
  });
  check('Connector preserves synthetic host records and runtime state',retained.rows.length===1&&retained.rows[0].id==='uk-host-synthetic-sentinel'&&retained.marker==='retained'&&retained.state==='PLANNING'&&retained.live===false&&retained.same);
  await frame.locator('#calculate').click();await frame.waitForFunction(()=>document.getElementById('status').textContent.includes('Journey evidence'));
  check('Closed full-page binding stays fail-closed without routing',routeAttempts.length===0);
  phase='synthetic active journey start';
  await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.isStyleLoaded());
  const started=await page.evaluate(async()=>{
   await VoyagrProfileStoreOrchestration.switchActiveProfile('guest');
   const points=[[53,-1],[53.01,-1]],geometry=VoyagrPolylineCodec.encodePolyline(points,6);
   const route={id:'uk-host-synthetic-active',name:'Synthetic active baseline',source:'Synthetic test baseline',destination:'53.01,-1',destinationName:'Synthetic destination',geometry,geometry_precision:6,polyline:points,geometry_complete:true,distance_km:1,duration_minutes:2,maneuvers:[{type:8,instruction:'Synthetic continuation',begin_shape_index:0,end_shape_index:1}],avoidance_preferences_snapshot:VoyagrAvoidanceIntegrity.snapshot(localStorage),avoidance_assessment:{status:'SATISFIED',checked_at:Date.now()/1000,geometry_valid:true,requirements:[]},journey_context:{version:1,purpose:'planning',origin:{kind:'searched',coordinates:[53,-1]},destination:{kind:'searched',coordinates:[53.01,-1]},ordered_stops:[]}};
   route.avoidance_assessment.geometry_binding=VoyagrAvoidanceIntegrity.geometryBinding(route);
   window.lastCalculatedRoute=route;VoyagrRouteComparisonOrchestration.setRouteOptions([route]);VoyagrRouteComparisonOrchestration.setSelectedRouteIndex(0);VoyagrJourneyModes.onPreview();
   return await VoyagrJourneyModes.startNavigation();
  });
  check('Actual UK Start transaction accepts a synthetic baseline without an engine request',started===true&&routeAttempts.length===0);
  phase='active UK host evidence';
  await page.evaluate(()=>VoyagrGpsOrchestration.acceptOriginPosition({timestamp:Date.now(),coords:{latitude:53,longitude:-1,accuracy:5}}));
  await frame.goto(origin+'/__lab__/gh11-preview',{waitUntil:'domcontentloaded'});
  await frame.waitForFunction(()=>window.VoyagrGH11UKHostBoot&&!document.getElementById('calculate').disabled);
  const bound=await frame.evaluate(()=>{
   window.__labConnection=VoyagrGH11UKHostBoot.connect({hostWindow:parent,previewWindow:window});
   const adapter=VoyagrGH11HostJourney.create({owner:parent.VoyagrLocalData,modes:parent.VoyagrJourneyModes,lifecycle:parent.VoyagrNavigationLifecycleOrchestration,gps:parent.VoyagrGpsOrchestration,eventTarget:parent});
   const evidence=VoyagrGH11JourneyEvidence.create({...adapter,validator:VoyagrSpeedGps});
   try{return {allowed:__labConnection.navigation_allowed,current:evidence.current(evidence.capture()),state:parent.VoyagrJourneyModes.getState()};}finally{evidence.close();adapter.close();}
  });
  check('Active UK host binds fresh synthetic GPS through the real context guard without navigation authority',bound.allowed===false&&bound.current&&bound.state==='LIVE');
  phase='active GH11 preview refusal';
  const active=await page.evaluate(()=>{
   const life=VoyagrNavigationLifecycleOrchestration;
   const snapshot=()=>JSON.stringify({id:lastCalculatedRoute.id,line:life.getRoutePolyline(),steps:life.getCurrentRouteSteps(),step:life.getCurrentStepIndex(),state:VoyagrJourneyModes.getState(),live:life.getRouteInProgress()});
   const before=snapshot(),candidate=JSON.parse(JSON.stringify(lastCalculatedRoute));candidate.id='isolated-gh11-preview';candidate.navigation_allowed=false;candidate.automatic_selection_allowed=false;candidate.routing_context={scope:'selected_fixture_graph_checks_only'};candidate.avoidance_assessment.status='UNVERIFIED';candidate.avoidance_assessment.claim='selected_fixture_graph_checks_only';candidate.avoidance_assessment.automatic_selection_allowed=false;
   const start=life.startTurnByTurnNavigation(candidate),reroute=VoyagrRerouteMapOrchestration.updateRouteOnMap(candidate);
   return {start,reroute:reroute.ok,retained:before===snapshot(),state:VoyagrJourneyModes.getState(),live:life.getRouteInProgress()};
  });
  check('Active UK journey refuses a GH11 preview without merging old route authority',active.start===false&&active.reroute===false&&active.retained&&active.state==='LIVE'&&active.live===true);
  await frame.evaluate(()=>__labConnection.close());
  check('Closing the active preview retains the live UK journey',await page.evaluate(()=>VoyagrJourneyModes.getState()==='LIVE'&&VoyagrNavigationLifecycleOrchestration.getRouteInProgress()));
  await page.evaluate(()=>VoyagrNavigationLifecycleOrchestration.stopTurnByTurnNavigation());
  check('Full UK host/frame test has no uncaught page exceptions',errors.length===0);
 }catch(error){throw Error('UK host browser phase '+phase+' failed ('+error.name+')');}
 finally{await context.close();await browser.close();}
};
if(require.main===module)module.exports(process.env.VOYAGR_UK_HOST_TEST_ORIGIN||'http://127.0.0.1:5000',(name,passed)=>{assert.ok(passed,name);console.log('PASS: '+name);}).catch(error=>{console.error(error.message);process.exitCode=1;});
