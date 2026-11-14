const SG=require('../modules/navigation/speed-gps.js');
const RG=require('../modules/navigation/route-geometry.js');
const SL=require('../modules/navigation/speed-limit-widget.js');
const NOW=1800000000000;
let GPS,widget,state,clock,road;
const fix=extra=>({timestamp:NOW,coords:{latitude:53.524,longitude:-1.13,accuracy:4,speed:0,heading:null,...extra}});
beforeEach(()=>{
    jest.resetModules();clock=jest.spyOn(Date,'now').mockReturnValue(NOW);
    GPS=require('../app/gps-orchestration.js');widget=require('../app/speed-widget-orchestration.js');
    state={routeInProgress:false,routePolyline:[[53.523,-1.13],[53.525,-1.13]]};
    road={observe:jest.fn(),getAttributes:()=>null,getSpeedObservation:()=>null};
    global.VoyagrRoadMatchOrchestration=road;global.VoyagrGpsOrchestration=GPS;
    global.VoyagrJourneyModes={isSimulating:()=>false};
    GPS.bind({g:k=>state[k],m:{speedGps:()=>SG,routeGeometry:()=>RG}});
    document.body.innerHTML='<div id="speedWidget"><span id="speedValue"></span><div id="speedLimitCircle"><span id="speedLimitValue"></span><span id="speedLimitUnit"></span><span id="speedLimitMappedLabel" hidden></span></div></div><p id="routeSpeedLimitStatus"></p>';
    widget.bind({speedGps:()=>SG,speedLimitWidget:()=>SL,getSpeedUnit:()=> 'mph',getIsTrackingActive:()=>true,getRouteInProgress:()=>state.routeInProgress,
        getCurrentRouteSteps:()=>state.steps||[],call:{getSpeedUnit:()=> 'mph'}});
});
afterEach(()=>{clock.mockRestore();delete global.VoyagrRoadMatchOrchestration;delete global.VoyagrGpsOrchestration;delete global.VoyagrJourneyModes;});
test('fresh pre-start GPS initializes association; a second real fix enables the existing route-limit display',()=>{
    expect(GPS.acceptOriginPosition(fix())).toBe(true);
    expect(GPS.getNavigationPositionEvidence()).toBeNull();
    state.routeInProgress=true;
    state.steps=[{begin_shape_index:0,end_shape_index:1,speed_limit:30,road_class:'residential'}];
    expect(GPS.seedNavigationPositionFromAcceptedFix()).toBe(true);
    expect(GPS.getNavigationPositionEvidence()).toMatchObject({state:'REACQUIRING',timestamp:NOW});
    expect(road.observe).toHaveBeenCalledTimes(1);
    widget.refreshFromNavigationPosition();
    expect(document.getElementById('speedLimitValue').textContent).toBe('—');
    expect(document.getElementById('routeSpeedLimitStatus').textContent).toContain('GPS route position: REACQUIRING');
    clock.mockReturnValue(NOW+1000);
    GPS.acceptOriginPosition({...fix(),timestamp:NOW+1000});
    expect(GPS.seedNavigationPositionFromAcceptedFix()).toBe(true);
    expect(GPS.getNavigationPositionEvidence()).toMatchObject({state:'RELIABLE',timestamp:NOW+1000});
    widget.refreshFromNavigationPosition();
    expect(document.getElementById('speedLimitValue').textContent).toBe('30');
    expect(document.getElementById('speedLimitMappedLabel').textContent).toBe('Route');
    expect(document.getElementById('routeSpeedLimitStatus').textContent).toContain('GPS route position: RELIABLE');
    expect(widget.getCurrentSpeedLimitMph()).toBeNull();
    expect(GPS.seedNavigationPositionFromAcceptedFix()).toBe(false);
    expect(road.observe).toHaveBeenCalledTimes(2);
});
test('missing route speed remains unknown after successful initial association',()=>{
    GPS.acceptOriginPosition(fix());state.routeInProgress=true;
    GPS.seedNavigationPositionFromAcceptedFix();widget.refreshFromNavigationPosition();
    expect(document.getElementById('speedLimitValue').textContent).toBe('—');
    expect(document.getElementById('routeSpeedLimitStatus').textContent).toContain('Route-section limit: not supplied');
});
test.each(['stale','simulation','not navigating','no fix'])('does not initialize from %s',kind=>{
    if(kind!=='no fix')GPS.acceptOriginPosition(fix());
    state.routeInProgress=kind!=='not navigating';
    if(kind==='stale')clock.mockReturnValue(NOW+16000);
    if(kind==='simulation')global.VoyagrJourneyModes.isSimulating=()=>true;
    expect(GPS.seedNavigationPositionFromAcceptedFix()).toBe(false);
    expect(road.observe).not.toHaveBeenCalled();
});
test('new route discards old association and retains actual GPS timestamp/uncertainty',()=>{
    GPS.acceptOriginPosition(fix());state.routeInProgress=true;GPS.seedNavigationPositionFromAcceptedFix();
    state.routePolyline=[[53.523,-1.14],[53.525,-1.14]];
    expect(GPS.seedNavigationPositionFromAcceptedFix()).toBe(true);
    expect(GPS.getNavigationPositionEvidence()).not.toMatchObject({state:'RELIABLE'});
    expect(GPS.getAcceptedOriginFix()).toMatchObject({timestamp:NOW,accuracy:4});
});
test('existing association checks reject an imprecise fix without suppressing navigation',()=>{
    GPS.acceptOriginPosition(fix({accuracy:100}));state.routeInProgress=true;
    expect(GPS.seedNavigationPositionFromAcceptedFix()).toBe(true);
    expect(GPS.getNavigationPositionEvidence()).toMatchObject({state:'UNKNOWN'});
    expect(state.routeInProgress).toBe(true);
});
test.each([false,true,'throws'])('real navigation startup seeds accepted GPS without blocking guidance: %s',result=>{
    jest.useFakeTimers();
    delete global.VoyagrJourneyModes; // Use the fixture's complete legacy-start contract.
    const {makeRoute,bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
    const Life=require('../app/navigation-lifecycle-orchestration.js');
    const seed=jest.spyOn(GPS,'seedNavigationPositionFromAcceptedFix').mockImplementation(()=>{
        if(result==='throws')throw new Error('Optional enrichment unavailable');
        return result;
    });
    const refresh=jest.spyOn(widget,'refreshFromNavigationPosition').mockImplementation(()=>{});
    try {
        bindStart(bindTransition());
        expect(Life.startTurnByTurnNavigation(makeRoute())).toBe(true);
        expect(Life.getRouteInProgress()).toBe(true);
        expect(seed).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(result===true?1:0);
    } finally {seed.mockRestore();refresh.mockRestore();jest.clearAllTimers();jest.useRealTimers();}
});
