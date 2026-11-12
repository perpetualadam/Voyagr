const RM = require('../modules/navigation/road-matching.js');
const SL = require('../modules/navigation/speed-limit-widget.js');
const SG = require('../modules/navigation/speed-gps.js');
const NOW = 1800000000000;
function context() {
    return {schema_version:1,source:'Overpass',revision:'test',acquired_at_ms:NOW,
        source_data_at_ms:NOW-86400000,bounds:[53.52,-1.134,53.528,-1.126],
        coverage:'PARTIAL',speed_observations_only:true,restrictions:[],
        roads:[{osm_way_id:'10',node_ids:[1,2],geometry:[[53.52,-1.13],[53.528,-1.13]],
            tags:{highway:'residential',maxspeed:'30 mph'}}]};
}
function match(c, extra={}) {
    const index=RM.createIndex(c);
    const position={timestamp:NOW,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10,...extra}};
    const first=RM.matchPosition(position,index,{now:NOW,vehicle:'car'});
    return RM.matchPosition({...position,timestamp:NOW+1000},index,{now:NOW+1000,vehicle:'car',previous:first});
}
test('explicit directional numeric observation stays outside legal, lane and hazard authority',()=>{
    const c=context();const m=match(c);
    expect(m.confidence).toBe('HIGH');
    expect(m.attributes_allowed).toBe(false);
    expect(RM.attributes(m,c,'car',NOW+1000)).toBeNull();
    expect(RM.speedObservation(m,c,'car',NOW+1000)).toMatchObject({speed_limit_mph:30,evidence_state:'MAPPED_OBSERVATION',applicable:false});
    c.roads[0].tags['maxspeed:forward']='20 mph';
    expect(RM.speedObservation(m,c,'car',NOW+1000).speed_limit_mph).toBe(20);
    c.roads[0].tags['maxspeed:forward']='50';
    expect(RM.speedObservation(m,c,'car',NOW+1000).speed_limit_mph).toBe(31.1);
});
test.each([
    {maxspeed:'GB:nsl_single'}, {maxspeed:'signals'}, {maxspeed:'30;50'}, {maxspeed:'0'}, {maxspeed:'200 mph'},
    {maxspeed:undefined}, {'maxspeed:conditional':'20 @ (school_hours)'},
    {'maxspeed:hgv':'20 mph'}, {access:'private'}, {vehicle:'no'}, {oneway:'reversible'}
])('inference, unsupported tags and restricted roads remain unknown: %j',tags=>{
    const c=context();Object.assign(c.roads[0].tags,tags);
    expect(RM.speedObservation(match(c),c,'car',NOW+1000)).toBeNull();
});
test('parallel road, stationary GPS and stale samples cannot produce observations',()=>{
    const c=context();
    c.roads.push({...c.roads[0],osm_way_id:'11',node_ids:[3,4],geometry:[[53.52,-1.13005],[53.528,-1.13005]]});
    expect(RM.speedObservation(match(c),c,'car',NOW+1000)).toBeNull();
    const d=context();const m=match(d);
    expect(RM.speedObservation(match(d,{speed:0}),d,'car',NOW+1000)).toBeNull();
    expect(RM.speedObservation(m,d,'car',NOW+17000)).toBeNull();
    expect(RM.speedObservation(m,d,'bus',NOW+1000)).toBeNull();
    d.source_data_at_ms=NOW-72*3600000;
    expect(RM.speedObservation(m,d,'car',NOW+1000)).toBeNull();
    d.source_data_at_ms=NOW+2000;
    expect(RM.speedObservation(m,d,'car',NOW+1000)).toBeNull();
    d.source_data_at_ms=NOW;d.acquired_at_ms=NOW-60000;
    expect(RM.speedObservation(m,d,'car',NOW+1000)).toBeNull();
});
test('widget labels mapped values, keeps legal alert state empty and clears on uncertainty',()=>{
    const widget=require('../app/speed-widget-orchestration.js');
    document.body.innerHTML='<div id="speedWidget"><span id="speedValue"></span><span id="speedUnitDisplay"></span><div id="speedLimitCircle"><span id="speedLimitValue"></span><span id="speedLimitUnit"></span><span id="speedLimitMappedLabel" hidden>Mapped</span></div></div>';
    widget.bind({speedGps:()=>SG,speedLimitWidget:()=>SL,getSpeedUnit:()=> 'mph',
        getIsTrackingActive:()=>true,getRouteInProgress:()=>false,call:{getSpeedUnit:()=> 'mph'}});
    const c=context();const observation=RM.speedObservation(match(c),c,'car',NOW+1000);
    widget.updateSpeedWidget(25,null,null,observation);
    expect(document.getElementById('speedLimitValue').textContent).toBe('30');
    expect(document.getElementById('speedLimitMappedLabel').hidden).toBe(false);
    expect(widget.getCurrentSpeedLimitMph()).toBeNull();
    widget.updateSpeedWidget(25,null);
    expect(document.getElementById('speedLimitValue').textContent).toBe('—');
    expect(document.getElementById('speedLimitMappedLabel').hidden).toBe(true);
});

