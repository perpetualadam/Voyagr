// Production recovery UI/lifecycle with synthetic map-resource checks, no provider or phone data.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
(async()=>{
 const template=read('templates/index.html'),markup=template.match(/<div class="navigation-recovery-actions"[\s\S]*?<\/div>/)[0]+template.match(/<p id="navigationRecoveryFeedback"[^>]*>[\s\S]*?<\/p>/)[0];
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{for(const width of [320,390,844]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',r=>r.request().url().startsWith('https://recovery-fixture.invalid/')?r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+read('static/css/voyagr.css')+'body{display:block;padding:12px}</style><p id="navigationStartExplanation"></p>'+markup+'<button data-navigation-start>Start navigation</button>'}):r.abort());
  await page.goto('https://recovery-fixture.invalid/');
  for(const p of ['static/js/app/navigation-lifecycle-orchestration.js','static/js/app/navigation-safety-ux.js'])await page.addScriptTag({content:read(p)});
  await page.evaluate(()=>{
   window.mapReady=false;window.lastCalculatedRoute={id:'previous',journey_continuation:{stops:['remaining']}};
   localStorage.setItem('retained-route-fixture','keep');
   VoyagrNavigationLifecycleOrchestration.bind({getMap:()=>({isStyleLoaded:()=>mapReady}),getMapLibreHelpers:()=>({reconcilePolylineLayers:()=>true}),getRouteLayer:()=>null,setRouteLayer:()=>{},call:{clearAllRouteLayerHandles:()=>true,showStatus:()=>{}}});
   VoyagrNavigationLifecycleOrchestration.setRouteInProgress(true);
   VoyagrNavigationLifecycleOrchestration.failNavigation('inconsistent_map');
  });
  const recover=page.getByRole('button',{name:'Check map recovery'});
  assert.equal(await recover.isEnabled(),true);
  await recover.click();assert.match(await page.textContent('#navigationRecoveryFeedback'),/did not pass/);
  assert.equal(await page.evaluate(()=>VoyagrNavigationLifecycleOrchestration.getNavigationFailure()),'inconsistent_map');
  for(const scale of [1,2]){
   await page.evaluate(s=>{document.documentElement.style.fontSize=16*s+'px';document.querySelector('[data-journey-abandon]').hidden=false;},scale);
   for(const label of ['Check map recovery','End previous journey']){
    const box=await page.getByRole('button',{name:label}).boundingBox();assert.ok(box.height>=44);assert.ok(box.x>=0&&box.x+box.width<=width);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.evaluate(()=>mapReady=true);await recover.click();
  assert.match(await page.textContent('#navigationRecoveryFeedback'),/remains retained/);
  assert.equal(await recover.isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Start navigation',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>VoyagrNavigationLifecycleOrchestration.getRouteInProgress()),false);
  assert.deepEqual(await page.evaluate(()=>lastCalculatedRoute.journey_continuation.stops),['remaining']);
  assert.equal(await page.evaluate(()=>localStorage.getItem('retained-route-fixture')),'keep');
  console.log('PASS '+width+'px: actual recovery action refuses unavailable map, accepts verified resources without starting, preserves remaining intent and local data, and fits 200% text');
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
