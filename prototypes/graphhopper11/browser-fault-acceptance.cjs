'use strict';
// Faults are injected by the temporary test server, never mocked in the browser.
const assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const target=new URL(process.argv[2]);
if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.pathname!=='/'||!target.port||target.username||target.password)throw Error('Loopback origin required');
let phase='startup';
async function main(){
 let browser,context;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{}),args:['--no-sandbox'],timeout:20000});
  context=await browser.newContext({httpCredentials:{username:'prototype',password:'f'.repeat(64)},serviceWorkers:'block'});
  const external=[],errors=[],requests=[];
  await context.route('**/*',route=>{
   if(new URL(route.request().url()).origin!==target.origin){external.push('external');return route.abort();}
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',()=>errors.push('pageerror'));
  page.on('request',req=>{if(req.method()==='POST')requests.push(new URL(req.url()).pathname);});
  const id=name=>page.locator('#'+name);
  async function open(name){await page.locator('details').filter({has:id(name)}).evaluate(element=>{element.open=true;});}
  async function ready(){await page.waitForFunction(()=>!document.getElementById('calculate').disabled&&!document.getElementById('restore').disabled);}
  async function control(mode){assert.equal((await context.request.post(target.origin+'/__test/control',{data:{mode}})).status(),200);}
  async function retained(points,settings){
   assert.equal(await id('line').getAttribute('points'),points);
   assert.deepEqual(JSON.parse(await id('appSettings').inputValue()),settings);
   assert.equal(await id('strictStart').isDisabled(),true);
   assert.equal(await page.evaluate(()=>localStorage.getItem('gh11-fault-marker')),'synthetic-retained');
  }
  phase='initial preview';await page.goto(target.href);await ready();await id('cases').selectOption('detour');
  await page.evaluate(()=>localStorage.setItem('gh11-fault-marker','synthetic-retained'));
  await open('useAppSettings');await id('useAppSettings').check();
  const original={avoid_caz:false,avoid_tolls:true,avoidance_mode:'preference',max_detour:20};
  await id('appSettings').fill(JSON.stringify(original));await id('calculate').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));
  const points=await id('line').getAttribute('points');assert.ok(points.length>0);
  const saved=JSON.parse(await id('planReference').inputValue());await open('planReference');
  for(const endpoint of ['policy','route'])for(const status of [401,403]){
   phase=endpoint+' denial '+status;
   const current={...original,max_detour:30};await id('appSettings').fill(JSON.stringify(current));
   await control('deny_'+endpoint+'_'+status);
   const before=requests.filter(path=>path==='/api/prototype/route').length;
   const denied=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/'+endpoint&&res.status()===status);
   await id('calculate').click();await denied;await ready();
   assert.ok((await id('status').textContent()).includes('Request refused ('+status+')'));
   assert.equal(requests.filter(path=>path==='/api/prototype/route').length,before+(endpoint==='route'?1:0));
   await retained(points,current);
   phase=endpoint+' recovery '+status;await control('none');
   await id('planReference').fill(JSON.stringify(saved));await id('restore').click();
   await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));
   await ready();await retained(points,original);
  }
  phase='delayed preflight';await control('hold_policy');
  const before=requests.filter(path=>path==='/api/prototype/route').length;
  await id('calculate').click();
  await expect.poll(async()=>(await(await context.request.get(target.origin+'/__test/state')).json()).entered,{timeout:5000}).toBe(true);
  const edited={...original,max_detour:44};await id('appSettings').fill(JSON.stringify(edited));
  await control('none');
  await expect.poll(async()=>(await(await context.request.get(target.origin+'/__test/state')).json()).completed,{timeout:5000}).toBe(true);
  await page.evaluate(()=>new Promise(requestAnimationFrame));await ready();
  assert.ok((await id('status').textContent()).includes('superseded'));
  assert.equal(requests.filter(path=>path==='/api/prototype/route').length,before);await retained(points,edited);
  phase='fresh recovery';await id('calculate').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('route(s) passed'));await ready();
  assert.deepEqual(JSON.parse(await id('planReference').inputValue()).policy_request.app_settings,edited);
  await retained(points,edited);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS_ISOLATED_CHROMIUM_FAULTS',denial_statuses:[401,403],denial_paths:['policy','route'],delayed_preflight_superseded:true,synthetic_storage_retained:true,external_requests:0,navigation_allowed:false,phone_acceptance:'UNVERIFIED'}));
 }finally{if(context)await context.close();if(browser)await browser.close();}
}
main().catch(error=>{console.error('FAIL: isolated GH11 fault phase '+phase+' ('+error.name+')');process.exitCode=1;});
