'use strict';
// Real Chromium -> real loopback Flask -> real local GH11. No response mocks.
const assert=require('node:assert/strict');
const {chromium,request}=require('@playwright/test');
const target=new URL(process.argv[2]);
if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.pathname!=='/'||!target.port||target.username||target.password)throw Error('Loopback origin required');
let phase='startup';
async function main(){
 let browser,context,anonymous;
 try{
  anonymous=await request.newContext();
  assert.equal((await anonymous.get(target.href)).status(),401);
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{}),args:['--no-sandbox'],timeout:20000});
  context=await browser.newContext({httpCredentials:{username:'prototype',password:'f'.repeat(64)},serviceWorkers:'block'});
  const external=[],errors=[],routes=[];
  await context.route('**/*',route=>{
   if(new URL(route.request().url()).origin!==target.origin){external.push('external');return route.abort();}
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',()=>errors.push('pageerror'));
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/prototype/route')routes.push('route');});
  const id=name=>page.locator('#'+name);
  async function ready(){await id('calculate').waitFor();await page.waitForFunction(()=>!document.getElementById('calculate').disabled);}
  async function open(name){await page.locator('details').filter({has:id(name)}).evaluate(element=>{element.open=true;});}
  async function retained(points,settings){
   assert.equal(await id('line').getAttribute('points'),points);
   assert.deepEqual(JSON.parse(await id('appSettings').inputValue()),settings);
   assert.equal(await id('strictStart').isDisabled(),true);
  }
  phase='authenticated viewer';await page.goto(target.href);await ready();
  await id('cases').selectOption('detour');
  await page.evaluate(()=>{localStorage.setItem('gh11-test-marker','synthetic-retained');sessionStorage.setItem('gh11-test-marker','synthetic-session');});
  await open('useAppSettings');await id('useAppSettings').check();
  const settings={routing_mode:'auto',vehicle_type:'petrol_diesel',avoid_caz:false,avoid_tolls:true,avoidance_mode:'preference',prefer_scenic:true,route_optimization:'scenic',max_detour:20};
  await id('appSettings').fill(JSON.stringify(settings));
  phase='full settings calculation';
  const response=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/route');
  await id('calculate').click();const routed=await response;assert.equal(routed.status(),200);
  const result=await routed.json();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));
  assert.deepEqual(result.policy_report.selected.app_settings,settings);
  assert.equal(result.policy_report.app_integration_allowed,false);
  assert.equal(result.navigation_allowed,false);
  assert.ok(result.candidates.every(row=>row.forbidden_traversals===0));
  const points=await id('line').getAttribute('points');assert.ok(points.length>0);
  assert.ok((await id('policyDecisions').textContent()).includes('Max detour'));
  const saved=JSON.parse(await id('planReference').inputValue());
  assert.deepEqual(saved.policy_request.app_settings,settings);
  phase='restoration';await id('appSettings').fill(JSON.stringify({...settings,max_detour:99}));
  await open('planReference');await id('planReference').fill(JSON.stringify(saved));
  const restored=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/restore');
  await id('restore').click();assert.equal((await restored).status(),200);await ready();await retained(points,settings);
  phase='next calculation';const repeated=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/route');
  await id('calculate').click();const repeat=await repeated;assert.equal(repeat.status(),200);
  assert.deepEqual((await repeat.json()).plan_reference.policy_request.app_settings,settings);await ready();
  phase='mandatory refusal';const mandatory={...settings,avoidance_mode:'mandatory'};
  await id('appSettings').fill(JSON.stringify(mandatory));const count=routes.length;
  const refused=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/policy');
  await id('calculate').click();assert.equal((await refused).status(),422);await ready();
  assert.ok((await id('status').textContent()).includes('could not be compiled'));
  assert.equal(routes.length,count);await retained(points,mandatory);
  phase='changed reference';const changed=JSON.parse(JSON.stringify(saved));changed.policy_request.app_settings.max_detour=21;
  await id('planReference').fill(JSON.stringify(changed));await id('restore').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Plan reference changed'));
  assert.equal(routes.length,count);await retained(points,mandatory);
  phase='offline refusal';await id('planReference').fill(JSON.stringify(saved));await context.setOffline(true);
  await id('restore').click();await page.waitForFunction(()=>document.getElementById('status').textContent!=='Restoring and checking…');
  await ready();await retained(points,mandatory);await context.setOffline(false);
  phase='reload and retained storage';await page.reload();await ready();
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('gh11-test-marker'),sessionStorage.getItem('gh11-test-marker')]),['synthetic-retained','synthetic-session']);
  await open('planReference');await id('planReference').fill(JSON.stringify(saved));
  await id('restore').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));
  await retained(points,settings);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS_ISOLATED_CHROMIUM_HTTP',anonymous_http:401,route_http:200,restore_http:200,mandatory_http:422,changed_reference_refused:true,offline_preview_retained:true,synthetic_storage_retained:true,external_requests:0,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }finally{
  if(context)await context.close();if(browser)await browser.close();if(anonymous)await anonymous.dispose();
 }
}
main().catch(error=>{console.error('FAIL: isolated GH11 browser phase '+phase+' ('+error.name+')');process.exitCode=1;});
