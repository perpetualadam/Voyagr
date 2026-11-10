// Real MapLibre, journey entry, GPS planners and summary DOM. Device/services and
// lifecycle commit are adapters; Jest separately covers the real lifecycle owner.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const template=read('templates/index.html');
const card=template.match(/<section id="navigationEntry"[\s\S]*?<\/section>/)[0];
const summary=template.slice(template.indexOf('<div id="journeySummaryBar"'),template.indexOf('<!-- Toast / notification styles')).replace(/\s*<\/div>\s*$/,'');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 for(const dark of [false,true])for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>${read('static/vendor/maplibre-gl.css')}${read('static/css/voyagr.css')}body{margin:0}#map{height:844px;width:100vw}#planner{position:absolute;inset:0;background:white}</style><body class="${dark?'dark-mode':''}"><div id="map"></div><div id="planner">Route preview</div>${card}${summary}</body>`}));
  await page.goto('https://entry.invalid/');
  const files=['static/vendor/maplibre-gl.js','static/js/maplibre-helpers.js',...['journey-plan','avoidance-integrity','speed-gps','route-geometry','route-progress','camera-pitch','reroute-decision','turn-instructions','voice-announcements','hazard-alerts','eta','units','movement-detection'].map(x=>'static/js/modules/navigation/'+x+'.js'),...['navigation-lifecycle-orchestration','reroute-map-orchestration','journey-modes','journey-summary-orchestration','gps-orchestration'].map(x=>'static/js/app/'+x+'.js')];
  for(const file of files)await page.addScriptTag({content:read(file)});
  await page.evaluate(({dark,width})=>{
   const noop=()=>{};
   window.map=new maplibregl.Map({container:'map',center:[-1,53.005],zoom:14,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':dark?'#141820':'#eee'}}]}});
   window.route={id:'selected',geometry:[[53,-1],[53.01,-1],[53.02,-1]],destination:'53.02,-1',maneuvers:[{instruction:'Head north',begin_shape_index:0,end_shape_index:2}],duration_minutes:20};window.options=[route];window.index=0;window.gpsCount=0;
   window.state={routeInProgress:false,routePolyline:route.geometry,currentRouteSteps:route.maneuvers,currentStepIndex:0,lastSnappedRouteIndex:0,map,zoomAndFollowEnabled:true,mapFollowingActive:true};
   Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:()=>{gpsCount++;},watchPosition:ok=>{window.deliverFix=ok;return 7;},clearWatch:noop}});
   window.VoyagrSmartZoomOrchestration={getSmartZoomEnabled:()=>false,getLastDistanceToNextTurn:()=>null,getLastZoomLevel:()=>16,computeSmartZoomLevel:()=>16,setLastDistanceToNextTurn:noop};window._turnInstructions=()=>VoyagrTurnInstructions;window.updateLaneGuidance=noop;
   window.VoyagrRoadMatching={shouldPauseNavigation:()=>true,supportsDeviation:()=>false};window.VoyagrRoadMatchOrchestration={observe:()=>({reason:'synthetic unmatched road'}),invalidate:noop};
   const unit=width===390?'mi':'km',Summary=VoyagrJourneySummaryOrchestration,GPS=VoyagrGpsOrchestration;
   Summary.bind({eta:()=>VoyagrETA,routeGeometry:()=>VoyagrRouteGeometry,movementDetection:()=>VoyagrMovementDetection,units:()=>VoyagrUnits,getTrackingHistory:GPS.getTrackingHistory,getRouteInProgress:()=>state.routeInProgress,getRoutePolyline:()=>state.routePolyline,getCurrentLat:()=>state.currentLat,getCurrentLon:()=>state.currentLon,getLastSnappedRouteIndex:()=>state.lastSnappedRouteIndex,getDistanceUnit:()=>unit,call:{applyTrafficRatioToBaseRemaining:x=>x}});
   GPS.bind({g:k=>state[k],s:(k,v)=>{state[k]=v;},getIsOffline:()=>true,consts:{HAZARD_WARNING_DISTANCE:500},m:{speedGps:()=>VoyagrSpeedGps,routeGeometry:()=>VoyagrRouteGeometry,routeProgress:()=>VoyagrRouteProgress,cameraPitch:()=>VoyagrCameraPitch,rerouteDecision:()=>VoyagrRerouteDecision,hazardAlerts:()=>VoyagrHazardAlerts,speedLimitWidget:()=>null,voiceAnnouncements:()=>VoyagrVoiceAnnouncements},call:{showStatus:noop,updateRoadReportFabVisibility:noop,smoothGpsSpeedMph:x=>x,createVehicleMarker:(lat,lon)=>{const element=document.createElement('div');element.style.cssText='width:18px;height:18px;border-radius:50%;background:#6b36a6;border:3px solid white';window.vehicle=new maplibregl.Marker({element}).setLngLat([lon,lat]);return vehicle;},isActiveNavigationFollow:()=>true,shouldTiltDrivingCamera:()=>false,shouldUsePitchedDrivingCamera:()=>false,detectUpcomingTurn:()=>null,updateTurnWidgetFromPosition:noop,fetchRoadNameThrottled:noop,convertDistance:String,getCurrentRoadType:()=> 'unknown',speakMessage:noop,getAutoRerouteOnDeviationEnabled:()=>false,getDistanceUnit:()=>unit,updateRecenterButtonVisibility:noop,updateJourneySummaryBar:Summary.updateJourneySummaryBar}});
   VoyagrJourneyModes.bind({selected:()=>options[index],options:()=>options,index:()=>index,setOptions:x=>{window.options=x;},setIndex:x=>{window.index=x;},isLive:()=>state.routeInProgress,stopLive:noop,map:()=>map,helpers:()=>MapLibreHelpers,getFix:()=>null,showStatus:noop,showNavigationMap:()=>{document.getElementById('planner').hidden=true;},fetch:()=>{throw Error('Start must not wait for provider');},startLive:async candidate=>{if(!VoyagrJourneyModes.userGuidanceStartPermitted(candidate))throw Error('Missing user-owned startup');window.lastCalculatedRoute=candidate;window.routeLayer=MapLibreHelpers.addPolyline(map,candidate.polyline,{color:'#2563eb',weight:6});state.routeInProgress=true;Summary.showJourneySummaryBar();GPS.ensureGPSTracking({forceRestart:true,documentVisible:true});return true;}});
  },{dark,width});
  await page.waitForFunction(()=>map.isStyleLoaded());
  const initial=await page.evaluate(()=>{window.pending=VoyagrJourneyModes.startNavigation();return {same:VoyagrJourneyModes.startNavigation()===pending,planner:document.getElementById('planner').hidden,gps:gpsCount};});
  assert.deepEqual(initial,{same:true,planner:true,gps:0});assert.equal(await page.evaluate(()=>pending),true);
  await page.waitForFunction(()=>!!window.deliverFix);
  const result=await page.evaluate(()=>{
   let at=Date.now();const fix=(lat)=>deliverFix({timestamp:at++,coords:{latitude:lat,longitude:-1.001,accuracy:100,speed:10,heading:0}});
   fix(53.001);const first=parseFloat(document.getElementById('remainingDistance').textContent);const a=vehicle.getLngLat().lat;fix(53.01);const b=vehicle.getLngLat().lat;
   return {first,last:parseFloat(document.getElementById('remainingDistance').textContent),moved:b>a,lat:state.currentLat,eta:document.getElementById('etaTime').textContent,unit:document.getElementById('remainingDistance').textContent,gps:gpsCount};
  });
  assert(result.moved);assert(result.last<result.first);assert.equal(result.lat,53.01);assert.equal(result.gps,0);assert(result.eta!=='--:--');assert(result.unit.includes(width===390?'mi':'km'));
  const bounds=await page.locator('#journeySummaryBar').boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=844);
  await page.screenshot({path:`/tmp/voyagr-continuous-navigation-${width}-${dark}.png`});
  console.log(`${width}px dark=${dark}: immediate selected-route start, coarse/unknown-road GPS movement, visible ETA and decreasing ${width===390?'miles':'kilometres'} passed`);
  await page.evaluate(()=>{VoyagrJourneySummaryOrchestration.hideJourneySummaryBar();map.remove();});await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
