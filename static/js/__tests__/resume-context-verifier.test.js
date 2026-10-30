/* Synthetic contexts only; exercise production reconstruction, selection and start. */
const AI=require('../modules/navigation/avoidance-integrity.js');
const RS=require('../modules/navigation/route-selection.js');
const Life=require('../app/navigation-lifecycle-orchestration.js');
const Off=require('../modules/navigation/offline-navigation.js');
const Resume=require('../app/offline-navigation-orchestration.js');
const codec=require('polyline');
function fresh(destination='SYNTHETIC_DESTINATION',end=[53.01,-1]) {
    const now=Date.now()/1000;
    const route={id:'synthetic-'+destination,destination,geometry:codec.encode([[53,-1],end],6),
        geometry_precision:6,maneuvers:[],avoidance_preferences_snapshot:AI.snapshot(localStorage),
        avoidance_assessment:{checked_at:now,status:'SATISFIED',geometry_valid:true,
            automatic_selection_allowed:true,requires_acceptance:false,origin_integrity_required:true,
            requirements:[{category:'tolls',enabled:true,mode:'mandatory',status:'SATISFIED'}],
            origin_integrity:{checked_at:now,navigation_allowed:true,transition_verified:false,
                status:'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE',requested_origin:[53,-1]}}};
    route.avoidance_assessment.geometry_binding=AI.geometryBinding(route);
    return route;
}
function reconstruct(route=fresh()) {
    return RS.buildRoutePayloadFromPersisted({routeData:route,steps:[],polyline:codec.decode(route.geometry,6)},codec.encode);
}
let bootstrap,status;
function bind(options=[]) {
    bootstrap=jest.fn(()=>{throw new Error('REVIEW_BOOTSTRAP_REACHED');});status=jest.fn();
    Life.bind({routeSelection:()=>RS,getRouteOptions:()=>options,getSelectedRouteIndex:()=>0,
        mapControls:bootstrap,call:{showStatus:status}});
}
beforeEach(()=>{
    localStorage.clear();global.VoyagrAvoidanceIntegrity=AI;
    Life.setRouteInProgress(false);Life.setRouteStarted(false);
    global.indexedDB=new (require('fake-indexeddb').IDBFactory)();
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
function refused(route,opts) {
    const original=JSON.stringify(route);
    expect(Life.startTurnByTurnNavigation(route,opts)).toBe(false);
    expect(bootstrap).not.toHaveBeenCalled();expect(status).toHaveBeenCalledWith(expect.any(String),'warning');
    expect(Life.getRouteInProgress()).toBe(false);expect(Life.getRouteStarted()).toBe(false);
    expect(JSON.stringify(route)).toBe(original);
}
test('adversarial: matching live selection cannot undo persisted invalidation',()=>{
    const valid=fresh(),restored=reconstruct(valid);bind([valid]);
    expect(AI.gate(restored)).toBe(false);
    refused(restored,{fromPersistedResume:true});
});
test('adversarial: missing verifier cannot admit legacy preference navigation',()=>{
    delete global.VoyagrAvoidanceIntegrity;bind();
    refused({geometry:codec.encode([[53,-1],[53.01,-1]],6),geometry_precision:6});
});
test.each(['none','matching','different','destination_changed','geometry_changed','stale','missing','mandatory_changed','origin_changed','identity_changed'])(
    'resume %s refuses before bootstrap and never mixes contexts',scenario=>{
        const saved=fresh('SAVED'),valid=fresh('UNRELATED',[53.02,-1]);
        const restored=reconstruct(saved);
        if(scenario==='origin_changed') restored.avoidance_assessment.origin_integrity.requested_origin=[54,-2];
        if(scenario==='identity_changed') restored.id='CHANGED_ID';
        if(scenario==='destination_changed') restored.destination='CHANGED';
        if(scenario==='geometry_changed') restored.geometry=valid.geometry;
        if(scenario==='stale') restored.avoidance_assessment.checked_at=Date.now()/1000-601;
        if(scenario==='missing') delete restored.avoidance_assessment;
        if(scenario==='mandatory_changed') localStorage.setItem('pref_avoidance_requirements',JSON.stringify([
            {category:'speed_cameras',enabled:true,mode:'mandatory'}]));
        bind(scenario==='none'?[]:scenario==='matching'?[saved]:[valid]);
        refused(restored,{fromPersistedResume:true});
    });
test('restored payload cannot drop resume options and borrow a fresh preview assessment',()=>{
    const saved=fresh('SAVED');bind([fresh('OTHER')]);refused(reconstruct(saved));
});
test('fresh-looking payload cannot bypass the explicit resume entry policy',()=>{
    const route=fresh();bind([route]);refused(route,{fromPersistedResume:true});
});
test('explicitly starting a new independently valid selection still reaches real bootstrap',()=>{
    const old=reconstruct(),valid=fresh('NEW');bind([valid]);
    expect(()=>Life.startTurnByTurnNavigation(valid)).toThrow('REVIEW_BOOTSTRAP_REACHED');
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(old.avoidance_assessment.checked_at).toBe(0);
});
test.each([
    ['missing',undefined],['null',null],['no_gate',{}],['nonfunction',{gate:true}],
    ['throws',{gate:()=>{throw new Error('synthetic verifier failure');}}],
    ['object_result',{gate:()=>({allowed:true})}],['string_result',{gate:()=> 'true'}],
    ['undefined_result',{gate:()=>undefined}],['promise_result',{gate:()=>Promise.resolve(true)}],
])('unavailable or malformed verifier %s refuses selected navigation',(_label,verifier)=>{
    const route=fresh();global.VoyagrAvoidanceIntegrity=verifier;bind([route]);refused(route);
});
test('missing verifier with mandatory settings refuses',()=>{
    localStorage.setItem('pref_avoidance_mode','mandatory');delete global.VoyagrAvoidanceIntegrity;
    bind();refused(fresh());
});
test('real verifier explicit refusal never reaches bootstrap or confirmation',()=>{
    const route=fresh();route.avoidance_assessment.requirements[0].status='UNVERIFIED';bind([route]);
    const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    refused(route);expect(confirm).not.toHaveBeenCalled();
});
test('offline start refuses with the real verifier',()=>{
    const route=fresh();bind([route]);jest.spyOn(navigator,'onLine','get').mockReturnValue(false);refused(route);
});
test('verifier property access failure refuses without bootstrap',()=>{
    const descriptor=Object.getOwnPropertyDescriptor(global,'VoyagrAvoidanceIntegrity');
    Object.defineProperty(global,'VoyagrAvoidanceIntegrity',{configurable:true,get:()=>{throw new Error('load failure');}});
    bind();try{refused(fresh());}finally{Object.defineProperty(global,'VoyagrAvoidanceIntegrity',descriptor);}
});
test.each([true,false])('real persisted banner with live preview; verifier available=%s',async available=>{
    const saved=fresh('SAVED'),valid=fresh('UNRELATED',[53.02,-1]);bind([valid]);
    await Off.persistActiveRouteRecord(indexedDB,Off.buildActiveRoutePersistRecord({polyline:codec.decode(saved.geometry,6),routeData:saved,steps:[],stepIndex:0}));
    if(!available) delete global.VoyagrAvoidanceIntegrity;
    let attempts=0,result;
    const preview=jest.fn();
    Resume.bind({offlineNavigation:()=>Off,routeSelection:()=>RS,polylineCodec:()=>({encodePolyline:codec.encode}),
        call:{showStatus:status,showRestoredRoutePreview:preview,startTurnByTurnNavigation:(...args)=>{
            attempts++;result=Life.startTurnByTurnNavigation(...args);return result;
        }}});
    jest.useFakeTimers();
    try {
        await Resume.tryResumeNavigation();const button=document.getElementById(Off.RESUME_NAV_YES_ID);
        expect(button).not.toBeNull();button.onclick();
        expect(attempts).toBe(1);expect(result).toBe(false);expect(bootstrap).not.toHaveBeenCalled();
        expect(preview).toHaveBeenCalledTimes(1);
        const shown=preview.mock.calls[0][0];
        expect(shown.destination).toBe(saved.destination);expect(shown.geometry).toBe(saved.geometry);
        expect(shown.id).toBe(saved.id);expect(shown.avoidance_assessment.checked_at).toBe(0);
    } finally {jest.clearAllTimers();await Off.clearActiveRouteRecord(indexedDB);document.body.innerHTML='';}
});

test('selection function itself cannot mix a saved destination with unrelated geometry',()=>{
    const restored=reconstruct(fresh('SAVED')),other=fresh('OTHER',[53.02,-1]);
    const merged=RS.mergeNavigationRouteFromSelected(restored,[other],0);
    expect(merged).toBe(restored);expect(merged.destination).toBe('SAVED');
    expect(merged.geometry).not.toBe(other.geometry);expect(merged.avoidance_assessment.checked_at).toBe(0);
});
test.each([AI,undefined,{}, {gate:()=>{throw new Error('unavailable');}}])('saved preview remains inspectable with verifier %p',verifier=>{
    const Preview=require('../app/route-preview-orchestration.js');
    const restored=reconstruct(fresh('SAVED'));
    let options=[fresh('OTHER',[53.02,-1])],selected=0;
    global.VoyagrAvoidanceIntegrity=verifier;
    document.body.innerHTML='<input id="start" value="UNRELATED"><input id="end" value="OTHER"><p id="routeAvoidanceNotice"></p>';
    const display=jest.fn(),showStatus=jest.fn(),switchTab=jest.fn();
    Preview.bind({routeSelection:()=>RS,getRouteInProgress:()=>false,
        setRouteOptions:r=>{options=r;},getRouteOptions:()=>options,
        setSelectedRouteIndex:i=>{selected=i;},getSelectedRouteIndex:()=>selected,
        getCurrentRoutingMode:()=> 'auto',getCurrentVehicleType:()=> 'petrol_diesel',getDistanceUnitValue:()=> 'km',
        getShowTrafficEnabled:()=>false,getTrafficLayer:()=>null,
        call:{getCurrencySymbol:()=> '£',convertDistance:n=>String(n),getDistanceUnit:()=> 'km',
            getTrafficSettingsSnapshot:()=>({routeTrafficEnabled:false}),displayAllRoutesOnMap:display,
            switchTab,expandBottomSheet:jest.fn(),showStatus}});
    expect(Preview.showRestoredRoutePreview(restored)).toBe(true);
    expect(options).toEqual([restored]);expect(selected).toBe(0);
    expect(window.lastCalculatedRoute).toBe(restored);
    expect(document.getElementById('end').value).toBe('SAVED');
    expect(document.getElementById('start').value).toBe('53,-1');
    expect(display).toHaveBeenCalledTimes(1);expect(switchTab).toHaveBeenCalledWith('routePreview');
    expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('navigation cannot start');
    expect(showStatus).toHaveBeenLastCalledWith(expect.stringContaining('preview only'),'warning');
    bind(options);refused(restored);
});
test('saved preview cannot replace an active navigation context',()=>{
    const Preview=require('../app/route-preview-orchestration.js');
    const change=jest.fn();Preview.bind({getRouteInProgress:()=>true,setRouteOptions:change});
    expect(Preview.showRestoredRoutePreview(reconstruct())).toBe(false);expect(change).not.toHaveBeenCalled();
});
test('unavailable verifier still refuses after restored options have been displayed',()=>{
    const route=reconstruct();delete global.VoyagrAvoidanceIntegrity;bind([route]);refused(route);
});

test('browser lifecycle loaded without the safety module refuses a legacy start',()=>{
    const vm=require('node:vm'),fs=require('node:fs');
    const context={module:{exports:{}},localStorage,navigator,console};
    vm.runInNewContext(fs.readFileSync(require.resolve('../app/navigation-lifecycle-orchestration.js'),'utf8'),context);
    const isolated=context.module.exports,map=jest.fn(),warning=jest.fn();
    isolated.bind({routeSelection:()=>RS,getRouteOptions:()=>[],getSelectedRouteIndex:()=>0,
        mapControls:map,call:{showStatus:warning}});
    expect(isolated.startTurnByTurnNavigation({geometry:'legacy'})).toBe(false);
    expect(map).not.toHaveBeenCalled();expect(warning).toHaveBeenCalledWith(expect.stringContaining('unavailable'),'warning');
});
test.each([undefined,{}, {gate:()=>({allowed:true})}, {gate:()=>{throw new Error('failure');}}])(
    'automatic map entry cannot bypass unavailable/malformed verifier %p',verifier=>{
        const Reroute=require('../app/reroute-map-orchestration.js');
        const map=jest.fn(()=>{throw new Error('MAP_REACHED');}),warning=jest.fn();
        Reroute.bind({rerouteDecision:map,call:{showStatus:warning}});
        global.VoyagrAvoidanceIntegrity=verifier;
        expect(Reroute.updateRouteOnMap({geometry:'legacy'})).toMatchObject({ok:false,reason:'avoidance_not_established'});
        expect(map).not.toHaveBeenCalled();expect(warning).toHaveBeenCalledWith(expect.any(String),'warning');
    });


test('offline automatic replacement refuses through the real gate',()=>{
    const Reroute=require('../app/reroute-map-orchestration.js');
    const map=jest.fn(),warning=jest.fn();
    Reroute.bind({rerouteDecision:map,call:{showStatus:warning}});
    jest.spyOn(navigator,'onLine','get').mockReturnValue(false);
    expect(Reroute.updateRouteOnMap(fresh())).toMatchObject({ok:false,reason:'avoidance_not_established'});
    expect(map).not.toHaveBeenCalled();
});

test.each([{}, {geometryBinding:()=>{throw new Error('unavailable');}}])(
    'malformed verifier during persisted reconstruction refuses visibly %p',async verifier=>{
        const saved=fresh();bind();
        await Off.persistActiveRouteRecord(indexedDB,Off.buildActiveRoutePersistRecord({polyline:codec.decode(saved.geometry,6),routeData:saved,steps:[],stepIndex:0}));
        const start=jest.fn();global.VoyagrAvoidanceIntegrity=verifier;
        Resume.bind({offlineNavigation:()=>Off,routeSelection:()=>RS,polylineCodec:()=>({encodePolyline:codec.encode}),
            call:{showStatus:status,startTurnByTurnNavigation:start}});
        jest.useFakeTimers();
        try {
            await Resume.tryResumeNavigation();const yes=document.getElementById(Off.RESUME_NAV_YES_ID);
            expect(yes).not.toBeNull();expect(()=>yes.onclick()).not.toThrow();
            expect(start).not.toHaveBeenCalled();expect(bootstrap).not.toHaveBeenCalled();
            expect(status).toHaveBeenCalledWith(expect.stringContaining('verification unavailable'),'warning');
        } finally {jest.clearAllTimers();await Off.clearActiveRouteRecord(indexedDB);document.body.innerHTML='';}
    });
