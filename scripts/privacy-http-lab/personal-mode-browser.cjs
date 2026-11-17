'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 let checks=0;
 const check=(label,condition)=>{assert.ok(condition,label);checks++;console.log('PASS: '+label);};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const forbidden=[],errors=[];let denyPrivateConfig=false;
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
   if(u.pathname==='/api/config'&&denyPrivateConfig)return r.fulfill({status:403,body:'Private'});
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
  const warningText=await page.evaluate(()=>{
   const previous=window.lastCalculatedRoute;
   try{
    window.lastCalculatedRoute=VoyagrRouteSelection.normalizeRouteOption({hazards:[{type:'camera_speed',lat:53.501,lon:-1.2}],warning_coverage:{traffic_light:{status:'PARTIAL'},railway_crossing:{status:'UNKNOWN'}}},{decodePolyline:()=>[[53.5,-1.2],[53.502,-1.2]]});
    VoyagrGpsOrchestration.processNavigationHazardAlerts(53.5,-1.2);
    return document.getElementById('routeHazardDataStatus').textContent;
   }finally{window.lastCalculatedRoute=previous;}
  });
  check('Personal route Info retains partial and unknown warning coverage',warningText.includes('partial mapped coverage')&&warningText.includes('coverage unknown'));

  denyPrivateConfig=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.locator('#privateAccessNotice').waitFor({state:'visible'});
  check('Actual personal shell exposes a fresh private-login action after gate denial',await page.locator('#privateAccessNotice a').getAttribute('href').then(h=>h.startsWith('/privacy?private-login=')));
  denyPrivateConfig=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.locator('#privateAccessNotice').waitFor({state:'hidden'});
  check('Actual personal shell clears the notice after successful network access',await page.locator('#privateAccessNotice').isHidden());
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
})().then(()=>require('node:child_process').execFileSync(process.execPath,[require('node:path').join(__dirname,'private-access-browser.cjs')],{stdio:'inherit'})).then(()=>require('node:child_process').execFileSync(process.execPath,[require('node:path').join(__dirname,'route-warning-browser.cjs')],{stdio:'inherit'})).catch(e=>{console.error(e.message);process.exitCode=1});
