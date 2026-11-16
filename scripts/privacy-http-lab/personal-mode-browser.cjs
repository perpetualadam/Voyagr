'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 let checks=0;
 const check=(label,condition)=>{assert.ok(condition,label);checks++;console.log('PASS: '+label);};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const forbidden=[],errors=[];
  page.on('pageerror',e=>errors.push(e.name));
  await page.addInitScript(()=>{
   localStorage.setItem('voyagr_public_auth_config_v1',JSON.stringify({version:1,origin:location.origin,fetchedAt:Date.now(),config:{supabase_url:'https://old-account.invalid',supabase_anon_key:'synthetic-public-key',require_login:true}}));
   localStorage.setItem('personal-retained-marker','keep');
  });
  await page.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.origin!=='http://127.0.0.1:5000'){
    if(/old-account|supabase|stripe|google-analytics|googletagmanager/.test(u.hostname))forbidden.push('external-account-or-analytics');
    return r.abort();
   }
   if(u.pathname==='/api/me'||u.pathname.startsWith('/api/coupons/')||u.pathname==='/api/support/stripe-checkout')forbidden.push('account-action');
   if(u.pathname.startsWith('/map/'))return r.fulfill({contentType:'application/json',body:JSON.stringify({version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#eee'}}]})});
   return r.continue();
  });
  await page.goto('http://127.0.0.1:5000/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoyagrLocalData&&window.VoyagrSupabaseAuthOrchestration&&window.VoyagrSpeedWidgetOrchestration&&window.VoyagrNavigationLifecycleOrchestration);
  await page.evaluate(()=>VoyagrLocalData.ready());await page.waitForTimeout(1500);
  check('Personal shell boots a coherent actual application',await page.evaluate(()=>document.documentElement.dataset.personalMode==='true'&&!document.getElementById('voyagr-asset-error')));
  check('Account and billing controls are absent',await page.locator('#accountSection,#softAuthBanner,#authRequiredGate,#supportVoyagrSection').count()===0);
  check('Premium toolbar action is absent',await page.locator('button[onclick="openVoyagerPremiumSection()"]').count()===0);
  check('Account SDK and client are not initialized',await page.evaluate(()=>typeof supabase==='undefined'&&!window.supabaseClient));
  const config=await page.evaluate(()=>fetch('/api/config').then(r=>r.json()));
  check('Old server account configuration cannot require login',config.personal_mode===true&&config.require_login===false&&config.supabase_url===''&&config.supabase_anon_key==='');
  check('Billing configuration remains unavailable',config.stripe_subscription_checkout_available===false&&config.stripe_payment_link_url==='');
  check('Device owner remains guest',await page.evaluate(()=>VoyagrLocalData.getOwner()==='guest'));
  await page.evaluate(()=>VoyagrLocalData.update('favourites',()=>[{id:'personal-fixture',name:'Local fixture'}]));
  await page.evaluate(()=>VoyagrSupabaseAuthOrchestration.initSupabaseAuth());
  check('Reinitializing personal mode preserves device records',await page.evaluate(async()=> (await VoyagrLocalData.read('favourites'))[0].name==='Local fixture'));
  check('Cached account bootstrap is retired without erasing unrelated storage',await page.evaluate(()=>localStorage.getItem('voyagr_public_auth_config_v1')===null&&localStorage.getItem('personal-retained-marker')==='keep'));
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.VoyagrLocalData&&window.VoyagrSupabaseAuthOrchestration);await page.evaluate(()=>VoyagrLocalData.ready());await page.waitForTimeout(1000);
  check('Reload preserves guest device records without account hydration',await page.evaluate(async()=>(await VoyagrLocalData.read('favourites'))[0].name==='Local fixture'));
  check('No auth/billing/analytics bootstrap requests were sent',forbidden.length===0);
  check('Actual personal page has no uncaught exceptions',errors.length===0);
  console.log(checks+' personal-mode Chromium checks passed. Synthetic local data; not production verification.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
