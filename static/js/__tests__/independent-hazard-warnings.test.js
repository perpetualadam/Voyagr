/** Real GPS hazard owner dispatch, platform outputs spied; no phone/GPS/provider access. */
let GPS,HA,notify,speak,state,offline;
beforeEach(()=>{
 jest.resetModules();document.body.innerHTML='';localStorage.clear();localStorage.setItem('pref_cameraAlertType','voice');
 HA=require('../modules/navigation/hazard-alerts');
 const RG=require('../modules/navigation/route-geometry');
 GPS=require('../app/gps-orchestration');notify=jest.fn();speak=jest.fn();
 document.documentElement.dataset.personalMode='true';
 window.VoyagrJourneyModes={isSimulating:()=>false};
 window.lastCalculatedRoute=JSON.parse(JSON.stringify({hazard_count:0,hazard_penalty_seconds:0,
  hazards:['camera_speed','traffic_light','railway_crossing'].map(type=>({type,lat:53.501,lon:-1.2})),
  warning_coverage:{traffic_light:{status:'PARTIAL'},railway_crossing:{status:'UNKNOWN'}}}));
 offline=true;state={routeInProgress:true,routePolyline:[[53.5,-1.2],[53.502,-1.2]],lastSnappedRouteIndex:0,voiceAnnouncementsEnabled:true};
 GPS.bind({g:key=>state[key],getIsOffline:()=>offline,m:{hazardAlerts:()=>HA,routeGeometry:()=>RG},
  consts:{HAZARD_WARNING_DISTANCE:500},call:{getDistanceUnit:()=> 'mi',sendNotification:notify,speakMessage:speak}});
 global.fetch=jest.fn();
});
afterEach(()=>{
 delete window.VoyagrJourneyModes;delete window.lastCalculatedRoute;
 delete document.documentElement.dataset.personalMode;delete global.fetch;
});
test('personal-mode offline GPS dispatches all three retained mapped warning types with zero avoidance count',()=>{
 GPS.processNavigationHazardAlerts(53.5,-1.2);
 expect(notify).toHaveBeenCalledTimes(3);expect(speak).toHaveBeenCalledTimes(3);
 expect(speak.mock.calls.flat().join(' ')).toMatch(/camera speed/);
 expect(speak.mock.calls.flat().join(' ')).toMatch(/traffic light/);
 expect(speak.mock.calls.flat().join(' ')).toMatch(/railway crossing/);
 expect(notify.mock.calls.every(call=>call[1].includes('uncertain'))).toBe(true);
 expect(fetch).not.toHaveBeenCalled();
 GPS.processNavigationHazardAlerts(53.5,-1.2);
 expect(notify).toHaveBeenCalledTimes(3);
});
test('simulation still suppresses the actual GPS warning dispatcher',()=>{
 window.VoyagrJourneyModes.isSimulating=()=>true;
 GPS.processNavigationHazardAlerts(53.5,-1.2);
 expect(notify).not.toHaveBeenCalled();expect(speak).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
test('a verified unrelated road association still suppresses warnings',()=>{
 window.VoyagrRoadMatchOrchestration={classifyHazard:()=> 'UNRELATED'};
 try { GPS.processNavigationHazardAlerts(53.5,-1.2);expect(notify).not.toHaveBeenCalled(); }
 finally { delete window.VoyagrRoadMatchOrchestration; }
});
test('partial/unknown observations never claim complete warning coverage',()=>{
 const text=HA.describeWarningCoverage(window.lastCalculatedRoute);
 expect(text).toContain('partial mapped coverage');expect(text).toContain('coverage unknown');
 expect(text).toContain('Missing observations do not establish');
 expect(HA.describeWarningCoverage({})).toContain('not supplied');
});
test('warning coverage survives normalization and selection but cannot leak from a previous route',()=>{
 const RS=require('../modules/navigation/route-selection');
 const normalized=RS.normalizeRouteOption(window.lastCalculatedRoute,{decodePolyline:()=>[[53.5,-1.2],[53.502,-1.2]]});
 expect(normalized.hazards).toHaveLength(3);
 expect(normalized.warning_coverage.traffic_light.status).toBe('PARTIAL');
 const selected=RS.mergeLastCalculatedRouteFromSelection({},normalized);
 expect(HA.describeWarningCoverage(selected)).toContain('partial');
 const replacement=RS.mergeLastCalculatedRouteFromSelection(selected,{geometry:'new'});
 expect(replacement.warning_coverage).toBeUndefined();
});
test('actual GPS owner renders partial warning coverage without relying on the speed widget',()=>{
 document.body.innerHTML='<p id="routeHazardDataStatus"></p>';
 GPS.processNavigationHazardAlerts(53.5,-1.2);
 expect(document.getElementById('routeHazardDataStatus').textContent).toContain('partial mapped coverage');
});


const controlCases=[];
for(const source of ['route','nearby'])for(const camera of ['off','voice'])for(const voice of [false,true])
 controlCases.push([source,camera,voice]);
test.each(controlCases)('real GPS %s observations with Camera %s and general voice %s keep signals/crossings distinct',async(source,camera,voice)=>{
 localStorage.setItem('pref_cameraAlertType',camera);GPS.loadCameraAlertPreferences();state.voiceAnnouncementsEnabled=voice;
 const rows=['traffic_light','camera_red_light','traffic_light_camera','camera_speed','railway_crossing'].map(type=>({type,lat:53.501,lon:-1.2}));
 window.lastCalculatedRoute.hazards=source==='route'?rows:[];
 if(source==='nearby'){
  offline=false;fetch.mockResolvedValue({json:async()=>({success:true,hazards:rows})});
 }
 GPS.processNavigationHazardAlerts(53.5,-1.2);
 await new Promise(resolve=>setTimeout(resolve,0));
 const messages=notify.mock.calls.map(c=>c[1]);
 expect(messages).toHaveLength(camera==='off'?2:5);
 expect(messages.some(m=>m.includes('traffic light nearby'))).toBe(true);
 expect(messages.some(m=>m.includes('railway crossing nearby'))).toBe(true);
 expect(messages.some(m=>m.includes('camera red light'))).toBe(camera!=='off');
 expect(messages.every(m=>m.includes('uncertain'))).toBe(true);
 expect(speak).toHaveBeenCalledTimes((voice?2:0)+(camera==='voice'?3:0));
 GPS.processNavigationHazardAlerts(53.5,-1.2);await new Promise(resolve=>setTimeout(resolve,0));
 expect(notify).toHaveBeenCalledTimes(camera==='off'?2:5);
});
test('Camera Off still respects simulation and verified unrelated-road suppression for ordinary signals',()=>{
 localStorage.setItem('pref_cameraAlertType','off');GPS.loadCameraAlertPreferences();
 window.VoyagrJourneyModes.isSimulating=()=>true;GPS.processNavigationHazardAlerts(53.5,-1.2);
 expect(notify).not.toHaveBeenCalled();
 window.VoyagrJourneyModes.isSimulating=()=>false;
 window.VoyagrRoadMatchOrchestration={classifyHazard:()=> 'UNRELATED'};
 try{GPS.processNavigationHazardAlerts(53.5,-1.2);expect(notify).not.toHaveBeenCalled();expect(speak).not.toHaveBeenCalled();}
 finally{delete window.VoyagrRoadMatchOrchestration;}
});
