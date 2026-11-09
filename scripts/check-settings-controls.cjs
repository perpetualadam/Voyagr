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
 for(const file of ['modules/navigation/units.js','app/units-preferences-orchestration.js','app/supabase-auth-orchestration.js','modules/ui/toggle-ui.js','modules/navigation/route-prefs.js','app/route-avoidance-orchestration.js','modules/navigation/hazard-alerts.js','app/hazard-preferences-orchestration.js','modules/map/map-controls.js','modules/traffic-lights.js','app/tab-navigation-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file)});
 await page.evaluate(()=>{
  document.getElementById('settingsTab').style.display='block';window.calls=[];window.requests=[];
  window.fetch=(url,options)=>{requests.push([url,options]);return Promise.resolve({ok:true,json:()=>Promise.resolve({})});};
  for(const name of ['goBackToPreviousTab','manualTrafficUpdate','showCAZInfo','clearDepartureTime','analysebestTimeToLeave','refreshApp','checkForUpdates','recalculateRouteWithPreferences','switchTab','voyagrShowSafetyNotice'])window[name]=(...args)=>calls.push([name,...args]);
  const u=VoyagrUnitsPreferencesOrchestration;u.bind({units:()=>VoyagrUnits,call:{saveAllSettings:()=>calls.push(['saveAllSettings']),showStatus:()=>{}}});
  VoyagrTabNavigationOrchestration.bind({units:()=>VoyagrUnits,getDistanceUnit:()=>u.getDistanceUnitValue(),getCurrencyUnit:()=>u.getCurrencyUnitValue(),getSpeedUnit:()=>u.getSpeedUnitValue(),getTemperatureUnit:()=>u.getTemperatureUnitValue(),call:{applyDomSelectsFromPlan:items=>items.forEach(({id,value})=>{const el=document.getElementById(id);if(el)el.value=value;}),updateAllDistanceDisplays:()=>u.updateAllDistanceDisplays()}});
  u.setDistanceUnitValue('mi');VoyagrTabNavigationOrchestration.loadUnitPreferences();
  if(document.getElementById('voiceTurnDistance1').selectedOptions[0].label!=='1640 ft')throw Error('First Settings entry failed to refresh');
  u.setDistanceUnitValue('km');VoyagrTabNavigationOrchestration.loadUnitPreferences();
  window.updateDistanceUnit=()=>u.updateDistanceUnit();window.updateCurrencyUnit=()=>u.updateCurrencyUnit();
 });
 // Native disclosures work with keyboard and keep mounted preferences unchanged.
 assert.equal(await page.locator('details.settings-group').count(),9);
 assert.equal(await page.locator('details.settings-group[open]').count(),1);
 const smart=page.locator('#settingsSmartRouting > summary');await smart.focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#settingsSmartRouting').getAttribute('open'),'');
 await page.keyboard.press('Space');assert.equal(await page.locator('#settingsSmartRouting').getAttribute('open'),null);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Collapsed overflow');
 if(width===390&&scale===1){await page.locator('.settings-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/voyagr-settings-groups-'+(dark?'dark':'light')+'.png'});}
 await page.evaluate(()=>document.querySelectorAll('details.settings-group').forEach(d=>{d.open=true;}));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
 if(dark)assert.equal(await page.locator('#accountStatus').evaluate(n=>getComputedStyle(n).color),'rgb(204, 209, 223)');
 for(const el of await page.locator('#settingsTab .settings-action, #settingsTab select, #settingsTab .toggle-switch, #settingsTab details.settings-group > summary').all()){
  if(!await el.isVisible())continue;await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();assert(b.width>=48&&b.height>=48,JSON.stringify(b));assert(b.x>=0&&b.x+b.width<=width+1,'Control outside viewport');
 }
 for(const command of ['goBackToPreviousTab()','manualTrafficUpdate()','showCAZInfo()','clearDepartureTime()','analysebestTimeToLeave()','refreshApp()','checkForUpdates()','recalculateRouteWithPreferences()',"switchTab('navigation')",'voyagrShowSafetyNotice && voyagrShowSafetyNotice()']){
  const el=page.locator('.settings-action').filter({has:page.locator('svg')});const target=await el.evaluateAll((nodes,command)=>nodes.findIndex(n=>n.getAttribute('onclick')===command),command);
  await el.nth(target).focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await el.nth(target).evaluate(n=>getComputedStyle(n).outlineStyle),'solid');await page.keyboard.press('Enter');
 }
 await page.locator('#distanceUnit').selectOption('km');await page.locator('#distanceUnit').selectOption('mi');await page.locator('#currencyUnit').selectOption('EUR');
 // Distance-option labels share the production formatter; native option values stay canonical.
 const labelIds=['voiceTurnDistance1','voiceTurnDistance2','voiceTurnDistance3','voiceHazardDistance','cameraAlertDistance','parkingMaxWalkingDistance'];
 const canonical=await page.evaluate(ids=>ids.map(id=>[...document.getElementById(id).options].map(o=>[o.value,o.selected,o.dataset.distanceMeters])),labelIds);
 assert.equal(await page.locator('#voiceTurnDistance1').evaluate(n=>n.selectedOptions[0].label),'1640 ft');
 assert.equal(await page.locator('#parkingMaxWalkingDistance').evaluate(n=>n.selectedOptions[0].label),'10 minutes (about 2625 ft)');
 await page.locator('#distanceUnit').selectOption('km');assert.equal(await page.locator('#cameraAlertDistance').evaluate(n=>n.selectedOptions[0].label),'500 m');
 assert.equal(await page.locator('#parkingMaxWalkingDistance').evaluate(n=>n.options[2].label),'15 minutes (about 1.2 km)');
 await page.locator('#distanceUnit').selectOption('mi');
 assert.deepEqual(await page.evaluate(ids=>ids.map(id=>[...document.getElementById(id).options].map(o=>[o.value,o.selected,o.dataset.distanceMeters])),labelIds),canonical);
 if(width===390&&scale===1){await page.locator('#voiceTurnDistance1').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/voyagr-distance-options-'+(dark?'dark':'light')+'.png'});}
 const result=await page.evaluate(()=>({calls,requests,dist:localStorage.getItem('unit_distance'),currency:localStorage.getItem('unit_currency'),symbol:VoyagrUnitsPreferencesOrchestration.getCurrencySymbol(),hidden:['accountSignedIn','accountSignedOut','supportVoyagrSection'].map(id=>document.getElementById(id).style.display)}));
 assert.deepEqual(result.calls.slice(0,10),[['goBackToPreviousTab'],['manualTrafficUpdate'],['showCAZInfo'],['clearDepartureTime'],['analysebestTimeToLeave'],['refreshApp'],['checkForUpdates'],['recalculateRouteWithPreferences'],['switchTab','navigation'],['voyagrShowSafetyNotice']]);
 // Real account shortcut controller must reveal the disclosure before scrolling.
 await page.evaluate(()=>{VoyagrSupabaseAuthOrchestration.bind({call:{switchTab:()=>{},expandBottomSheet:()=>{},showStatus:()=>{}}});document.getElementById('settingsAccountApp').open=false;VoyagrSupabaseAuthOrchestration.voyagrOpenSignInFromBanner();});
 await page.waitForFunction(()=>document.getElementById('settingsAccountApp').open);
 await page.evaluate(()=>{document.getElementById('settingsAccountApp').open=false;document.getElementById('supportVoyagrSection').style.display='block';VoyagrSupabaseAuthOrchestration.openVoyagerPremiumSection();});
 await page.waitForFunction(()=>document.getElementById('settingsAccountApp').open);
 assert.equal(result.dist,'mi');assert.equal(result.currency,'EUR');assert.equal(result.symbol,'£');assert.deepEqual(result.hidden,['none','none','none']);assert(result.requests.every(([url])=>url==='/api/app-settings'));
 if(width===390&&scale===1){await page.locator('.settings-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/voyagr-settings-'+(dark?'dark':'light')+'.png'});}
 // Switch semantics follow the real preference controllers, including keyboard activation.
 await page.evaluate(()=>{
  VoyagrRouteAvoidanceOrchestration.bind({routePrefs:()=>VoyagrRoutePrefs,toggleUI:()=>VoyagrToggleUI,call:{saveAllSettings:()=>{},showStatus:()=>{}}});
  window.togglePreference=pref=>VoyagrRouteAvoidanceOrchestration.togglePreference(pref);
 });
 const switching=page.getByRole('switch',{name:'Use map data in routing',exact:true});
 assert.equal(await switching.getAttribute('aria-checked'),'false');await switching.focus();await page.keyboard.press('Enter');
 assert.equal(await switching.getAttribute('aria-checked'),'true');assert.equal(await page.evaluate(()=>localStorage.getItem('pref_cameras')),'true');
 await page.keyboard.press('Space');assert.equal(await switching.getAttribute('aria-checked'),'false');assert.equal(await page.evaluate(()=>localStorage.getItem('pref_cameras')),'false');
 await page.evaluate(()=>{localStorage.setItem('pref_avoid_tollRoads','true');VoyagrRouteAvoidanceOrchestration.loadAvoidancePreferences();});
 assert.equal(await page.locator('#avoidTollRoads').getAttribute('aria-checked'),'true');
 for(const el of await page.locator('#settingsTab button.toggle-switch').all()){
  assert.equal(await el.getAttribute('role'),'switch');assert.equal(await el.getAttribute('aria-checked'),String(await el.evaluate(n=>n.classList.contains('active'))));
 }
 const client=await page.context().newCDPSession(page);const tree=await client.send('Accessibility.getFullAXTree');
 const ax=tree.nodes.find(n=>n.role?.value==='switch'&&n.name?.value==='Use map data in routing');assert(ax,'Switch missing from accessibility tree');const optionControl=tree.nodes.find(n=>n.role?.value==='combobox'&&n.name?.value==='Turn Announcement Distance (1st)');assert.equal(optionControl.value.value,'1640 ft');assert.equal(ax.properties.find(p=>p.name==='checked').value.value,'false');await client.detach();
 await page.evaluate(()=>{
  window.resolvePreference=null;const pending=new Promise(resolve=>{window.resolvePreference=resolve;});
  window.fetch=async(_url,opts)=>({json:()=>opts?pending:Promise.resolve({success:true,preferences:[{hazard_type:'camera_speed',enabled:false}]})});
  VoyagrHazardPreferencesOrchestration.bind({hazardAlerts:()=>VoyagrHazardAlerts,toggleUI:()=>VoyagrToggleUI,call:{showStatus:()=>{},saveAllSettings:()=>{}}});
  window.toggleHazardPreferenceApi=(...args)=>VoyagrHazardPreferencesOrchestration.toggleHazardPreferenceApi(...args);
 });
 const camera=page.getByRole('switch',{name:'Speed cameras',exact:true});await camera.focus();await page.keyboard.press('Space');assert.equal(await camera.getAttribute('aria-checked'),'false');
 await page.evaluate(()=>resolvePreference({success:true}));await page.waitForFunction(()=>document.querySelector('[data-hazard-type="camera_speed"]').getAttribute('aria-checked')==='true');
 await page.evaluate(()=>{TrafficLights.toggleTrafficLights();VoyagrMapControls.applyARModeButtonState(document.getElementById('arModeBtn'),'active');});
 assert.equal(await page.locator('#trafficLightsToggle').getAttribute('aria-checked'),'false');assert.equal(await page.locator('#arModeBtn').getAttribute('aria-checked'),'true');
 console.log(`${width}x${height} ${dark?'dark':'light'} ${scale*100}% controls/actions/units/switch accessibility tree passed`);await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
