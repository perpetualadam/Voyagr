'use strict';
// Real complete-request browser workflow; only fresh synthetic loopback fixtures.
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const target=new URL(process.argv[2]);
if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!target.port||target.pathname!=='/'||target.username||target.password)throw Error('Loopback origin required');
let phase='startup';
async function main(){
 let browser,context;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{}),args:['--no-sandbox'],timeout:20000});
  context=await browser.newContext({httpCredentials:{username:'prototype',password:'f'.repeat(64)},serviceWorkers:'block'});
  const external=[],errors=[],posts=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==target.origin){external.push('external');return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>errors.push('pageerror'));
  page.on('request',req=>{if(req.method()==='POST')posts.push(new URL(req.url()).pathname);});
  const id=name=>page.locator('#'+name);
  const ready=()=>page.waitForFunction(()=>!document.getElementById('calculate').disabled&&!document.getElementById('restore').disabled);
  async function open(name){await page.locator('details').filter({has:id(name)}).evaluate(element=>{element.open=true;});}
  async function calculate(){
   const pending=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/app-route');
   await id('calculate').click();const response=await pending;assert.equal(response.status(),200);
   const result=await response.json();await ready();
   assert.ok((await id('status').textContent()).includes('route(s) passed'));
   assert.equal(result.cache_policy,'bypass_complete_app_request');assert.equal(result.navigation_allowed,false);
   assert.equal(result.app_integration_allowed,false);assert.equal(result.gps_verification,'UNVERIFIED');
   assert.ok(result.candidates.every(row=>row.forbidden_traversals===0));assert.equal(await id('strictStart').isDisabled(),true);
   return result;
  }
  phase='initial calculation';await page.goto(target.href);await ready();await id('cases').selectOption('detour');
  await page.evaluate(()=>localStorage.setItem('gh11-complete-marker','synthetic-retained'));
  await open('useCompleteRequest');await id('useCompleteRequest').check();
  const supplied={...JSON.parse(await id('completeRequest').inputValue()),fuel_price_mode:'manual',fuel_price:1.6,avoid_tolls:true};
  await id('completeRequest').fill(JSON.stringify(supplied));const result=await calculate();
  assert.deepEqual(result.app_request_context.app_request,supplied);assert.ok((await id('policyDecisions').textContent()).includes('unverified cost input'));
  const saved=result.plan_reference;assert.equal(saved.schema,3);
  phase='fresh restoration';await id('completeRequest').fill(JSON.stringify({...supplied,fuel_price:1.9}));
  await open('planReference');await id('planReference').fill(JSON.stringify(saved));
  await id('restore').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));
  await ready();assert.deepEqual(JSON.parse(await id('completeRequest').inputValue()),supplied);
  phase='next calculation';assert.deepEqual((await calculate()).app_request_context.app_request,supplied);
  phase='mandatory refusal';const points=await id('line').getAttribute('points');
  await id('completeRequest').fill(JSON.stringify({...supplied,avoidance_mode:'mandatory'}));
  const count=posts.filter(path=>path==='/api/prototype/app-route').length;
  const refusal=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/app-policy');
  await id('calculate').click();assert.equal((await refusal).status(),422);await ready();
  assert.equal(posts.filter(path=>path==='/api/prototype/app-route').length,count);assert.equal(await id('line').getAttribute('points'),points);
  phase='via request';await id('cases').selectOption('via');await id('loadCompleteRequest').click();
  const via=await calculate();assert.equal(via.app_request_context.visits.length,3);
  assert.ok(via.app_preview.routes.every(row=>row.leg_geometry_ranges.length===2));
  phase='reroute request';await id('cases').selectOption('departure');await id('loadCompleteRequest').click();
  const reroute={...JSON.parse(await id('completeRequest').inputValue()),is_reroute:true,force_refresh:true};
  await id('completeRequest').fill(JSON.stringify(reroute));const moved=await calculate();
  assert.equal(moved.app_request_context.is_reroute,true);assert.deepEqual(moved.app_request_context.visits[0],[.003,.01]);
  phase='alternatives';await id('cases').selectOption('alternatives');await id('loadCompleteRequest').click();
  const alternatives=await calculate();assert.ok(alternatives.candidates.length>=1&&alternatives.candidates.length<=3);
  for(let i=0;i<alternatives.candidates.length;i++){await id('alternatives').selectOption(String(i));assert.equal(await id('strictStart').isDisabled(),true);}
  phase='changed reference';const previous=await id('line').getAttribute('points'),current=await id('completeRequest').inputValue();
  const changed=JSON.parse(JSON.stringify(saved));changed.app_request.fuel_price=1.7;
  await id('planReference').fill(JSON.stringify(changed));await id('restore').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Plan reference changed'));
  assert.equal(await id('line').getAttribute('points'),previous);assert.equal(await id('completeRequest').inputValue(),current);
  phase='cross-case restore';await id('planReference').fill(JSON.stringify(saved));await id('restore').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));await ready();
  assert.equal(await id('cases').inputValue(),'detour');assert.deepEqual(JSON.parse(await id('completeRequest').inputValue()),supplied);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gh11-complete-marker')),'synthetic-retained');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS_ISOLATED_COMPLETE_HTTP',synthetic_storage_retained:true,external_requests:0,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }finally{if(context)await context.close();if(browser)await browser.close();}
}
main().catch(error=>{console.error('FAIL: isolated complete request phase '+phase+' ('+error.name+')');process.exitCode=1;});
