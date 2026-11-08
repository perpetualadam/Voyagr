// Production Settings markup/CSS and unit controller; account, navigation and API boundaries are fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const markup='<div id="settingsTab"'+read('templates/index.html').split('<div id="settingsTab"')[1].split('<!-- TRIP HISTORY TAB')[0];
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const dark of [false,true])for(const scale of [1,2]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 const shell=`<html class="${dark?'dark-mode':''}" style="font-size:${scale*100}%"><head><meta charset="utf-8"><style>${read('static/css/voyagr.css')}body{display:block}main{max-width:640px;margin:auto;padding:12px;box-sizing:border-box}</style></head><body class="${dark?'dark-mode':''}"><main>${markup}</main></body></html>`;
 await page.route('**/*',r=>r.request().url()==='https://settings.invalid/'?r.fulfill({contentType:'text/html',body:shell}):r.abort());await page.goto('https://settings.invalid/');
 for(const file of ['modules/navigation/units.js','app/units-preferences-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file)});
 await page.evaluate(()=>{
  document.getElementById('settingsTab').style.display='block';window.calls=[];window.requests=[];
  window.fetch=(url,options)=>{requests.push([url,options]);return Promise.resolve({ok:true,json:()=>Promise.resolve({})});};
  for(const name of ['goBackToPreviousTab','manualTrafficUpdate','showCAZInfo','clearDepartureTime','analysebestTimeToLeave','refreshApp','checkForUpdates','recalculateRouteWithPreferences','switchTab','voyagrShowSafetyNotice'])window[name]=(...args)=>calls.push([name,...args]);
  const u=VoyagrUnitsPreferencesOrchestration;u.bind({units:()=>VoyagrUnits,call:{saveAllSettings:()=>calls.push(['saveAllSettings']),showStatus:()=>{}}});
  window.updateDistanceUnit=()=>u.updateDistanceUnit();window.updateCurrencyUnit=()=>u.updateCurrencyUnit();
 });
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
 if(dark)assert.equal(await page.locator('#accountStatus').evaluate(n=>getComputedStyle(n).color),'rgb(204, 209, 223)');
 for(const el of await page.locator('#settingsTab .settings-action, #settingsTab select, #settingsTab .toggle-switch').all()){
  if(!await el.isVisible())continue;await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();assert(b.width>=48&&b.height>=48,JSON.stringify(b));assert(b.x>=0&&b.x+b.width<=width+1,'Control outside viewport');
 }
 for(const command of ['goBackToPreviousTab()','manualTrafficUpdate()','showCAZInfo()','clearDepartureTime()','analysebestTimeToLeave()','refreshApp()','checkForUpdates()','recalculateRouteWithPreferences()',"switchTab('navigation')",'voyagrShowSafetyNotice && voyagrShowSafetyNotice()']){
  const el=page.locator('.settings-action').filter({has:page.locator('svg')});const target=await el.evaluateAll((nodes,command)=>nodes.findIndex(n=>n.getAttribute('onclick')===command),command);
  await el.nth(target).focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await el.nth(target).evaluate(n=>getComputedStyle(n).outlineStyle),'solid');await page.keyboard.press('Enter');
 }
 await page.locator('#distanceUnit').selectOption('km');await page.locator('#distanceUnit').selectOption('mi');await page.locator('#currencyUnit').selectOption('EUR');
 const result=await page.evaluate(()=>({calls,requests,dist:localStorage.getItem('unit_distance'),currency:localStorage.getItem('unit_currency'),symbol:VoyagrUnitsPreferencesOrchestration.getCurrencySymbol(),hidden:['accountSignedIn','accountSignedOut','supportVoyagrSection'].map(id=>document.getElementById(id).style.display)}));
 assert.deepEqual(result.calls.slice(0,10),[['goBackToPreviousTab'],['manualTrafficUpdate'],['showCAZInfo'],['clearDepartureTime'],['analysebestTimeToLeave'],['refreshApp'],['checkForUpdates'],['recalculateRouteWithPreferences'],['switchTab','navigation'],['voyagrShowSafetyNotice']]);
 assert.equal(result.dist,'mi');assert.equal(result.currency,'EUR');assert.equal(result.symbol,'£');assert.deepEqual(result.hidden,['none','none','none']);assert(result.requests.every(([url])=>url==='/api/app-settings'));
 if(width===390&&scale===1){await page.locator('.settings-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/voyagr-settings-'+(dark?'dark':'light')+'.png'});}
 console.log(`${width}x${height} ${dark?'dark':'light'} ${scale*100}% controls/actions/units passed`);await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
