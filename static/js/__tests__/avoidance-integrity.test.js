const AI=require('../modules/navigation/avoidance-integrity.js');
const RS=require('../modules/navigation/route-selection.js');
const RD=require('../modules/navigation/reroute-decision.js');
const Calculate=require('../app/calculate-route-orchestration.js');
const Progress=require('../modules/navigation/route-progress.js');
const RR=require('../modules/navigation/routing-request.js');
const RerouteMap=require('../app/reroute-map-orchestration.js');

function assessed(status='SATISFIED',mode='mandatory') {
    const route={id:'synthetic',geometry:require('polyline').encode([[53,-1],[53.01,-1]],6),geometry_precision:6,
        maneuvers:[{type:1,instruction:'Synthetic instruction'}],name:'UK A1',avoidance_assessment:{version:1,status,
        checked_at:Date.now()/1000, origin_integrity:{checked_at:Date.now()/1000,status:'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE',navigation_allowed:true,transition_verified:false}, geometry_valid:true, requires_acceptance:status!=='SATISFIED',
        automatic_selection_allowed:status==='SATISFIED',claim:'checked_available_data_only',
        requirements:[{category:'speed_cameras',enabled:true,mode,status}]},
        avoidance_preferences_snapshot:AI.snapshot(localStorage)};
    route.avoidance_assessment.geometry_binding=AI.geometryBinding(route);
    return route;
}

beforeEach(()=>{localStorage.clear(); AI.invalidate(); global.VoyagrAvoidanceIntegrity=AI;});
afterEach(()=>{jest.restoreAllMocks();});

test.each(['VIOLATED','UNVERIFIED','UNSUPPORTED'])('mandatory %s cannot be automatically applied',status=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const r=assessed(status);
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{storage:localStorage,automatic:true,confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test('known mandatory conflict cannot be explicitly accepted and retains its status',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const r=assessed('VIOLATED');
    expect(AI.gate(r,{storage:localStorage,confirm:()=>false})).toBe(false);
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{storage:localStorage,confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(r.avoidance_assessment.status).toBe('VIOLATED');
});

test('offline or changed preferences cannot reuse a previously verified mandatory claim',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const r=assessed();
    expect(AI.gate(r,{storage:localStorage,automatic:true})).toBe(true);
    expect(AI.gate(r,{storage:localStorage,offline:true,automatic:true})).toBe(false);
    localStorage.setItem('pref_cameras','false');
    expect(AI.gate(r,{storage:localStorage,automatic:true})).toBe(false);
});

test('legacy offline route without assessment is unverified and cannot silently meet mandatory settings',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    expect(AI.gate({geometry:'legacy'}, {storage:localStorage,automatic:true,offline:true})).toBe(false);
    expect(AI.summary({geometry:'legacy'})).toContain('Unverified');
});

test('legacy origins require recalculation while assessed preference routes remain usable',()=>{
    expect(AI.gate({geometry:'legacy'}, {storage:localStorage,automatic:true})).toBe(false);
    const r=assessed('UNVERIFIED','preference');r.avoidance_assessment.requires_acceptance=false;
    expect(AI.gate(r,{storage:localStorage,automatic:true})).toBe(true);
});

