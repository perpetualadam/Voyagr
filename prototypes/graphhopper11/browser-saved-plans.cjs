'use strict';
// Real IndexedDB and HTTP. All records/owners are synthetic in a fresh context.
const assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const target=new URL(process.argv[2]);
if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!target.port||target.pathname!=='/'||target.username||target.password)throw Error('Loopback origin required');
let phase='startup';
async function main(){
 let browser,context;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{}),args:['--no-sandbox'],timeout:20000});
  context=await browser.newContext({httpCredentials:{username:'prototype',password:'f'.repeat(64)},serviceWorkers:'block'});
  const errors=[];let external=0;
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==target.origin){external++;return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>errors.push('pageerror'));
  const id=name=>page.locator('#'+name);
  const ready=()=>page.waitForFunction(()=>!document.getElementById('calculate').disabled);
  async function open(name){await page.locator('details').filter({has:id(name)}).evaluate(element=>{element.open=true;});}
  async function load(){await id('loadSavedPlans').click();await page.waitForFunction(()=>document.getElementById('savedPlanStatus').textContent.includes('saved entry/entries'));}
  async function calculate(caseId){
   await id('cases').selectOption(caseId);await open('useCompleteRequest');
   if(!await id('useCompleteRequest').isChecked())await id('useCompleteRequest').check();
   await id('loadCompleteRequest').click();await id('calculate').click();
   await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));await ready();
   const ref=JSON.parse(await id('planReference').inputValue());assert.equal(ref.schema,3);assert.equal(await id('strictStart').isDisabled(),true);return ref;
  }
  phase='guest save';await page.goto(target.href);await ready();
  await page.evaluate(async()=>{
   localStorage.setItem('gh11-saved-marker','synthetic-retained');
   const legacy=VoyagrLocalStore.create(indexedDB);await legacy.update('guest','routes',()=>[{id:'legacy-sentinel',geometry:'untouched'}]);legacy.close();
  });
  const original=await calculate('detour');await open('saveCurrentPlan');await id('saveCurrentPlan').click();
  await page.waitForFunction(()=>document.getElementById('savedPlanStatus').textContent.includes('Saved this validated'));
  assert.equal(await id('savedPlans').locator('option').count(),1);
  phase='reload and fresh restoration';await page.reload();await ready();
  await page.evaluate(()=>{
   let identity={owner:'guest',epoch:0};
   const source={capture:()=>({...identity}),current:token=>token.owner===identity.owner&&token.epoch===identity.epoch,ready:()=>{throw Error('Migration forbidden');},db:()=>{throw Error('Production collections forbidden');}};
   window.changeSyntheticOwner=owner=>{identity={owner,epoch:identity.epoch+1};window.dispatchEvent(new Event('voyagr-local-owner-change'));};
   VoyagrGH11SavedSession.bindOwnerCoordinator(source,window);
  });
  await open('loadSavedPlans');await load();
  await id('restoreSavedPlan').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));await ready();
  assert.deepEqual(JSON.parse(await id('planReference').inputValue()),original);
  const stored=await page.evaluate(async()=>{
   const preview=VoyagrLocalStore.create(indexedDB,{name:VoyagrGH11SavedPlans.DB_NAME});const rows=await preview.read('guest','routes');preview.close();return rows;
  });
  assert.deepEqual(Object.keys(stored[0]).sort(),['id','reference','saved_at','schema']);assert.deepEqual(stored[0].reference,original);
  phase='independent owner';await page.evaluate(()=>changeSyntheticOwner('sb:synthetic_b'));
  assert.equal(await id('line').getAttribute('points'),'');await load();assert.equal(await id('savedPlans').locator('option').count(),0);
  assert.equal(await page.evaluate(async id=>{try{await VoyagrGH11SavedSession.get(id);return false;}catch(_){return true;}},original.request_binding),true);
  const other=await calculate('via');await id('saveCurrentPlan').click();
  await page.waitForFunction(()=>document.getElementById('savedPlanStatus').textContent.includes('Saved this validated'));
  phase='return to original owner';await page.evaluate(()=>changeSyntheticOwner('guest'));await load();
  assert.equal(await id('savedPlans').locator('option').count(),1);
  assert.equal(await page.evaluate(async id=>{try{await VoyagrGH11SavedSession.get(id);return false;}catch(_){return true;}},other.request_binding),true);
  phase='owner change during restore';assert.equal((await context.request.post(target.origin+'/__test/reset-saved-restore')).status(),200);
  await id('restoreSavedPlan').click();
  await expect.poll(async()=>(await(await context.request.get(target.origin+'/__test/saved-restore-state')).json()).entered,{timeout:5000}).toBe(true);
  await page.evaluate(()=>changeSyntheticOwner('sb:synthetic_b'));
  await expect.poll(async()=>(await(await context.request.get(target.origin+'/__test/saved-restore-state')).json()).completed,{timeout:15000}).toBe(true);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await id('line').getAttribute('points'),'');assert.equal(await id('planReference').inputValue(),'');assert.equal(await id('strictStart').isDisabled(),true);
  assert.ok((await id('savedPlanOwner').textContent()).includes('sb:synthetic_b'));
  phase='retained data';const retained=await page.evaluate(async()=>{
   const legacy=VoyagrLocalStore.create(indexedDB);const rows=await legacy.read('guest','routes');legacy.close();
   return {rows,marker:localStorage.getItem('gh11-saved-marker'),own:await VoyagrGH11SavedSession.list()};
  });
  assert.deepEqual(retained.rows,[{id:'legacy-sentinel',geometry:'untouched'}]);assert.equal(retained.marker,'synthetic-retained');assert.equal(retained.own.length,1);
  phase='ephemeral journey boundary';const journeyGuard=await page.evaluate(async()=>{
   let generation=1,active=true,simulating=false;const fix={lat:0,lon:0,accuracy:10,timestamp:Date.now()};
   const journey={capture:()=>({route_id:'synthetic_public',generation,active,simulating}),current:value=>value.generation===generation&&value.active===active&&value.simulating===simulating};
   const guard=VoyagrGH11JourneyEvidence.create({owner:VoyagrGH11SavedSession,journey,gps:{getAcceptedOriginFix:()=>fix}});
   const token=guard.capture();const opaque=Object.keys(token).length===0&&guard.current(token);
   let finish;const pending=guard.run(()=>new Promise(resolve=>{finish=resolve;}));generation++;finish('late');
   let refused=false;try{await pending;}catch(_){refused=true;}
   simulating=true;let simulationRefused=false;try{guard.capture();}catch(_){simulationRefused=true;}
   guard.close();return {opaque,refused,simulationRefused,closed:!guard.current(token)};
  });
  assert.deepEqual(journeyGuard,{opaque:true,refused:true,simulationRefused:true,closed:true});
  phase='bound preview journey';await page.evaluate(()=>{
   let intent=1,binding=null;const fix={lat:0,lon:0,accuracy:10,timestamp:Date.now()},line=[[0,0],[0,.01]];
   const modes={captureIntent:()=>intent,intentCurrent:value=>value===intent,onIntentCancelled:()=>()=>{},getState:()=> 'LIVE',isSimulating:()=>false,isJourneyCommitPending:()=>false,isAbandoning:()=>false};
   const lifecycle={getRouteInProgress:()=>true,getRoutePolyline:()=>line,getNavigationStarting:()=>false,getNavigationFailure:()=>null};
   const host=VoyagrGH11HostJourney.create({owner:VoyagrGH11SavedSession,modes,lifecycle,gps:{getAcceptedOriginFix:()=>fix},eventTarget:window,onChange:()=>binding?.refresh()});
   binding=VoyagrGH11JourneyBridge.bind(host);
   window.advanceSyntheticJourney=notify=>{intent++;fix.timestamp=Date.now();if(notify)host.refresh();};
  });
  const boundReference=await calculate('detour');
  assert.notEqual(await id('line').getAttribute('points'),'');
  await page.evaluate(()=>advanceSyntheticJourney(false));await id('alternatives').dispatchEvent('change');
  assert.equal(await id('line').getAttribute('points'),'');assert.equal(await id('planReference').inputValue(),'');
  phase='journey change during actual restore';assert.equal((await context.request.post(target.origin+'/__test/reset-saved-restore')).status(),200);
  await open('planReference');await id('planReference').fill(JSON.stringify(boundReference));await id('restore').click();
  await expect.poll(async()=>(await(await context.request.get(target.origin+'/__test/saved-restore-state')).json()).entered,{timeout:5000}).toBe(true);
  await page.evaluate(()=>advanceSyntheticJourney(true));
  await expect.poll(async()=>(await(await context.request.get(target.origin+'/__test/saved-restore-state')).json()).completed,{timeout:15000}).toBe(true);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await id('line').getAttribute('points'),'');assert.equal(await id('planReference').inputValue(),'');assert.equal(await id('saveCurrentPlan').isDisabled(),true);assert.equal(await id('strictStart').isDisabled(),true);
  assert.deepEqual(errors,[]);assert.equal(external,0);
  console.log(JSON.stringify({status:'PASS_OWNER_SAVED_PLANS',external_requests:0,navigation_allowed:false,synthetic_storage_retained:true,phone_acceptance:'UNVERIFIED'}));
 }finally{if(context)await context.close();if(browser)await browser.close();}
}
main().catch(error=>{console.error('FAIL: isolated saved-plan phase '+phase+' ('+error.name+')');process.exitCode=1;});
