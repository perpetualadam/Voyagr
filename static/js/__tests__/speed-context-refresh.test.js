const RM=require('../modules/navigation/road-matching.js');
const SG=require('../modules/navigation/speed-gps.js');
const SL=require('../modules/navigation/speed-limit-widget.js');
const NOW=1800000000000;
let owner,widget,release,tracking,fix,clock;
const old={};
beforeEach(()=>{
    jest.resetModules();clock=jest.spyOn(Date,'now').mockReturnValue(NOW);
    for(const key of ['fetch','VoyagrRoadMatching','VoyagrRoadMatchOrchestration','VoyagrSpeedWidgetOrchestration','VoyagrGpsOrchestration'])old[key]=global[key];
    tracking=true;fix={lat:53.524,lon:-1.13,accuracy:17.7,timestamp:NOW};
    document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option></select><div id="speedWidget"><span id="speedValue"></span><div id="speedLimitCircle"><span id="speedLimitValue"></span><span id="speedLimitUnit"></span><span id="speedLimitMappedLabel" hidden></span></div></div>';
    global.VoyagrRoadMatching=RM;
    global.fetch=jest.fn(()=>new Promise(resolve=>{release=resolve;}));
    global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>fix,getNavigationPositionEvidence:()=>null,getRouteSpeedObservation:()=>null};
    widget=require('../app/speed-widget-orchestration.js');
    widget.bind({speedGps:()=>SG,speedLimitWidget:()=>SL,getSpeedUnit:()=> 'mph',getIsTrackingActive:()=>tracking,getRouteInProgress:()=>false,getCurrentRouteSteps:()=>[],call:{getSpeedUnit:()=> 'mph'}});
    owner=require('../app/road-match-orchestration.js');
    owner.observe({timestamp:NOW,coords:{latitude:fix.lat,longitude:fix.lon,accuracy:17.7,heading:null,speed:0}},null,null);
    widget.fetchSpeedLimitThrottled(fix.lat,fix.lon,0,'unknown',null,null);
    expect(document.getElementById('speedLimitValue').textContent).toBe('—');
});
afterEach(()=>{clock.mockRestore();for(const key of Object.keys(old))global[key]=old[key];});
async function finish(speedTags){
    release({ok:true,json:async()=>({context:{schema_version:1,source:'Overpass',source_kind:'OSM_EXTRACT',revision:'delayed',acquired_at_ms:NOW,source_data_at_ms:NOW-86400000,served_at_ms:NOW,bounds:[53.52,-1.134,53.528,-1.126],coverage:'PARTIAL',speed_observations_only:true,restrictions:[],roads:[{osm_way_id:'10',node_ids:[1,2],geometry:[[53.52,-1.13],[53.528,-1.13]],tags:speedTags||{highway:'residential',maxspeed:'30 mph'}}]}})});
    await new Promise(resolve=>setTimeout(resolve,0));
}
test('delayed road acquisition renders its mapped estimate without replaying GPS',async()=>{
    await finish();
    expect(document.getElementById('speedLimitValue').textContent).toBe('30');
    expect(document.getElementById('speedLimitMappedLabel').textContent).toBe('Mapped est.');
    expect(widget.getCurrentSpeedLimitMph()).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
});
test.each(['stopped GPS','stale fix','missing fix'])('late source response cannot publish after %s',async kind=>{
    if(kind==='stopped GPS')tracking=false;
    if(kind==='stale fix')fix.timestamp=NOW-16000;
    if(kind==='missing fix')fix=null;
    await finish();
    expect(document.getElementById('speedLimitValue').textContent).toBe('—');
});
test('optional renderer failure leaves acquired road data usable',async()=>{
    const refresh=jest.spyOn(widget,'refreshFromNavigationPosition').mockImplementation(()=>{throw Error('Optional renderer unavailable');});
    await finish();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(owner.getSpeedObservation()).toMatchObject({speed_limit_mph:30,applicable:false});
});
test('read-only context status reports acquisition state and freshness without coordinates',async()=>{
    expect(owner.getSpeedContextStatus()).toMatchObject({state:'loading',roadCount:0});
    await finish();
    const status=owner.getSpeedContextStatus();
    expect(status).toMatchObject({state:'available',roadCount:1});
    expect(Object.keys(status).sort()).toEqual(['matchReason','matchState','roadCount','speedReason','speedReasonCode','speedStatus','state']);
    expect(JSON.stringify(status)).not.toMatch(/53\.524|-1\.13|\/api\/|GraphHopper|Valhalla|TomTom/);
    clock.mockReturnValue(NOW+60001);
    expect(owner.getSpeedContextStatus().state).toBe('stale');
});
test('optional Info diagnostics cannot interrupt a valid mapped display',async()=>{
    document.body.insertAdjacentHTML('beforeend','<p id="routeSpeedLimitStatus"></p><p id="routeSpeedDataStatus"></p>');
    const status=jest.spyOn(owner,'getSpeedContextStatus').mockImplementation(()=>{throw Error('Optional diagnostic unavailable');});
    try {
        await finish();
        expect(document.getElementById('speedLimitValue').textContent).toBe('30');
        expect(document.getElementById('routeSpeedDataStatus').textContent).toBe('Speed details unavailable.');
    } finally {status.mockRestore();}
});
test('missing mapped tags retain a coordinate-free reason through acquisition and Info rendering',async()=>{
    document.body.insertAdjacentHTML('beforeend','<p id="routeSpeedLimitStatus"></p><p id="routeSpeedDataStatus"></p>');
    await finish({highway:'residential'});
    expect(owner.getSpeedObservationResult()).toMatchObject({status:'UNAVAILABLE',reasonCode:'SPEED_TAG_MISSING',observation:null});
    expect(owner.getSpeedObservation()).toBeNull();
    expect(document.getElementById('speedLimitValue').textContent).toBe('—');
    const info=document.getElementById('routeSpeedDataStatus').textContent;
    expect(info).toContain('SPEED_TAG_MISSING');
    expect(info).not.toMatch(/53\.524|-1\.13|\/api\/|GraphHopper|Valhalla|TomTom/);
});
