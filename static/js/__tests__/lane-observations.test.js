const RM = require('../modules/navigation/road-matching.js');
const LG = require('../modules/navigation/lane-guidance.js');
const NOW = 1800000000000;
function context() {
    return {schema_version:1,source:'Overpass',revision:'test',acquired_at_ms:NOW,
        source_data_at_ms:NOW-86400000,bounds:[53.52,-1.134,53.528,-1.126],
        coverage:'PARTIAL',speed_observations_only:true,lane_observations_only:true,restrictions:[],
        roads:[{osm_way_id:'10',node_ids:[1,2],geometry:[[53.52,-1.13],[53.528,-1.13]],
            tags:{highway:'primary',lanes:'4','lanes:forward':'2','lanes:backward':'2',
                'turn:lanes:forward':'left|through;right','turn:lanes:backward':'through|right'}}]};
}
function matched(c, extra={}) {
    const index=RM.createIndex(c);
    const fix={timestamp:NOW,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10,...extra}};
    const first=RM.matchPosition(fix,index,{now:NOW,vehicle:'car'});
    const m=RM.matchPosition({...fix,timestamp:NOW+1000},index,{now:NOW+1000,vehicle:'car',previous:first});
    return RM.bindRoute(m,extra.heading===180?[[53.528,-1.13],[53.52,-1.13]]:c.roads[0].geometry,[],index);
}
test('directional layout uses actual matching without creating lane recommendations',()=>{
    const c=context(),m=matched(c);
    const observation=RM.laneObservation(m,c,'car',NOW+1000);
    expect(observation).toMatchObject({evidence_state:'MAPPED_LANE_OBSERVATION',total_lanes:2,
        direction:'forward',osm_way_id:'10',recommended_lanes:[],recommended_lane:null,current_lane:null,show_lane_guidance:false});
    expect(observation.lane_arrows.map(l=>l.arrow)).toEqual(['←','↑→']);
    expect(LG.isActionableLaneGuidance(observation)).toBe(false);
    expect(RM.attributes(m,c,'car',NOW+1000)).toBeNull();
    expect(RM.laneObservation(matched(c,{heading:180}),c,'car',NOW+1000).lane_arrows.map(l=>l.arrow)).toEqual(['↑','→']);
});
test.each([
    {'turn:lanes:forward':undefined}, {'lanes:forward':undefined}, {'lanes:forward':'3'},
    {'turn:lanes:forward':'left|bogus'}, {'turn:lanes:forward':'left|through;through'},
    {'turn:lanes:forward':'left|'}, {'turn:lanes:forward':'<img src=x>|through'},
    {'turn:lanes:forward':'left|through;right;slight_right;reverse'},
    {'lanes:forward':'1'}, {'lanes:forward':'13'}, {lanes:'1'},
    {'bus:lanes:forward':'designated|no'}, {'access:lanes':'no|yes'},
    {'change:lanes':'no|yes'}, {'lanes:conditional':'1 @ (Mo-Fr)'}, {access:'private'}
])('missing/conflicting/unsupported tags do not become mapped layouts: %j',tags=>{
    const c=context();Object.assign(c.roads[0].tags,tags);
    expect(RM.laneObservation(matched(c),c,'car',NOW+1000)).toBeNull();
});
test('general turn tags apply only to one-way travel',()=>{
    const c=context();c.roads[0].tags={highway:'primary',lanes:'2','turn:lanes':'none|through'};
    expect(RM.laneObservation(matched(c),c,'car',NOW+1000)).toBeNull();
    c.roads[0].tags.oneway='yes';
    expect(RM.laneObservation(matched(c),c,'car',NOW+1000).lane_arrows.map(l=>l.arrow)).toEqual(['·','↑']);
    expect(RM.laneObservation(matched(c,{heading:180}),c,'car',NOW+1000)).toBeNull();
});
test('ambiguous roads, stale clocks, wrong vehicle and unbound route suppress layouts',()=>{
    const c=context(),m=matched(c);
    expect(RM.laneObservation({...m,route_relation:'UNVERIFIED'},c,'car',NOW+1000)).toBeNull();
    expect(RM.laneObservation({...m,route_relation:'DIFFERENT'},c,'car',NOW+1000)).toBeNull();
    expect(RM.laneObservation(m,c,'bus',NOW+1000)).toBeNull();
    expect(RM.laneObservation(m,c,'car',NOW+17000)).toBeNull();
    expect(RM.laneObservation(m,{...c,acquired_at_ms:NOW-60000},'car',NOW+1000)).toBeNull();
    expect(RM.laneObservation(m,{...c,source_data_at_ms:NOW-72*3600000},'car',NOW+1000)).toBeNull();
    expect(RM.laneObservation(matched(c,{speed:0}),c,'car',NOW+1000)).toBeNull();
    c.roads.push({...c.roads[0],osm_way_id:'11',node_ids:[3,4],geometry:[[53.52,-1.13005],[53.528,-1.13005]]});
    expect(RM.laneObservation(matched(c),c,'car',NOW+1000)).toBeNull();
});