test('real road owner opts into Overpass observations without pausing navigation or enabling lanes',async()=>{
    const clock=jest.spyOn(Date,'now').mockReturnValue(NOW);
    const oldFetch=global.fetch;
    document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option></select>';
    window.VoyagrRoadMatching=RM;
    jest.resetModules();
    const owner=require('../app/road-match-orchestration.js');
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({context:context()})});
    const line=[[53.52,-1.13],[53.528,-1.13]],route={};
    const fix=t=>({timestamp:NOW+t,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10}});
    try {
        owner.observe(fix(0),line,route);
        await new Promise(resolve=>setTimeout(resolve,0));
        expect(JSON.parse(global.fetch.mock.calls[0][1].body).speed_observations).toBe(true);
        clock.mockReturnValue(NOW+1000);owner.observe(fix(1000),line,route);
        expect(owner.getSpeedObservation()).toBeNull();
        clock.mockReturnValue(NOW+2000);owner.observe(fix(2000),line,route);
        expect(owner.getSpeedObservation().speed_limit_mph).toBe(30);
        expect(owner.getAttributes()).toBeNull();
        expect(RM.shouldPauseNavigation(owner.getSnapshot())).toBe(false);
        owner.invalidate('GPS lost');
        expect(owner.getSpeedObservation()).toBeNull();
    } finally {
        clock.mockRestore();global.fetch=oldFetch;
        delete window.VoyagrRoadMatchOrchestration;delete window.VoyagrRoadMatching;
    }
});

