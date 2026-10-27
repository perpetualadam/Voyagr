const fixture=require('../../../tests/fixtures/phase5-journey.json');
const Codec=require('../modules/navigation/polyline-codec.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const RS=require('../modules/navigation/route-selection.js');
const RG=require('../modules/navigation/route-geometry.js');
const RP=require('../modules/navigation/route-progress.js');
const WP=require('../modules/navigation/waypoints.js');
const Calculate=require('../app/calculate-route-orchestration.js');
const RR=require('../modules/navigation/routing-request.js');

beforeEach(()=>{localStorage.clear();AI.invalidate();global.VoyagrAvoidanceIntegrity=AI;delete window.lastCalculatedRoute;});
afterEach(()=>{jest.restoreAllMocks();AI.invalidate();});

test('backend fixture draws every leg and the selected MapLibre route covers the whole journey',()=>{
    const options=RS.buildRouteOptionsFromApiResponse({routes:[fixture]},Codec.decodePolyline);
    expect(Codec.decodePolyline(options[0].geometry,options[0].geometry_precision)).toHaveLength(5);
    const plan=WP.buildMultiDropLegsMapApplyPlan(fixture,Codec.decodePolyline);
    expect(plan.layers).toHaveLength(4);
    expect(plan.layers[3].coordinates[1]).toEqual([-1.126,53.528]);
    expect(options[0].leg_geometry_ranges).toHaveLength(4);
    expect(RS.mergeNavigationRouteFromSelected({},options,0).leg_geometry_ranges).toHaveLength(4);
});

test('progress and arrival use the final destination, not the first stop',()=>{
    const coords=Codec.decodePolyline(fixture.geometry,6);
    const remaining=RG.computeRemainingDistanceAlongRoute(...coords[1],coords,0);
    expect(remaining).toBeGreaterThan(600);
    expect(RP.buildNavigationArrivalPlan(remaining,0,0,Date.now()).action).toBe('none');
    expect(RG.computeRemainingDistanceAlongRoute(...coords[4],coords,2)).toBeLessThan(1);
    expect(RP.buildNavigationArrivalPlan(0,0,0,Date.now()).action).toBe('end');
    const seed=RP.buildNavigationProgressSeedPlan(3,0,fixture.maneuvers,50);
    expect(seed.currentStepIndex).toBeGreaterThan(2);
});

test('Python/JavaScript geometry checksums agree and changed geometry cannot retain compliance',()=>{
    expect(AI.geometryBinding(fixture)).toBe(fixture.avoidance_assessment.geometry_binding);
    expect(AI.decision(fixture).allowed).toBe(true);
    const changed={...fixture,geometry:fixture.legs[0].geometry};
    expect(AI.decision(changed)).toMatchObject({allowed:false,acceptance:false});
});

test('GPS/traffic reroute keeps outstanding visits in their established order',()=>{
    window.lastCalculatedRoute=fixture;
    global.VoyagrNavigationLifecycleOrchestration={getLastSnappedRouteIndex:()=>1};
    const body=AI.augment({is_reroute:true,start:'53.522,-1.129',end:'53.528,-1.126'},localStorage);
    expect(body.stops).toHaveLength(2);
    expect(body.stops.map(s=>s.name)).toEqual(['Stop 1','Stop 2']);
    expect(body.preserve_stop_order).toBe(true);
    expect(body.optimize_stop_order).toBe(false);
    delete global.VoyagrNavigationLifecycleOrchestration;
});

test('supersession aborts the old fetch signal; discarding a response is still separately enforced',()=>{
    const first=AI.begin(localStorage);const firstOptions=AI.fetchOptions(first);
    const second=AI.begin(localStorage);
    expect(firstOptions.signal.aborted).toBe(true);
    expect(AI.current(first,localStorage)).toBe(false);
    expect(AI.current(second,localStorage)).toBe(true);
});

test('routing fetch is aborted after its bounded browser timeout and timer is disposed',()=>{
    jest.useFakeTimers();
    try {
        const ticket=AI.begin(localStorage);const options=AI.fetchOptions(ticket);
        jest.advanceTimersByTime(35000);
        expect(options.signal.aborted).toBe(true);
        AI.finish(ticket);
        expect(ticket.timer).toBeNull();
    } finally {jest.useRealTimers();}
});

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
test('actual calculate fetch carries AbortSignal and a newer route cancels the pending network request',async()=>{
    document.body.innerHTML='<input id="start" value="53,-1"><input id="end" value="53.1,-1">';
    const slow=deferred();const showStatus=jest.fn();
    Calculate.bind({routingRequest:()=>RR,routeProgress:()=>RP,getIsGeocoding:()=>false,
        getCurrentRoutingMode:()=> 'auto',getCurrentVehicleType:()=> 'petrol_diesel',
        getRouteInProgress:()=>false,getIsTrackingActive:()=>false,getTrackingHistory:()=>[],getCurrentLat:()=>null,getCurrentLon:()=>null,
        call:{geocodeLocations:async()=>({start:'53,-1',end:'53.1,-1'}),showStatus,getViaPoints:()=>[],getStops:()=>[],getRouteCostParams:()=>({}),isAvoidTollsEnabled:()=>false,getRoutePreferences:()=>({})}});
    const response={status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>({success:false,error:'current only'})};
    global.fetch=jest.fn().mockReturnValueOnce(slow.promise).mockResolvedValueOnce(response);
    const first=Calculate.calculateRoute();await Promise.resolve();await Promise.resolve();
    const signal=global.fetch.mock.calls[0][1].signal;
    await Calculate.calculateRoute();
    expect(signal.aborted).toBe(true);
    slow.resolve({...response,json:async()=>({success:false,error:'old response'})});await first;
    expect(showStatus.mock.calls.some(c=>String(c[0]).includes('old response'))).toBe(false);
});