test('malformed geometry cannot be overridden by confirmation',()=>{
    const r=assessed();r.avoidance_assessment.geometry_valid=false;
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{storage:localStorage,confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test('normalization and selection preserve the selected route assessment, not primary compliance',()=>{
    const good=assessed(), bad=assessed('VIOLATED');
    const options=RS.buildRouteOptionsFromApiResponse({routes:[good,bad]},()=>[[53,-1],[53.1,-1]]);
    expect(options[1].avoidance_assessment.status).toBe('VIOLATED');
    expect(RS.mergeNavigationRouteFromSelected(good,options,1).avoidance_assessment.status).toBe('VIOLATED');
    expect(RS.mergeLastCalculatedRouteFromSelection(good,bad).avoidance_assessment.status).toBe('VIOLATED');
});

test('GPS reroute choice cannot preserve a conflicting previous route name over a verified alternative',()=>{
    const bad=assessed('VIOLATED');bad.name='Previous';
    const good=assessed();good.name='Clear';
    expect(RD.pickRerouteRouteFromResponse([bad,good],{previousRouteName:'Previous'})).toBe(good);
    expect(RD.pickRerouteRouteFromResponse([bad],{previousRouteName:'Previous'})).toBeNull();
    expect(RD.buildAutomaticRerouteOutcomePlan({success:true,routes:[bad]},{}).scheduleRetry).toBe(false);
});

test('all automatic map replacements refuse unverified mandatory routes before touching runtime/map',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const showStatus=jest.fn();
    RerouteMap.bind({call:{showStatus},rerouteDecision:()=>{throw new Error('Map must not be updated');}});
    expect(RerouteMap.updateRouteOnMap(assessed('UNVERIFIED'))).toMatchObject({ok:false,reason:'avoidance_not_established'});
    expect(showStatus).toHaveBeenCalledWith(expect.any(String),'warning');
});

test('stale request and preference changes cannot become current again',()=>{
    const old=AI.begin(localStorage), next=AI.begin(localStorage);
    expect(AI.current(old,localStorage)).toBe(false);
    expect(AI.current(next,localStorage)).toBe(true);
    AI.invalidate();
    expect(AI.current(next,localStorage)).toBe(false);
    expect(AI.responseCurrent(AI.tag({},next),localStorage)).toBe(false);
});

test('mandatory settings and category overrides survive request augmentation',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    localStorage.setItem('pref_avoidance_requirements',JSON.stringify([{category:'railway_crossings',enabled:true,mode:'mandatory'}]));
    const body=AI.augment({start:'53,-1',is_reroute:true},localStorage);
    expect(body.avoidance_mode).toBe('mandatory');
    expect(body.avoidance_requirements[0].category).toBe('railway_crossings');
    expect(body.is_reroute).toBe(true);
});

function bindCalculate(geocode,showStatus,inProgress=false) {
    document.body.innerHTML='<input id="start" value="53,-1"><input id="end" value="53.1,-1">';
    Calculate.bind({routingRequest:()=>RR, routeProgress:()=>Progress,
        getIsGeocoding:()=>false,getCurrentRoutingMode:()=> 'auto',getCurrentVehicleType:()=> 'petrol_diesel',
        getRouteInProgress:()=>inProgress,getIsTrackingActive:()=>false,getTrackingHistory:()=>[],getCurrentLat:()=>null,getCurrentLon:()=>null,
        call:{geocodeLocations:geocode,showStatus,getViaPoints:()=>[],getStops:()=>[],getRouteCostParams:()=>({}),
              isAvoidTollsEnabled:()=>false,getRoutePreferences:()=>({})}});
}
function deferred() { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; }
function response(error) {return {status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>({success:false,error})};}

test('actual calculate orchestration discards an older geocode result before requesting a route',async()=>{
    const old=deferred(), showStatus=jest.fn();
    const geocode=jest.fn().mockReturnValueOnce(old.promise).mockResolvedValue({start:'53,-1',end:'53.1,-1'});
    bindCalculate(geocode,showStatus);
    global.fetch=jest.fn(async()=>response('latest only'));
    const first=Calculate.calculateRoute();
    await Calculate.calculateRoute();
    old.resolve({start:'53,-1',end:'53.1,-1'});await first;
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(showStatus.mock.calls.filter(c=>String(c[0]).includes('latest only'))).toHaveLength(1);
});

test('actual calculate orchestration prevents an old response overwriting newer request status',async()=>{
    const slow=deferred(),showStatus=jest.fn();
    bindCalculate(async()=>({start:'53,-1',end:'53.1,-1'}),showStatus);
    global.fetch=jest.fn().mockReturnValueOnce(slow.promise).mockResolvedValueOnce(response('new route decision'));
    const first=Calculate.calculateRoute();
    await Promise.resolve();await Promise.resolve();
    await Calculate.calculateRoute();
    slow.resolve(response('stale route decision'));await first;
    expect(showStatus.mock.calls.some(c=>String(c[0]).includes('stale route decision'))).toBe(false);
    expect(showStatus.mock.calls.some(c=>String(c[0]).includes('new route decision'))).toBe(true);
});

test('preferences changed during network request discard the result and clear loading feedback',async()=>{
    const slow=deferred(),showStatus=jest.fn();
    bindCalculate(async()=>({start:'53,-1',end:'53.1,-1'}),showStatus);
    global.fetch=jest.fn(()=>slow.promise);
    const pending=Calculate.calculateRoute();
    await Promise.resolve();await Promise.resolve();
    localStorage.setItem('pref_railwayCrossingsAvoid','false');
    slow.resolve(response('old prefs'));await pending;
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('settings changed'),'warning');
    expect(showStatus.mock.calls.some(c=>String(c[0]).includes('old prefs'))).toBe(false);
});

