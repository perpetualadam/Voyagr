// Production tabs/cards/CSS and unit helpers; storage, account and navigation actions are fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),template=read('templates/index.html');
const saved=template.split('<!-- SAVED ROUTES TAB (NEW FEATURE) -->')[1].split('<!-- ROUTE PREVIEW TAB')[0];
const history=template.split('<!-- TRIP HISTORY TAB (NEW FEATURE) -->')[1].split('<!-- DASHCAM TAB')[0];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const dark of [false,true])for(const scale of [1,2]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  const shell=`<html class="${dark?'dark-mode':''}" style="font-size:${scale*100}%"><head><meta charset="utf-8"><style>${read('static/css/voyagr.css')}body{display:block}main{max-width:640px;margin:auto;padding:12px;box-sizing:border-box}</style></head><body class="${dark?'dark-mode':''}"><main>${saved}${history}</main></body></html>`;
  await page.route('**/*',r=>r.request().url()==='https://collections.invalid/'?r.fulfill({contentType:'text/html',body:shell}):r.abort());
  await page.goto('https://collections.invalid/');
  for(const file of ['modules/navigation/units.js','modules/navigation/route-sharing.js','modules/navigation/trip-history.js','app/units-preferences-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file)});
  await page.evaluate(()=>{
   window.calls=[];window.requests=[];window.fetch=()=>{requests.push('fetch');throw Error('Unexpected network');};
   window.route={id:17,name:'Home & <Work> '+('Long name '.repeat(9)),start:'Sheffield & district',end:'Doncaster '+('long street '.repeat(10)),distance_km:10,duration_minutes:'20 min',fuel_cost:5,toll_cost:1,caz_cost:0,geometry:'original'};
   window.trip={id:-23,_localOnly:true,start_address:'Sheffield & district',end_address:'Doncaster <img> '+('Long street '.repeat(9)),distance_km:10,duration_minutes:20,routing_mode:'auto',fuel_cost:5,toll_cost:1,caz_cost:0};
   window.before=JSON.stringify([route,trip]);
   document.getElementById('savedRoutesList').innerHTML=VoyagrRouteSharing.buildSavedRoutesListHtml([route],{distanceTexts:['10.00'],distUnit:'km',currencySymbol:'£'});
   window.renderHistory=items=>{document.getElementById('tripHistoryList').innerHTML=items.length?items.map(t=>VoyagrTripHistory.buildTripHistoryRowHtml(t,{startAddr:'unused',endAddr:'unused',dateStr:'8 Nov 2026',distance:VoyagrUnits.convertDistance(t.distance_km,VoyagrUnitsPreferencesOrchestration.getDistanceUnitValue()),distUnit:VoyagrUnitsPreferencesOrchestration.getDistanceUnitValue(),symbol:'£',totalCost:'6.00'})).join(''):VoyagrTripHistory.buildDisplayTripHistoryExecutePlan({trips:[]}).listInnerHtml;};renderHistory([trip]);
   document.getElementById('tripSearchInput').oninput=event=>renderHistory(VoyagrTripHistory.filterTripsBySearch([trip],event.target.value.toLowerCase()));
   for(const name of ['saveCurrentRoute','useSavedRoute','deleteSavedRoute','recalculateTrip','deleteTripHistory','switchTab'])window[name]=(...args)=>calls.push({name,args});
   const pref=VoyagrUnitsPreferencesOrchestration;pref.bind({units:()=>VoyagrUnits,call:{}});pref.setDistanceUnitValue('km');
   document.getElementById('savedRoutesTab').style.display='block';
  });
  for(const tab of ['savedRoutesTab','tripHistoryTab']){
   await page.evaluate(tab=>{document.getElementById('savedRoutesTab').style.display=tab==='savedRoutesTab'?'block':'none';document.getElementById('tripHistoryTab').style.display=tab==='tripHistoryTab'?'block':'none';},tab);
   assert.equal(await page.locator('#'+tab+' img').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
   await page.keyboard.press('Tab');
   for(const button of await page.locator('#'+tab+' button').all()){
    await button.scrollIntoViewIfNeeded();await button.focus();const b=await button.boundingBox();
    assert(b.width>=48&&b.height>=48,JSON.stringify(b));assert(b.x>=0&&b.x+b.width<=width+1,'Button outside viewport');
    assert.equal(await button.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
   }
  }
  await page.evaluate(()=>{document.getElementById('tripHistoryTab').style.display='none';document.getElementById('savedRoutesTab').style.display='block';});
  await page.getByRole('button',{name:'View saved journey',exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Delete saved route',exact:true}).click();
  await page.locator('#routeName').fill('New route');await page.getByRole('button',{name:'Save current route',exact:true}).click();
  await page.evaluate(()=>{window.nodes=[...document.querySelectorAll('[data-distance-meters]')];VoyagrUnitsPreferencesOrchestration.setDistanceUnitValue('mi');VoyagrUnitsPreferencesOrchestration.updateAllDistanceDisplays();});
  assert.deepEqual(await page.evaluate(()=>nodes.map(n=>n.textContent)),['6.21 mi','6.21 mi']);
  const restore=await page.evaluate(()=>VoyagrRouteSharing.buildUseSavedRoutePlan(17,[route]).lastCalculatedRoutePatch);
  assert.equal(restore.navigation_resume_requires_fresh_gps,true);assert.equal(restore.geometry,'original');
  if(width===390&&!dark&&scale===1)await page.screenshot({path:'/tmp/voyagr-saved-routes-ui.png',fullPage:true});
  await page.evaluate(()=>{document.getElementById('savedRoutesTab').style.display='none';document.getElementById('tripHistoryTab').style.display='block';});
  await page.getByRole('button',{name:'Recalculate route',exact:true}).click();await page.getByRole('button',{name:'Delete trip',exact:true}).click();
  await page.locator('#tripSearchInput').fill('missing');assert((await page.locator('#tripHistoryList').innerText()).includes('No trips found'));
  await page.locator('#tripSearchInput').fill('sheffield');assert((await page.locator('#tripHistoryList').innerText()).includes('(this device)'));
  const result=await page.evaluate(()=>({calls,requests,unchanged:JSON.stringify([route,trip])===before}));
  assert.deepEqual(result.calls.map(c=>[c.name,...c.args]),[['useSavedRoute',17],['deleteSavedRoute',17],['saveCurrentRoute'],['recalculateTrip',-23],['deleteTripHistory',-23]]);
  assert.equal(result.requests.length,0);assert(result.unchanged);
  if(width===390&&dark&&scale===1)await page.screenshot({path:'/tmp/voyagr-history-ui.png',fullPage:true});
  console.log(`${width}x${height} ${dark?'dark':'light'} ${scale*100}% cards/actions/keyboard/units passed`);await page.close();
 }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
