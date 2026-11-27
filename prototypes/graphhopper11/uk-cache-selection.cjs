'use strict';
// Full UK Calculate -> real HTTPS capability cache -> independently checked GH11.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const origin=process.argv[2];assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(origin).protocol,'https:');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const contexts=[];let selectedCase='matrix_3',fault='',version='',phase='boot';
 const requirements=[{category:'motorways',enabled:true,mode:'mandatory'},{category:'railway_crossings',enabled:true,mode:'preference'}];
 try{
  async function boot(detour=17){
   const context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});contexts.push(context);
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname.startsWith('/map/'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
    if(url.pathname==='/api/route')return route.continue({headers:{...route.request().headers(),'X-GH11-UK-Test':'synthetic-only','X-GH11-UK-Case':selectedCase,'X-GH11-UK-Fault':fault,'X-GH11-UK-Version':version}});
    return route.continue();
   });
   const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(origin,{waitUntil:'load'});
   const errors=[];page.on('console',message=>{if(message.type()==='error'&&message.text().startsWith('[calculateRoute]'))errors.push(message.text().slice(0,240));});
   await page.waitForFunction(()=>window.VoyagrJourneyModes&&window.VoyagrCalculateRouteOrchestration?.endpointIntentReady()&&window.VoyagrNavigationLifecycleOrchestration?.endpointIntentReady());
   await page.evaluate(()=>VoyagrLocalData.ready());
   if(await page.locator('#safetyNoticeOverlay').isVisible()){
    await page.locator('#safetyNoticeAgree').check();await page.locator('#safetyNoticeContinue').click();
   }
   await page.waitForFunction(()=>typeof map!=='undefined'&&map&&map.isStyleLoaded());
   await page.evaluate(()=>VoyagrProfileStoreOrchestration.switchActiveProfile('guest'));
   await page.evaluate(({detour,requirements})=>{
    window.__labMounted=()=>VoyagrRouteComparisonOrchestration.getAllRouteLayers().concat(VoyagrCalculateRouteOrchestration.getRouteLayer()||[]).some(handle=>{
     const route=lastCalculatedRoute,source=handle.sourceId||handle.id,line=map.getLayer(handle.id),data=map.getStyle().sources[source]?.data;
     const fixed=points=>points.map(point=>point.map(value=>Math.round(value*1e6)));
     return handle._added===true&&line?.type==='line'&&line.source===source&&!!map.getSource(source)&&data?.geometry?.type==='LineString'&&JSON.stringify(fixed(data.geometry.coordinates))===JSON.stringify(fixed(route.polyline.map(point=>[point[1],point[0]])));
    });
    VoyagrAutoGpsOrchestration.setAutoGpsEnabled(false);VoyagrAutoGpsOrchestration.stopAutoGpsLocation();
    document.getElementById('optimizeStopOrder').checked=false;saveMultiDropPreferences();
    document.getElementById('preferQuiet').checked=true;document.getElementById('maxDetour').value=String(detour);saveRoutePreferences();
    localStorage.setItem('pref_avoid_motorways','true');localStorage.setItem('pref_avoidance_requirements',JSON.stringify(requirements));
    localStorage.setItem('uk-cache-sentinel','retained');
    window.__labOrigin=point=>{
     const input=document.getElementById('start');input.value=point.join(',');
     Object.assign(input.dataset,{lat:String(point[0]),lon:String(point[1]),displayName:input.value,journeySource:'coordinates'});
    };
    __labOrigin([0,0]);const end=document.getElementById('end');end.value='0,0.02';Object.assign(end.dataset,{lat:'0',lon:'0.02',displayName:end.value,journeySource:'coordinates'});
   },{detour,requirements});
   return {page,context,errors};
  }
  const stats=async client=>await (await client.page.request.get(origin+'/__lab__/evidence')).json();
  async function calculate(client,status=200){
   await client.page.waitForFunction(()=>map.loaded()&&!map.isMoving()&&!VoyagrJourneyModes.isJourneyCommitPending()).catch(()=>{throw Error('Map did not settle before Calculate');});
   await client.page.evaluate(()=>{window.__labPreviousResponse=window.lastRouteApiResponse;});
   const pending=client.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/route');
   await client.page.evaluate(()=>calculateRoute());const response=await pending;assert.equal(response.status(),status,phase);
   const data=await response.json();assert.equal(data.navigation_allowed,false);
   if(status===200){
    await client.page.waitForFunction(()=>window.lastRouteApiResponse!==__labPreviousResponse&&!VoyagrJourneyModes.isJourneyCommitPending()).catch(async()=>{
     const diagnostic=await client.page.evaluate(()=>({state:VoyagrJourneyModes.getState(),pending:VoyagrJourneyModes.isJourneyCommitPending(),changed:window.lastRouteApiResponse!==__labPreviousResponse,style:map.isStyleLoaded(),loaded:map.loaded(),moving:map.isMoving(),status:document.getElementById('journeyModeStatus')?.textContent}));
     throw Error('Calculate response did not commit '+JSON.stringify({diagnostic,errors:client.errors}));
    });
    await client.page.waitForFunction(()=>map.loaded()&&!map.isMoving()&&__labMounted()).catch(()=>{throw Error('Committed map geometry did not settle');});
    const accepted=(await stats(client)).accepted.at(-1);
    assert.deepEqual(accepted.app_request,response.request().postDataJSON());assert.equal(accepted.cache_policy,'private_complete_request');
    const selected=await client.page.evaluate(()=>({binding:lastCalculatedRoute.routing_context.request_binding,allowed:lastCalculatedRoute.navigation_allowed,automatic:lastCalculatedRoute.automatic_selection_allowed}));
    assert.equal(selected.binding,accepted.binding);assert.equal(selected.allowed,false);assert.equal(selected.automatic,false);
    const headers=await response.allHeaders();assert.ok(headers['cache-control'].includes('private')&&headers['cache-control'].includes('no-store'));
    return {binding:accepted.binding,request:accepted.app_request,headers};
   }
   return data;
  }
  const snapshot=async c=>await c.page.evaluate(()=>JSON.stringify({id:lastCalculatedRoute.id,geometry:lastCalculatedRoute.geometry,mounted:__labMounted(),binding:lastCalculatedRoute.routing_context.request_binding,rules:lastCalculatedRoute.avoidance_assessment.requirements,index:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),options:VoyagrRouteComparisonOrchestration.getRouteOptions().map(route=>route.id),marker:localStorage.getItem('uk-cache-sentinel'),live:VoyagrNavigationLifecycleOrchestration.getRouteInProgress()}));
  async function retained(client,before){
   const previous=JSON.parse(before),current=JSON.parse(await snapshot(client));
   for(const key of Object.keys(previous))if(key!=='mounted'&&JSON.stringify(previous[key])!==JSON.stringify(current[key]))throw Error('Retained '+key+' changed');
   // A preceding success can still have its owned delayed-preview redraw queued.
   // Require unchanged metadata immediately and exact mounted geometry once that
   // normal asynchronous rendering settles; permanent disappearance still fails.
   if(previous.mounted)await client.page.waitForFunction(()=>__labMounted());
   const settled=JSON.parse(await snapshot(client));
   for(const key of Object.keys(previous))if(JSON.stringify(previous[key])!==JSON.stringify(settled[key]))throw Error('Retained '+key+' changed');
  }
  const a=await boot();phase='same complete request';const first=await calculate(a),warm=await calculate(a);
  assert.equal(first.binding,warm.binding);let state=await stats(a);assert.equal(state.engine,1);assert.equal(state.validate,2);
  assert.ok(!('set-cookie' in warm.headers));
  const cookieA=(await a.context.cookies()).find(cookie=>cookie.name==='__Host-voyagr-gh11-scope');
  assert.ok(cookieA&&cookieA.secure&&cookieA.httpOnly&&cookieA.sameSite==='Strict'&&cookieA.path==='/');
  assert.equal(await a.page.evaluate(()=>document.cookie.includes('__Host-voyagr-gh11-scope')),false);
  phase='changed settings and old inspection selection';
  await a.page.evaluate(()=>{document.getElementById('maxDetour').value='18';saveRoutePreferences();});
  const old=await a.page.evaluate(()=>{
   const selected=VoyagrRouteComparisonOrchestration.selectRoute(1);
   return {selected,index:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),binding:lastCalculatedRoute.routing_context.request_binding,stale:lastCalculatedRoute.avoidance_preferences_snapshot!==VoyagrAvoidanceIntegrity.snapshot(localStorage),start:VoyagrNavigationLifecycleOrchestration.startTurnByTurnNavigation(lastCalculatedRoute)};
  });
  assert.equal(old.selected,true);assert.equal(old.index,1);assert.equal(old.binding,first.binding);assert.equal(old.stale,true);assert.equal(old.start,false);
  const changed=await calculate(a);assert.notEqual(changed.binding,first.binding);await calculate(a);
  state=await stats(a);assert.equal(state.engine,2);assert.equal(state.validate,4);
  phase='ordered visits cache binding';selectedCase='matrix_via';
  await a.page.evaluate(()=>{clearAllWaypoints();addViaPoint(.003,.006,'First synthetic via','coordinates');addViaPoint(.003,.014,'Second synthetic via','coordinates');});
  const via=await calculate(a);assert.notEqual(via.binding,changed.binding);await calculate(a);
  state=await stats(a);assert.equal(state.engine,3);assert.equal(state.validate,6);
  let before=await snapshot(a);phase='reversed visits cannot reuse warm evidence';
  await a.page.evaluate(()=>{clearAllWaypoints();addViaPoint(.003,.014,'Second synthetic via','coordinates');addViaPoint(.003,.006,'First synthetic via','coordinates');});
  await calculate(a,422);await retained(a,before);assert.equal((await stats(a)).validate,6);
  phase='registered changed origin';selectedCase='matrix_origin';
  await a.page.evaluate(()=>{clearAllWaypoints();__labOrigin([.003,.006]);});
  const originRoute=await calculate(a);assert.notEqual(originRoute.binding,via.binding);await calculate(a);
  state=await stats(a);assert.equal(state.engine,4);assert.equal(state.validate,8);
  before=await snapshot(a);phase='unregistered origin cannot reuse warm evidence';
  await a.page.evaluate(()=>__labOrigin([.0031,.006]));await calculate(a,422);
  await retained(a,before);assert.equal((await stats(a)).validate,8);
  phase='stale versions cannot reuse warm evidence';await a.page.evaluate(()=>__labOrigin([.003,.006]));
  for(const field of ['graph_version','source_version','policy_version']){
   version=field;await calculate(a,422);await retained(a,before);assert.equal((await stats(a)).validate,8);
  }
  version='';
  phase='unsupported mandatory rule cannot reuse warm evidence';
  await a.page.evaluate(()=>localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'railway_crossings',enabled:true,mode:'mandatory'}])));
  await calculate(a,422);await retained(a,before);state=await stats(a);assert.equal(state.engine,4);assert.equal(state.validate,8);
  phase='fresh complete request for private browser separation';selectedCase='matrix_3';
  await a.page.evaluate(requirements=>{clearAllWaypoints();__labOrigin([0,0]);document.getElementById('maxDetour').value='19';saveRoutePreferences();localStorage.setItem('pref_avoidance_requirements',JSON.stringify(requirements));},requirements);
  const privateA=await calculate(a);assert.equal((await stats(a)).engine,5);
  const b=await boot(19);phase='independent browser scope';const privateB=await calculate(b);
  assert.deepEqual(privateB.request,privateA.request);assert.equal(privateB.binding,privateA.binding);assert.equal((await stats(b)).engine,6);
  const cookieB=(await b.context.cookies()).find(cookie=>cookie.name==='__Host-voyagr-gh11-scope');assert.ok(cookieB&&cookieB.value!==cookieA.value);
  await calculate(b);state=await stats(b);assert.equal(state.engine,6);assert.equal(state.validate,11);
  phase='corrupt cached raw evidence refuses without Java fallback';before=await snapshot(b);fault='cached_metrics';
  await calculate(b,422);await retained(b,before);state=await stats(b);
  assert.equal(state.engine,6);assert.equal(state.validate,12);assert.equal(state.route,18);assert.equal(state.refused,7);assert.equal(state.cache.size,0);
  assert.equal(await b.page.evaluate(()=>VoyagrNavigationLifecycleOrchestration.startTurnByTurnNavigation(lastCalculatedRoute)),false);
  console.log(JSON.stringify({status:'PASS_UK_PRIVATE_CACHE_SELECTION',same_request_revalidated:true,changed_inputs_separated:true,private_browser_scopes:true,corrupt_cache_refused:true,engine:state.engine,validate:state.validate,route:state.route,external_requests_sent:0,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }catch(error){throw Error('UK cache '+phase+': '+error.message);}
 finally{for(const context of contexts)await context.close();await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