test('mixed requirements preserve best effort when every mandatory requirement is satisfied',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const r=assessed('UNVERIFIED');
    r.avoidance_assessment.requires_acceptance=false;
    r.avoidance_assessment.automatic_selection_allowed=true;
    r.avoidance_assessment.requirements=[
        {category:'speed_cameras',enabled:true,mode:'mandatory',status:'SATISFIED'},
        {category:'tolls',enabled:true,mode:'preference',status:'UNVERIFIED'}];
    expect(AI.gate(r,{storage:localStorage,automatic:true})).toBe(true);
});

test('actual navigation start gates the selected conflicting option before map or navigation mutation',()=>{
    const Lifecycle=require('../app/navigation-lifecycle-orchestration.js');
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const good=assessed(),bad=assessed('VIOLATED'),showStatus=jest.fn();
    const mapControls=jest.fn(()=>{throw new Error('Navigation must not start');});
    Lifecycle.bind({routeSelection:()=>RS,getRouteOptions:()=>[good,bad],getSelectedRouteIndex:()=>1,
        mapControls,call:{showStatus}});
    const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    Lifecycle.startTurnByTurnNavigation(good);
    expect(confirm).not.toHaveBeenCalled();
    expect(mapControls).not.toHaveBeenCalled();
});

test('actual GPS reroute keeps current route when returned route cannot satisfy mandatory avoidance',async()=>{
    const GPS=require('../app/gps-orchestration.js');
    localStorage.setItem('pref_avoidance_mode','mandatory');
    window.lastCalculatedRoute=assessed();
    const state={rerouteInProgress:false,lastRerouteAttemptTime:0,postRerouteGraceUntil:0,currentLat:53.52,currentLon:-1.13};
    const showStatus=jest.fn(),updateRouteOnMap=jest.fn();
    GPS.bind({g:k=>state[k],s:(k,v)=>{state[k]=v;},m:{rerouteDecision:()=>RD},
        call:{resolveNavigationDestination:()=> '53.53,-1.13',showStatus,updateRouteOnMap,
            buildRouteRequest:()=>({start:'53.52,-1.13',end:'53.53,-1.13'})}});
    global.fetch=jest.fn(async()=>({json:async()=>({success:true,routes:[assessed('UNVERIFIED')]})}));
    await GPS.triggerAutomaticRerouteWithHazardHandling(53.52,-1.13);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).avoidance_mode).toBe('mandatory');
    expect(state.rerouteInProgress).toBe(false);
    expect(updateRouteOnMap).not.toHaveBeenCalled();
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('Unverified'),'warning');
});

test('declining a route limitation keeps preview start controls available',()=>{
    const Preview=require('../app/route-preview-orchestration.js');
    document.body.innerHTML='<button id="startNavBtn">Start</button>';
    const collapseBottomSheet=jest.fn();
    Preview.bind({call:{startTurnByTurnNavigation:()=>false,collapseBottomSheet}});
    Preview.applyStartNavigationFromPreviewFromPlan({shouldApply:true,syncFromSelection:false,
        hideStartNavButtonIds:['startNavBtn'],collapseBottomSheet:true});
    expect(document.getElementById('startNavBtn').style.display).not.toBe('none');
    expect(collapseBottomSheet).not.toHaveBeenCalled();
});

test('mandatory automatic replacement fails closed if the new verification module failed to load',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    delete global.VoyagrAvoidanceIntegrity;
    const showStatus=jest.fn();
    RerouteMap.bind({call:{showStatus},rerouteDecision:()=>{throw new Error('Map must not change');}});
    expect(RerouteMap.updateRouteOnMap({geometry:'legacy'})).toMatchObject({ok:false,reason:'avoidance_not_established'});
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('unavailable'),'warning');
});

// Fresh continuous endpoints isolate mandatory evidence from the separate origin gate.
test.each(['VIOLATED','UNVERIFIED','UNSUPPORTED',undefined,null,{},'SATISFIED '])(
    'mandatory assessment %p cannot reach manual confirmation',status=>{
        const r=assessed(status);r.avoidance_assessment.requirements[0].status=status;
        r.avoidance_assessment.requires_acceptance=false; // not an override authority
        const confirm=jest.fn(()=>true);
        for (const automatic of [false,true]) expect(AI.gate(r,{automatic,confirm})).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
    });

