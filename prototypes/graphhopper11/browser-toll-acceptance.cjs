'use strict';
// Fresh loopback-only browser context; no production origin, GPS or real storage.
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const target=new URL(process.argv[2]);
if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!target.port||target.pathname!=='/'||target.username||target.password)throw Error('Loopback origin required');
async function main(){
 let browser,context;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{}),args:['--no-sandbox']});
  context=await browser.newContext({httpCredentials:{username:'prototype',password:'f'.repeat(64)},serviceWorkers:'block'});
  const external=[],errors=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==target.origin){external.push('external');return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>errors.push('pageerror'));
  const id=name=>page.locator('#'+name);
  const ready=()=>page.waitForFunction(()=>!document.getElementById('calculate').disabled&&!document.getElementById('restore').disabled);
  async function open(name){await page.locator('details').filter({has:id(name)}).evaluate(element=>{element.open=true;});}
  await page.goto(target.href);await ready();await id('cases').selectOption('toll_excluded');
  await page.evaluate(()=>localStorage.setItem('gh11-toll-marker','retained'));
  await open('useCompleteRequest');await id('useCompleteRequest').check();await id('loadCompleteRequest').click();
  const supplied={...JSON.parse(await id('completeRequest').inputValue()),avoid_tolls:true,avoidance_mode:'mandatory'};
  await id('completeRequest').fill(JSON.stringify(supplied));
  const pending=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/app-route');
  await id('calculate').click();const response=await pending;assert.equal(response.status(),200);
  const result=await response.json();await ready();
  const rule=result.policy_report.rules.find(row=>row.category==='tolls');
  assert.equal(rule.mode,'mandatory');assert.equal(rule.state,'COMPILED');assert.equal(rule.enabled,true);
  assert.deepEqual(result.app_request_context.app_request,supplied);
  for(const row of result.candidates){assert.ok(row.toll_observations.length>0);assert.ok(row.toll_observations.every(item=>item.toll==='NO'));assert.equal(row.toll_data_coverage,'UNVERIFIED');}
  assert.ok((await id('line').getAttribute('points')).length>0);assert.equal(await id('strictStart').isDisabled(),true);
  await open('planReference');await id('planReference').fill(JSON.stringify(result.plan_reference));
  const restoring=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/app-restore');
  await id('restore').click();assert.equal((await restoring).status(),200);await ready();
  const points=await id('line').getAttribute('points');
  await id('completeRequest').fill(JSON.stringify({...supplied,avoid_ferries:true}));
  const refusing=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/app-policy');
  await id('calculate').click();assert.equal((await refusing).status(),422);await ready();
  assert.equal(await id('line').getAttribute('points'),points);assert.equal(await id('strictStart').isDisabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gh11-toll-marker')),'retained');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS_ISOLATED_TOLL_HTTP',external_requests:0,navigation_allowed:false,synthetic_storage_retained:true,phone_acceptance:'UNVERIFIED'}));
 }finally{if(context)await context.close();if(browser)await browser.close();}
}
main().catch(error=>{console.error('FAIL: isolated mapped-toll browser ('+error.name+'): '+error.message);process.exitCode=1;});
