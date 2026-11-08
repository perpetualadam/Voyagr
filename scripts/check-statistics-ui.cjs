// Production Statistics markup, renderer/controller and unit helpers; authenticated API/navigation are fixture boundaries.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const markup='<div id="routeAnalyticsTab"'+read('templates/index.html').split('<div id="routeAnalyticsTab"')[1].split('<!-- SAVED ROUTES TAB')[0];
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const dark of [false,true])for(const scale of [1,2]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 const shell=`<html class="${dark?'dark-mode':''}" style="font-size:${scale*100}%"><head><meta charset="utf-8"><style>${read('static/css/voyagr.css')}body{display:block}main{max-width:640px;margin:auto;padding:12px;box-sizing:border-box}</style></head><body class="${dark?'dark-mode':''}"><main>${markup}</main></body></html>`;
 await page.route('**/*',r=>r.request().url()==='https://statistics.invalid/'?r.fulfill({contentType:'text/html',body:shell}):r.abort());await page.goto('https://statistics.invalid/');
 for(const file of ['modules/navigation/units.js','modules/navigation/speed-gps.js','modules/navigation/trip-history.js','app/units-preferences-orchestration.js','app/trip-history-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file)});
 await page.evaluate(()=>{
  document.getElementById('routeAnalyticsTab').style.display='block';window.calls=[];window.requests=[];
  window.data={total_trips:5,total_distance_km:120,total_cost:42.5,avg_duration:25,total_fuel_cost:30,total_toll_cost:10,total_caz_cost:2.5,total_time_minutes:125,avg_speed:80,frequent_routes:[{start:'Home & <Work> '+('Long place '.repeat(10)),end:'Doncaster '+('long street '.repeat(10)),count:3,avg_distance:10,avg_cost:4.5}]};window.before=JSON.stringify(data);
  window.fetch=()=>{throw Error('Unexpected external request');};window.switchTab=tab=>calls.push(tab);
  const u=VoyagrUnitsPreferencesOrchestration;u.bind({units:()=>VoyagrUnits,speedGps:()=>VoyagrSpeedGps,call:{}});u.setDistanceUnitValue('km');u.setSpeedUnitValue('kmh');u.setCurrencyUnitValue('EUR');
  VoyagrTripHistoryOrchestration.bind({tripHistory:()=>VoyagrTripHistory,getSpeedUnit:()=>u.getSpeedUnitValue(),call:{getCurrencySymbol:()=>u.getCurrencySymbol(),convertDistance:km=>u.convertDistance(km),getDistanceUnit:()=>u.getDistanceUnit(),getSpeedUnitLabel:()=>u.getSpeedUnit(),fetchJsonWithAuth:async url=>{requests.push(url);return {res:{status:200},data:{...data,success:true}};}}});
  VoyagrTripHistoryOrchestration.loadRouteAnalytics();
 });
 await page.waitForFunction(()=>document.getElementById('totalTrips').textContent==='5');
 assert.equal(await page.locator('#totalCost').innerText(),'£42.50');assert.equal(await page.locator('#totalDistance').innerText(),'120.00 km');assert.equal(await page.locator('#avgSpeed').innerText(),'80.0 km/h');
 assert.equal(await page.locator('.analytics-route img').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow');
 const map=page.getByRole('button',{name:'Back to navigation',exact:true});await map.focus();assert.equal(await map.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');const b=await map.boundingBox();assert(b.width>=48&&b.height>=48);await page.keyboard.press('Enter');
 await page.evaluate(()=>{const u=VoyagrUnitsPreferencesOrchestration;window.nodes=[...document.querySelectorAll('[data-distance-meters]')];u.setDistanceUnitValue('mi');u.setSpeedUnitValue('mph');u.updateAllDistanceDisplays();});
 assert.deepEqual(await page.evaluate(()=>nodes.map(n=>n.textContent)),['74.56 mi','6.21 mi']);
 await page.evaluate(()=>VoyagrTripHistoryOrchestration.displayAnalytics(data));assert.equal(await page.locator('#avgSpeed').innerText(),'49.7 mph');assert.equal(await page.locator('#totalCost').innerText(),'£42.50');
 assert.deepEqual(await page.evaluate(()=>({calls,requests,unchanged:JSON.stringify(data)===before})),{calls:['navigation'],requests:['/api/trip-analytics'],unchanged:true});
 if(width===390&&scale===1)await page.screenshot({path:'/tmp/voyagr-statistics-'+(dark?'dark':'light')+'.png',fullPage:true});
 await page.evaluate(()=>VoyagrTripHistoryOrchestration.displayAnalytics({}));assert.equal(await page.locator('#frequentRoutesList').innerText(),'No trip history yet');
 console.log(`${width}x${height} ${dark?'dark':'light'} ${scale*100}% cards/API rendering/keyboard/units passed`);await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
