// Actual GPS dispatcher and notification layer; synthetic coordinates and platform outputs.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  let checks=0;
  for(const source of ['route','nearby'])for(const mode of ['off','voice'])for(const voice of [false,true])for(const permission of ['denied','granted']){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   await page.route('**/*',r=>r.request().url().startsWith('https://signal-fixture.invalid/')?r.fulfill({contentType:'text/html',body:'<!doctype html><div id="notificationContainer"></div>'}):r.abort());
   await page.goto('https://signal-fixture.invalid/');
   for(const file of ['modules/navigation/hazard-alerts.js','modules/navigation/route-geometry.js','modules/ui/device-environment.js','app/gps-orchestration.js','app/notifications-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file)});
   const result=await page.evaluate(async({source,mode,voice,permission})=>{
    let now=100000,spoken=[],native=[];Date.now=()=>now;
    window.Notification=class {static permission=permission;constructor(title,options){native.push({title,...options});}close(){}};
    const state={routeInProgress:true,routePolyline:[[53.5,-1.2],[53.502,-1.2]],lastSnappedRouteIndex:0,voiceAnnouncementsEnabled:voice};
    const notices=VoyagrNotificationsOrchestration,gps=VoyagrGpsOrchestration;
    notices.bind({deviceEnvironment:()=>VoyagrDeviceEnvironment});
    localStorage.setItem('pref_cameraAlertType',mode);gps.loadCameraAlertPreferences();
    let nearby=[];
    window.fetch=async()=>({json:async()=>({success:true,hazards:nearby})});
    window.VoyagrJourneyModes={isSimulating:()=>false};
    window.VoyagrRoadMatchOrchestration={classifyHazard:()=> 'POSSIBLE'};
    gps.bind({g:key=>state[key],getIsOffline:()=>source==='route',m:{hazardAlerts:()=>VoyagrHazardAlerts,routeGeometry:()=>VoyagrRouteGeometry},consts:{HAZARD_WARNING_DISTANCE:500},call:{getDistanceUnit:()=> 'mi',sendNotification:notices.sendNotification,speakMessage:message=>spoken.push(message)}});
    const rows=[];
    for(const type of ['traffic_light','camera_red_light','traffic_light_camera','camera_speed','railway_crossing']){
     now+=4000;spoken=[];native=[];document.getElementById('notificationContainer').replaceChildren();
     const hazard={type,lat:53.501,lon:-1.2};
     window.lastCalculatedRoute={hazards:source==='route'?[hazard]:[],hazard_count:0,hazard_penalty_seconds:0};
     nearby=source==='nearby'?[hazard]:[];
     gps.processNavigationHazardAlerts(53.5,-1.2);await new Promise(resolve=>setTimeout(resolve,0));
     const before=spoken.length;
     gps.processNavigationHazardAlerts(53.5,-1.2);await new Promise(resolve=>setTimeout(resolve,0));
     rows.push({type,toast:document.getElementById('notificationContainer').textContent,spoken:before,native:native.length,debounced:spoken.length===before});
    }
    window.VoyagrJourneyModes.isSimulating=()=>true;now+=40000;document.getElementById('notificationContainer').replaceChildren();
    gps.processNavigationHazardAlerts(53.5,-1.2);await new Promise(resolve=>setTimeout(resolve,0));
    return {rows,simulationSilent:document.getElementById('notificationContainer').textContent===''};
   },{source,mode,voice,permission});
   for(const row of result.rows){
    const camera=row.type.includes('camera'),enabled=!camera||mode!=='off';
    assert.equal(Boolean(row.toast),enabled);
    if(enabled)assert.match(row.toast,/road association uncertain/);
    assert.equal(row.spoken,enabled&&(camera||voice)?1:0);
    assert.equal(row.native,enabled&&permission==='granted'?1:0);
    assert.equal(row.debounced,true);checks++;
   }
   assert.equal(result.simulationSilent,true);
   await page.close();
  }
  console.log('PASS: '+checks+' synthetic route/nearby camera/signal/crossing browser cases, permission gating, voice preferences, debounce and simulation suppression');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
