'use strict';
// Actual UK storage/restore and request ownership, registered synthetic GH11 only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const origin=process.argv[2];assert.equal(new URL(origin).hostname,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(15000);
 let phase='boot',fault='',nextGate=null;const gates=[],routeErrors=[];
 function holdNext(){
  let ready,release,done;const gate={ready:new Promise(resolve=>{ready=resolve;}),released:new Promise(resolve=>{release=resolve;}),done:new Promise(resolve=>{done=resolve;}),signal:()=>ready(),release:()=>release(),finish:()=>done()};
  gates.push(gate);nextGate=gate;return gate;
 }
 try{
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname.startsWith('/map/'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(url.pathname==='/api/route'){
    const headers={...route.request().headers(),'X-GH11-UK-Test':'synthetic-only','X-GH11-UK-Case':'matrix_3','X-GH11-UK-Fault':fault};
    const gate=nextGate;if(!gate)return route.continue({headers});nextGate=null;
    try{
     const upstream=await route.fetch({headers});assert.equal(upstream.status(),200);gate.signal();await gate.released;
     await route.fulfill({response:upstream});
    }catch(error){if(!route.request().failure()?.errorText.includes('ERR_ABORTED'))routeErrors.push(error.name);gate.signal();}
    finally{gate.finish();}
    return;
   }
   return route.continue();
  });
  async function ready(){
   await page.waitForFunction(()=>window.VoyagrJourneyModes&&window.VoyagrCalculateRouteOrchestration?.endpointIntentReady());
   await page.evaluate(()=>VoyagrLocalData.ready());
   if(await page.locator('#safetyNoticeOverlay').isVisible()){await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();}
   await page.evaluate(()=>VoyagrProfileStoreOrchestration.switchActiveProfile('guest'));
   await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.loaded()&&!map.isMoving());
   await page.evaluate(()=>{
    window.__labMounted=()=>{
     const points=VoyagrAvoidanceIntegrity.geometryPoints(lastCalculatedRoute);if(!points)return false;
     const fixed=rows=>rows.map(point=>point.map(value=>Math.round(value*1e6)));
     return VoyagrRouteComparisonOrchestration.getAllRouteLayers().concat(VoyagrCalculateRouteOrchestration.getRouteLayer()||[]).some(handle=>{
      const source=handle.sourceId||handle.id,data=map.getStyle().sources[source]?.data,line=map.getLayer(handle.id);
      return handle._added===true&&line?.source===source&&data?.geometry?.type==='LineString'&&JSON.stringify(fixed(data.geometry.coordinates))===JSON.stringify(fixed(points.map(point=>[point[1],point[0]])));
     });
    };
   });
  }
  async function configure(detour=17){
   await page.evaluate(detour=>{
    VoyagrAutoGpsOrchestration.setAutoGpsEnabled(false);VoyagrAutoGpsOrchestration.stopAutoGpsLocation();
    document.getElementById('optimizeStopOrder').checked=false;saveMultiDropPreferences();
    document.getElementById('maxDetour').value=String(detour);saveRoutePreferences();
    localStorage.setItem('pref_avoid_motorways','true');localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'motorways',enabled:true,mode:'mandatory'}]));
    for(const [id,point] of [['start',[0,0]],['end',[0,.02]]]){const input=document.getElementById(id);input.value=point.join(',');Object.assign(input.dataset,{lat:String(point[0]),lon:String(point[1]),displayName:input.value,journeySource:'coordinates'});}
   },detour);
  }
  const stats=async()=>await (await page.request.get(origin+'/__lab__/evidence')).json();
  const snapshot=async()=>await page.evaluate(()=>JSON.stringify({id:lastCalculatedRoute.id,geometry:lastCalculatedRoute.geometry,binding:lastCalculatedRoute.routing_context?.request_binding,scope:lastCalculatedRoute.routing_context?.scope,allowed:lastCalculatedRoute.navigation_allowed,live:VoyagrNavigationLifecycleOrchestration.getRouteInProgress()}));
  async function retained(before){assert.equal(await snapshot(),before);await page.waitForFunction(()=>__labMounted());}
  async function calculate(status=200){
   await page.waitForFunction(()=>map.loaded()&&!map.isMoving()&&!VoyagrJourneyModes.isJourneyCommitPending());
   const response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/route');
   await page.evaluate(()=>calculateRoute());const got=await response;assert.equal(got.status(),status);
   if(status===200){const body=await got.json();await page.waitForFunction(id=>lastCalculatedRoute?.id===id&&!VoyagrJourneyModes.isJourneyCommitPending(),body.routes[0].id);await page.waitForFunction(()=>__labMounted());return body;}
  }
  await page.goto(origin,{waitUntil:'load'});await ready();await configure();const first=await calculate();
  phase='actual save';await page.evaluate(()=>{document.getElementById('routeName').value='Synthetic recovery plan';saveCurrentRoute();});
  await page.waitForFunction(async()=>((await VoyagrLocalData.getRoutes())||[]).some(route=>route.name==='Synthetic recovery plan'));
  const saved=await page.evaluate(async()=>(await VoyagrLocalData.getRoutes()).find(route=>route.name==='Synthetic recovery plan'));
  assert.equal(saved.navigation_allowed,false);assert.equal(saved.routing_context.request_binding,first.routes[0].routing_context.request_binding);
  assert.equal(saved.duration_minutes,first.routes[0].duration_minutes);assert.deepEqual(saved.maneuvers,first.routes[0].maneuvers);
  phase='reload and actual saved-plan restore';await page.reload({waitUntil:'load'});await ready();
  assert.equal(await page.evaluate(id=>VoyagrRouteSavingOrchestration.useSavedRoute(id),saved.id),true);
  await page.waitForFunction(()=>__labMounted());
  assert.equal(await page.evaluate(()=>VoyagrJourneyModes.startNavigation()),false);
  assert.equal((await stats()).engine,1);assert.equal(await page.evaluate(()=>lastCalculatedRoute.navigation_allowed),false);
  phase='offline saved inspection';await context.setOffline(true);
  assert.equal(await page.evaluate(id=>VoyagrRouteSavingOrchestration.useSavedRoute(id),saved.id),true);await page.waitForFunction(()=>__labMounted());
  await context.setOffline(false);
  phase='policy change refuses restored plan';let before=await snapshot();
  await page.evaluate(()=>localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'railway_crossings',enabled:true,mode:'mandatory'}])));
  await calculate(422);await retained(before);assert.equal((await stats()).engine,1);
  phase='request transport outage';await context.setOffline(true);await page.evaluate(()=>calculateRoute());await retained(before);await context.setOffline(false);
  assert.equal((await stats()).engine,1);
  phase='engine timeout';await configure();fault='engine_outage';await calculate(504);await retained(before);fault='';
  assert.equal((await stats()).engine,1);assert.equal((await stats()).engine_outages,1);
  phase='legacy envelope refusal';fault='legacy_version';await calculate(422);await retained(before);fault='';
  assert.equal((await stats()).engine,2);
  phase='old validated response after policy change';let gate=holdNext(),work=page.evaluate(()=>calculateRoute());await gate.ready;
  await page.evaluate(()=>localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'railway_crossings',enabled:true,mode:'mandatory'}])));
  gate.release();await work;await gate.done;await retained(before);await calculate(422);await retained(before);
  phase='newer request owns the result';await configure(18);gate=holdNext();work=page.evaluate(()=>calculateRoute());await gate.ready;
  await configure(19);const newer=await calculate();gate.release();await work;await gate.done;
  assert.equal(await page.evaluate(()=>lastCalculatedRoute.id),newer.routes[0].id);before=await snapshot();
  phase='temporary map loading';await configure(20);gate=holdNext();work=page.evaluate(()=>calculateRoute());await gate.ready;
  await page.evaluate(()=>{const original=map.isStyleLoaded.bind(map);window.__labRestoreMap=()=>{map.isStyleLoaded=original;};map.isStyleLoaded=()=>false;});
  gate.release();await page.waitForFunction(()=>VoyagrJourneyModes.isJourneyCommitPending());assert.equal(await snapshot(),before);
  await page.evaluate(()=>__labRestoreMap());await work;await gate.done;await page.waitForFunction(()=>__labMounted());before=await snapshot();
  phase='cancel map wait on changed policy';await configure(21);gate=holdNext();work=page.evaluate(()=>calculateRoute());await gate.ready;
  await page.evaluate(()=>{const original=map.isStyleLoaded.bind(map);window.__labRestoreMap=()=>{map.isStyleLoaded=original;};map.isStyleLoaded=()=>false;});
  gate.release();await page.waitForFunction(()=>VoyagrJourneyModes.isJourneyCommitPending());
  await page.evaluate(()=>localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'railway_crossings',enabled:true,mode:'mandatory'}])));
  await work;await gate.done;await page.evaluate(()=>__labRestoreMap());await retained(before);
  phase='permanently unavailable map retains plan';await configure(22);gate=holdNext();work=page.evaluate(()=>calculateRoute());await gate.ready;
  await page.evaluate(()=>{const original=map.isStyleLoaded.bind(map);window.__labRestoreMap=()=>{map.isStyleLoaded=original;};map.isStyleLoaded=()=>false;});
  gate.release();await work;await gate.done;await page.evaluate(()=>__labRestoreMap());await retained(before);
  const rows=await page.evaluate(()=>VoyagrLocalData.getRoutes());assert.equal(rows.length,1);assert.equal(rows[0].id,saved.id);assert.equal(rows[0].geometry,saved.geometry);
  assert.equal(await page.evaluate(()=>VoyagrJourneyModes.startNavigation()),false);assert.deepEqual(routeErrors,[]);
  console.log(JSON.stringify({status:'PASS_UK_SAVED_OUTAGE_RACES',saved_records:rows.length,saved_restrictions_retained:true,offline_inspection:true,outage_refused:true,legacy_envelope_refused:true,stale_response_refused:true,newer_request_retained:true,temporary_map_wait:true,cancelled_map_wait:true,unavailable_map_retained:true,navigation_allowed:false,external_requests_sent:0,phone_acceptance:'UNVERIFIED'}));
 }catch(error){throw Error('UK recovery '+phase+': '+error.message);}
 finally{for(const gate of gates)gate.release();await context.close();await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