test.each([undefined,null,{},[null],[{category:'speed_cameras',enabled:'true',mode:'mandatory'}],
    [{category:'speed_cameras',enabled:true,mode:'unknown'}]])('malformed normalized requirements %p fail closed',rows=>{
    const r=assessed();r.avoidance_assessment.requirements=rows;
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test.each([0,NaN,Infinity,Date.now()/1000-601,Date.now()/1000+60])('mandatory checked_at %p cannot be accepted',at=>{
    const r=assessed();r.avoidance_assessment.checked_at=at;
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test('mandatory row omitted or downgraded from the original server contract fails closed',()=>{
    for (const rows of [[],[{category:'speed_cameras',enabled:true,mode:'preference',status:'SATISFIED'}]]) {
        const r=assessed();
        r.avoidance_requirements=[{category:'speed_cameras',enabled:true,mode:'mandatory'}];
        r.avoidance_assessment.requirements=rows;
        const confirm=jest.fn(()=>true);
        expect(AI.gate(r,{confirm})).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
    }
});

test('current explicit mandatory category cannot be omitted even with a matching snapshot',()=>{
    localStorage.setItem('pref_avoidance_requirements',JSON.stringify([
        {category:'railway_crossings',enabled:true,mode:'mandatory'}]));
    const r=assessed();
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test('mandatory permission requires its original current snapshot, including when settings are now preference',()=>{
    const r=assessed();
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{confirm})).toBe(true);
    localStorage.setItem('pref_avoidance_mode','preference');
    expect(AI.gate(r,{confirm})).toBe(false);
    delete r.avoidance_preferences_snapshot;
    expect(AI.gate(r,{confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test.each(['null','{}','not json','[null]'])('invalid saved requirement contract %s cannot grant permission',raw=>{
    localStorage.setItem('pref_avoidance_requirements',raw);
    const r=assessed();const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test('coarse mandatory mode does not promote explicitly normalized preference categories',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const r=assessed('UNVERIFIED','preference');
    r.avoidance_assessment.requires_acceptance=false;
    expect(AI.gate(r)).toBe(true);
    expect(AI.summary(r)).not.toContain('Preview only');
});

test('valid mandatory route reaches real bootstrap, unresolved selected alternative never does',()=>{
    const Lifecycle=require('../app/navigation-lifecycle-orchestration.js');
    const good=assessed(), bad=assessed('UNVERIFIED');
    const mapControls=jest.fn(()=>{throw new Error('CONTROL_BOOTSTRAP_REACHED');});
    let selected=0;
    Lifecycle.bind({routeSelection:()=>RS,getRouteOptions:()=>[good,bad],getSelectedRouteIndex:()=>selected,
        mapControls,call:{showStatus:jest.fn()}});
    const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    expect(()=>Lifecycle.startTurnByTurnNavigation(good)).toThrow('CONTROL_BOOTSTRAP_REACHED');
    expect(mapControls).toHaveBeenCalledTimes(1);
    selected=1;
    expect(Lifecycle.startTurnByTurnNavigation(good)).toBe(false);
    expect(mapControls).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(AI.summary(bad)).toContain('Preview only; navigation cannot start');
});

test('persisted mandatory route passes real resume handler but cannot restore permission',async()=>{
    const Offline=require('../modules/navigation/offline-navigation.js');
    const Resume=require('../app/offline-navigation-orchestration.js');
    const Lifecycle=require('../app/navigation-lifecycle-orchestration.js');
    const codec=require('polyline');
    global.indexedDB=new (require('fake-indexeddb').IDBFactory)();
    const r=assessed();r.geometry=codec.encode([[53,-1],[53.01,-1]],6);r.geometry_precision=6;
    await Offline.persistActiveRouteRecord(indexedDB,Offline.buildActiveRoutePersistRecord({
        polyline:[[53,-1],[53.01,-1]],routeData:r,steps:[],stepIndex:0}));
    const mapControls=jest.fn();
    // No preview selection may overwrite the restored route's invalidated assessment.
    Lifecycle.bind({routeSelection:()=>RS,getRouteOptions:()=>[],getSelectedRouteIndex:()=>0,
        mapControls,call:{showStatus:jest.fn()}});
    let result, attempts=0;
    Resume.bind({offlineNavigation:()=>Offline,routeSelection:()=>RS,
        polylineCodec:()=>({encodePolyline:codec.encode}),call:{showStatus:jest.fn(),
            startTurnByTurnNavigation:(...args)=>{attempts++;result=Lifecycle.startTurnByTurnNavigation(...args);}}});
    const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    jest.useFakeTimers();
    try {
        await Resume.tryResumeNavigation();
        const yes=document.getElementById(Offline.RESUME_NAV_YES_ID);
        expect(yes).not.toBeNull();yes.onclick();
        expect(attempts).toBe(1);expect(result).toBe(false);
        expect(mapControls).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled();
    } finally {
        jest.clearAllTimers();jest.useRealTimers();
        await Offline.clearActiveRouteRecord(indexedDB);
        document.body.innerHTML='';
    }
});

test('actual traffic reroute acceptance cannot bypass the real automatic map gate',async()=>{
    const Traffic=require('../app/traffic-orchestration.js');
    const TC=require('../modules/navigation/traffic-change.js');
    const r=assessed('VIOLATED');
    const bootstrap=jest.fn(()=>{throw new Error('Map must not change');});
    const notifications=jest.fn();
    const showStatus=jest.fn();
    let mapAttempts=0;
    window.lastCalculatedRoute=assessed();
    RerouteMap.bind({call:{showStatus},rerouteDecision:bootstrap});
    Traffic.bind({trafficChange:()=>TC,getCurrentLat:()=>53,getCurrentLon:()=>-1,
        getRouteInProgress:()=>true,getLastCalculatedRoute:()=>assessed(),
        getTrackingHistory:()=>[],resolveNavigationDestination:()=> '53.01,-1',
        buildRouteRequest:()=>({start:'53,-1',end:'53.01,-1'}),
        updateRouteOnMap:route=>{mapAttempts++;return RerouteMap.updateRouteOnMap(route);},sendNotification:notifications});
    global.fetch=jest.fn(async()=>({json:async()=>({success:true,routes:[r]})}));
    const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    await Traffic.triggerTrafficBasedReroute('severe',[{lat:53.005,lon:-1}],10);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mapAttempts).toBe(1);
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('navigation cannot start'),'warning');
    expect(bootstrap).not.toHaveBeenCalled();expect(notifications).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
});

test.each([
    [{category:'speed_cameras',enabled:true,mode:'mandatory',scope:'leg',status:'SATISFIED'}],
    [{category:'unknown',enabled:true,mode:'mandatory',status:'SATISFIED'}],
    [{category:'tolls',enabled:true,mode:'mandatory',status:'SATISFIED'},
        {category:'tolls',enabled:true,mode:'mandatory',status:'SATISFIED'}],
])('invalid category/scope/duplicate rows %p cannot grant permission',rows=>{
    const r=assessed();r.avoidance_assessment.requirements=rows;
    const confirm=jest.fn(()=>true);
    expect(AI.gate(r,{confirm})).toBe(false);expect(confirm).not.toHaveBeenCalled();
});

test('disabled normalized categories do not become mandatory from the coarse selector',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');
    const r=assessed();r.avoidance_assessment.requirements[0].enabled=false;
    expect(AI.gate(r)).toBe(true);
});

test('active recalculation cannot apply an unresolved mandatory result',async()=>{
    const showStatus=jest.fn();
    bindCalculate(async()=>({start:'53,-1',end:'53.01,-1'}),showStatus,true);
    const r=assessed('UNVERIFIED');
    global.fetch=jest.fn(async()=>({status:200,ok:true,headers:{get:()=> 'application/json'},
        json:async()=>({success:true,routes:[r]})}));
    const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    await Calculate.calculateRoute();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('navigation cannot start'),'warning');
    expect(confirm).not.toHaveBeenCalled();
});

test('preview does not call a stale requirement snapshot verified or offer an override',()=>{
    const r=assessed();
    expect(AI.summary(r)).toContain('Verified against available data only');
    localStorage.setItem('pref_avoidance_requirements',JSON.stringify([
        {category:'railway_crossings',enabled:true,mode:'mandatory'}]));
    const notice=AI.summary(r);
    expect(notice).toContain('Unverified');expect(notice).toContain('Preview only; navigation cannot start');
    expect(notice).not.toContain('Verified against available data only');
});
