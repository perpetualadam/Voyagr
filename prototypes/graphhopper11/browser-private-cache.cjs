'use strict';
// Fresh contexts and a temporary self-signed loopback TLS server only.
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const target=new URL(process.argv[2]);
if(target.protocol!=='https:'||target.hostname!=='127.0.0.1'||!target.port||target.pathname!=='/'||target.username||target.password)throw Error('Loopback TLS origin required');
let phase='startup';
async function main(){
 let browser;const contexts=[];let external=0;const errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{}),args:['--no-sandbox'],timeout:20000});
  async function client(){
   const context=await browser.newContext({ignoreHTTPSErrors:true,httpCredentials:{username:'prototype',password:'f'.repeat(64)},serviceWorkers:'block'});contexts.push(context);
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==target.origin){external++;return route.abort();}return route.continue();});
   const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>errors.push('pageerror'));
   await page.goto(target.href);await page.waitForFunction(()=>!document.getElementById('calculate').disabled);
   await page.locator('#cases').selectOption('detour');
   await page.locator('details').filter({has:page.locator('#useCompleteRequest')}).evaluate(element=>{element.open=true;});
   await page.locator('#useCompleteRequest').check();
   return {context,page,body:JSON.parse(await page.locator('#completeRequest').inputValue())};
  }
  async function calculate(c,body,policy){
   await c.page.locator('#completeRequest').fill(JSON.stringify(body));
   const pending=c.page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/app-route');
   await c.page.locator('#calculate').click();const response=await pending;assert.equal(response.status(),200);
   const result=await response.json();await c.page.waitForFunction(()=>!document.getElementById('calculate').disabled);
   assert.ok((await c.page.locator('#status').textContent()).includes('route(s) passed'));
   assert.equal(result.cache_policy,policy);assert.equal(result.navigation_allowed,false);
   assert.equal(await c.page.locator('#strictStart').isDisabled(),true);
   return {result,headers:await response.allHeaders()};
  }
  phase='first private request';const a=await client();
  await a.page.evaluate(()=>localStorage.setItem('gh11-private-marker','synthetic-retained'));
  const first=await calculate(a,a.body,'private_complete_request');
  const name='__Host-voyagr-gh11-scope',cookie=(await a.context.cookies()).find(c=>c.name===name);
  assert.ok(cookie&&cookie.secure&&cookie.httpOnly&&cookie.sameSite==='Strict'&&cookie.path==='/'&&cookie.domain==='127.0.0.1');
  assert.equal(await a.page.evaluate(()=>document.cookie.includes('__Host-voyagr-gh11-scope')),false);
  phase='private cache hit';const again=await calculate(a,a.body,'private_complete_request');
  assert.equal(again.result.request_binding,first.result.request_binding);assert.equal(again.headers['set-cookie'],undefined);
  phase='independent browser';const b=await client();await calculate(b,b.body,'private_complete_request');
  assert.notEqual((await b.context.cookies()).find(c=>c.name===name).value,cookie.value);
  phase='changed request';await calculate(a,{...a.body,max_detour:21},'private_complete_request');
  phase='original private request';await calculate(a,a.body,'private_complete_request');
  phase='forced refresh';await calculate(a,{...a.body,force_refresh:true},'bypass_complete_app_request');
  phase='reroute bypass';await calculate(a,{...a.body,is_reroute:true},'bypass_complete_app_request');
  phase='fresh restore';await a.page.locator('details').filter({has:a.page.locator('#planReference')}).evaluate(element=>{element.open=true;});
  await a.page.locator('#planReference').fill(JSON.stringify(first.result.plan_reference));
  const pending=a.page.waitForResponse(res=>new URL(res.url()).pathname==='/api/prototype/app-restore');
  await a.page.locator('#restore').click();const restored=await pending;assert.equal(restored.status(),200);
  assert.equal((await restored.json()).cache_policy,'bypass_complete_app_request');
  await a.page.waitForFunction(()=>!document.getElementById('calculate').disabled);
  phase='invalid test capability';await a.context.addCookies([{name,value:'invalid',url:target.origin+'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  await calculate(a,a.body,'private_complete_request');
  assert.notEqual((await a.context.cookies()).find(c=>c.name===name).value,cookie.value);
  assert.equal(await a.page.evaluate(()=>localStorage.getItem('gh11-private-marker')),'synthetic-retained');
  assert.equal(external,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS_PRIVATE_CACHE_HTTPS',external_requests:0,navigation_allowed:false,synthetic_storage_retained:true,phone_acceptance:'UNVERIFIED'}));
 }finally{for(const context of contexts)await context.close();if(browser)await browser.close();}
}
main().catch(error=>{console.error('FAIL: isolated private cache phase '+phase+' ('+error.name+')');process.exitCode=1;});