test('road enrichment falls back to a labelled route value without legal alerts, respecting units and precedence',()=>{
    const widget=require('../app/speed-widget-orchestration.js');
    document.body.innerHTML='<div id="speedWidget"><span id="speedValue"></span><span id="speedUnitDisplay"></span><div id="speedLimitCircle"><span id="speedLimitValue"></span><span id="speedLimitUnit"></span><span id="speedLimitMappedLabel" hidden>Mapped</span></div></div>';
    let unit='mph',mapped=null,legal=null,route={evidence_state:'ROUTE_OBSERVATION',applicable:false,speed_limit_mph:30};
    const oldRoad=window.VoyagrRoadMatchOrchestration,oldGps=window.VoyagrGpsOrchestration;
    window.VoyagrRoadMatchOrchestration={getAttributes:()=>legal?{speed:legal}:null,getSpeedObservation:()=>mapped};
    window.VoyagrGpsOrchestration={getRouteSpeedObservation:jest.fn(()=>route)};
    widget.bind({speedGps:()=>SG,speedLimitWidget:()=>SL,getSpeedUnit:()=>unit,
        getIsTrackingActive:()=>true,getRouteInProgress:()=>true,call:{getSpeedUnit:()=>unit}});
    const value=()=>document.getElementById('speedLimitValue').textContent;
    const badge=document.getElementById('speedLimitMappedLabel');
    const tick=()=>widget.fetchSpeedLimitThrottled(53.524,-1.13,25,'residential',30,0);
    try {
        tick();expect(value()).toBe('30');expect(badge.textContent).toBe('Route');expect(badge.hidden).toBe(false);
        expect(window.VoyagrGpsOrchestration.getRouteSpeedObservation).toHaveBeenCalledWith(30);
        expect(widget.getCurrentSpeedLimitMph()).toBeNull();
        unit='km/h';tick();expect(value()).toBe('48');expect(document.getElementById('speedLimitUnit').textContent).toBe('km/h');
        mapped={evidence_state:'MAPPED_OBSERVATION',applicable:false,speed_limit_mph:20};
        tick();expect(value()).toBe('32');expect(badge.textContent).toBe('Mapped');expect(widget.getCurrentSpeedLimitMph()).toBeNull();
        legal={evidence_state:'MAPPED_POSTED',applicable:true,speed_limit_mph:40};
        tick();expect(value()).toBe('64');expect(badge.hidden).toBe(true);expect(widget.getCurrentSpeedLimitMph()).toBe(40);
        legal=null;mapped=null;route=null;tick();expect(value()).toBe('—');expect(badge.hidden).toBe(true);expect(widget.getCurrentSpeedLimitMph()).toBeNull();
    } finally {window.VoyagrRoadMatchOrchestration=oldRoad;window.VoyagrGpsOrchestration=oldGps;}
});

test('mobile Info distinguishes missing route data from unavailable GPS association without coordinates',()=>{
 const widget=require('../app/speed-widget-orchestration.js');
 document.body.innerHTML='<p id="routeSpeedLimitStatus"></p><p id="routeMapRenderStatus"></p>';
 const oldRoad=window.VoyagrRoadMatchOrchestration,oldGps=window.VoyagrGpsOrchestration,oldMap=window.__voyagrMapGetDiagnostics;
 window.VoyagrRoadMatchOrchestration={getAttributes:()=>null,getSpeedObservation:()=>null};
 window.VoyagrGpsOrchestration={getRouteSpeedObservation:()=>null,getNavigationPositionEvidence:()=>({state:'UNKNOWN',reason:'Invalid, stale or inaccurate GPS'}),getAcceptedOriginFix:()=>({accuracy:50,lat:53.123456,lon:-1.987654})};
 widget.bind({speedGps:()=>SG,speedLimitWidget:()=>SL,getSpeedUnit:()=> 'mph',getIsTrackingActive:()=>true,getRouteInProgress:()=>true,call:{getSpeedUnit:()=> 'mph'}});
 try {
  widget.fetchSpeedLimitThrottled(53,-1,20,'residential',30,0);
  const text=document.getElementById('routeSpeedLimitStatus').textContent;
  expect(text).toContain('Speed display: unavailable');expect(text).toContain('Route-section limit: available');expect(text).toContain('GPS route position: UNKNOWN');
  expect(text).toContain('Invalid, stale or inaccurate GPS');expect(text).not.toContain('53.123456');expect(text).not.toContain('-1.987654');
  widget.fetchSpeedLimitThrottled(53,-1,20,'residential',null,0);
  expect(document.getElementById('routeSpeedLimitStatus').textContent).toContain('Route-section limit: not supplied');
  for(const [state,expected] of [[{contextLost:true},'graphics context lost'],[{contextLost:null},'graphics status unavailable'],[{contextLost:false,canvas:{width:0,height:100}},'canvas has no size'],[{contextLost:false,isStyleLoaded:true},'style loaded']]) {
   window.__voyagrMapGetDiagnostics=()=>state;widget.fetchSpeedLimitThrottled(53,-1,20,'residential',null,0);
   expect(document.getElementById('routeMapRenderStatus').textContent).toContain(expected);
  }
 } finally {window.VoyagrRoadMatchOrchestration=oldRoad;window.VoyagrGpsOrchestration=oldGps;window.__voyagrMapGetDiagnostics=oldMap;}
});