test('actual lane UI shows neutral mapped layout, never highlights or speaks it, and clears uncertainty',()=>{
    const owner=require('../app/lane-guidance-orchestration.js');
    const c=context();let observation=RM.laneObservation(matched(c),c,'car',NOW+1000);
    const speak=jest.fn();let state='RELIABLE',attributes=null;
    document.body.innerHTML='<div id="laneGuidanceDisplay"><span class="lane-guidance-title"></span><span id="laneGuidanceBadge"></span><div id="laneVisual"></div><div id="laneGuidanceText"></div></div>';
    window.VoyagrRoadMatchOrchestration={getAttributes:()=>attributes,getSnapshot:()=>({attributes_allowed:false}),getLaneObservation:()=>observation};
    window.VoyagrGpsOrchestration={getNavigationPositionEvidence:()=>({state}),getLastGpsFixAgeMs:()=>1000};
    owner.bind({laneGuidance:()=>LG,getCurrentRouteSteps:()=>[{begin_shape_index:1}],getCurrentStepIndex:()=>0,
        getRoutePolyline:()=>c.roads[0].geometry,getVoiceAnnouncementsEnabled:()=>true,
        call:{calculateDistanceMeters:()=>100,speakMessage:speak}});
    try {
        owner.updateLaneGuidance(53.524,-1.13,0,'right',0,0);
        expect(document.getElementById('laneGuidanceDisplay').classList.contains('show')).toBe(true);
        expect(document.querySelector('.lane-guidance-title').textContent).toContain('Current road');
        expect(document.getElementById('laneGuidanceBadge').textContent).toBe('Mapped');
        expect(Array.from(document.querySelectorAll('.lane-arrow')).map(n=>n.textContent)).toEqual(['←','↑→']);
        expect(document.querySelectorAll('.recommended')).toHaveLength(0);
        expect(speak).not.toHaveBeenCalled();
        attributes={lanes:{right:{source:'matched_directional_source',evidence_state:'EXPLICIT',
            total_lanes:2,recommended_lanes:[2],recommended_lane:2,show_lane_guidance:true,has_turn_lanes:true}}};
        owner.updateLaneGuidance(53.524,-1.13,0,'right',0,0);
        expect(document.querySelector('.lane-guidance-title').textContent).toContain('Lane Guidance');
        expect(document.querySelectorAll('.recommended')).toHaveLength(1);
        attributes=null;
        state='UNKNOWN';owner.updateLaneGuidance(53.524,-1.13,0,'right',0,0);
        expect(document.getElementById('laneGuidanceDisplay').classList.contains('show')).toBe(false);
        state='RELIABLE';observation=null;owner.updateLaneGuidance(53.524,-1.13,0,'right',0,0);
        expect(document.getElementById('laneGuidanceDisplay').classList.contains('show')).toBe(false);
    } finally {
        delete window.VoyagrRoadMatchOrchestration;delete window.VoyagrGpsOrchestration;
    }
});

test('actual road owner shares a single bounded context for speed and lane observations',async()=>{
    const clock=jest.spyOn(Date,'now').mockReturnValue(NOW),oldFetch=global.fetch;
    document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option></select>';
    window.VoyagrRoadMatching=RM;
    jest.resetModules();const owner=require('../app/road-match-orchestration.js');
    const c=context();c.roads[0].tags.maxspeed='30 mph';
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({context:c})});
    const route={},line=c.roads[0].geometry;
    const fix=t=>({timestamp:NOW+t,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10}});
    try {
        owner.observe(fix(0),line,route);await new Promise(resolve=>setTimeout(resolve,0));
        const request=JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(request).toMatchObject({speed_observations:true,lane_observations:true});
        clock.mockReturnValue(NOW+1000);owner.observe(fix(1000),line,route);
        expect(owner.getLaneObservation()).toBeNull();
        clock.mockReturnValue(NOW+2000);owner.observe(fix(2000),line,route);
        expect(owner.getLaneObservation().total_lanes).toBe(2);
        expect(owner.getSpeedObservation().speed_limit_mph).toBe(30);
        expect(owner.getAttributes()).toBeNull();
        expect(RM.shouldPauseNavigation(owner.getSnapshot())).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        document.getElementById('vehicleType').value='';
        expect(owner.getLaneObservation()).toBeNull();
    } finally {
        clock.mockRestore();global.fetch=oldFetch;
        delete window.VoyagrRoadMatchOrchestration;delete window.VoyagrRoadMatching;
    }
});
