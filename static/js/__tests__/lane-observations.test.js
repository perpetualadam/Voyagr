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
    {'turn:lanes:forward':'left|;through'}, {'turn:lanes:forward':'<img src=x>|through'},
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

test('OSM blank indications are unmarked, with directional destination text preserved',()=>{
    const c=context();c.roads[0].tags['turn:lanes:forward']='|through';
    c.roads[0].tags['destination:lanes:forward']='City Centre|Airport';
    c.roads[0].tags['destination:ref:lanes:forward']='A1|A2';
    const layout=RM.laneObservation(matched(c),c,'car',NOW+1000);
    expect(layout.lane_arrows.map(l=>l.arrow)).toEqual(['·','↑']);
    expect(layout.recommended_lanes).toEqual([]);
    expect(layout.destinations).toEqual(['City Centre · A1','Airport · A2']);
    c.roads[0].tags['destination:lanes:forward']='Wrong lane count';
    expect(RM.laneObservation(matched(c),c,'car',NOW+1000)).toBeNull();
});

function providerStep() {
    return {lane_source:'Valhalla',type:10,begin_shape_index:1,lanes:[
        {active:false,valid:true,directions:['through','right'],valid_indications:['right'],active_indications:[],evidence_state:'PROVIDER'},
        {active:true,valid:true,directions:['right'],valid_indications:['right'],active_indications:['right'],evidence_state:'PROVIDER'}]};
}
function approach() {
    const c=context();c.roads[0].geometry[1]=[53.526,-1.13];
    const m=matched(c);
    return {c,m,line:c.roads[0].geometry,step:providerStep()};
}
test('native provider recommendations bind to this approach endpoint, independently of map lane permissions',()=>{
    const {c,m,line,step}=approach();
    expect(m.attributes_allowed).toBe(false);
    expect(RM.providerLaneApproach(m,c,'car',NOW+1000,line,step)).toBe(true);
    const result=LG.buildHybridLaneGuidance({routingManeuverLanes:step.lanes,maneuver:'right',distanceToManeuver:150});
    expect(result.recommended_lanes).toEqual([2]);
    expect(result.valid_lanes).toEqual([1,2]);
    expect(result.preferred_lanes).toEqual([2]);
    expect(result.lane_arrows.map(l=>l.arrow)).toEqual(['↑→','→']);
    expect(result.next_maneuver).toBe('right');
    expect(result.lane_change_needed).toBe(false);
    const multiple=LG.buildHybridLaneGuidance({routingManeuverLanes:[
        {...step.lanes[1],directions:['left']},step.lanes[0],{...step.lanes[1],directions:['left']}],
        maneuver:'left',distanceToManeuver:100});
    expect(multiple.recommended_lanes).toEqual([1,3]);
    expect(LG.displayText(multiple)).toBe('Use the left lane or right lane');
    expect(LG.buildLaneVoiceAnnouncementPlan(multiple,'').message).toBe('Use the left lane or right lane');
    const scoped={...multiple,lane_scope:'1:10'};
    const voice=LG.buildLaneVoiceAnnouncementPlan(scoped,'');
    expect(LG.buildLaneVoiceAnnouncementPlan(scoped,voice.announceKey)).toBeNull();
    expect(LG.buildLaneVoiceAnnouncementPlan({...scoped,lane_scope:'2:20'},voice.announceKey)).not.toBeNull();
});
test('provider approach rejects stale, unrelated, inferred, distant and past-junction scopes',()=>{
    const {c,m,line,step}=approach();
    const check=(match=m,context=c,path=line,target=step,now=NOW+1000)=>RM.providerLaneApproach(match,context,'car',now,path,target);
    expect(check({...m,evidence_status:'AMBIGUOUS'})).toBe(false);
    expect(check(m,c,line,step,NOW+17000)).toBe(false);
    expect(check({...m,route_relation:'DIFFERENT'})).toBe(false);
    expect(check(m,c,line,{...step,begin_shape_index:0})).toBe(false);
    expect(check(m,c,line,{...step,lane_source:undefined})).toBe(false);
    expect(check(m,c,line,{...step,lanes:step.lanes.map(l=>({...l,evidence_state:'INFERRED'}))})).toBe(false);
    expect(check(m,c,[line[0],[53.527,-1.13]],step)).toBe(false);
    const detour=[[53.524,-1.13],[53.525,-1.129],line[1]];
    expect(check(m,c,detour,{...step,begin_shape_index:2})).toBe(false);
    const reversal=[[53.524,-1.13],[53.525,-1.13],[53.5245,-1.13],line[1]];
    expect(check(m,c,reversal,{...step,begin_shape_index:3})).toBe(false);
    expect(check(m,c,[line[0],null])).toBe(false);
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
    const c=context();c.roads[0].tags['destination:lanes:forward']='City Centre|<img src=x onerror=alert(1)>';
    let observation=RM.laneObservation(matched(c),c,'car',NOW+1000);
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
        expect(document.querySelectorAll('.lane-destination')[1].textContent).toBe('<img src=x onerror=alert(1)>');
        expect(document.querySelector('#laneVisual img')).toBeNull();
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

test('native route lanes reach the actual overlay through a live-context approach match',async()=>{
    const clock=jest.spyOn(Date,'now').mockReturnValue(NOW),oldFetch=global.fetch;
    const {c,line,step}=approach();
    const path=line.concat([[53.526,-1.128]]),route={};
    document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option></select><div id="laneGuidanceDisplay"><span class="lane-guidance-title"></span><span id="laneGuidanceBadge"></span><div id="laneVisual"></div><div id="laneGuidanceText"></div></div>';
    window.VoyagrRoadMatching=RM;
    window.VoyagrGpsOrchestration={getNavigationPositionEvidence:()=>({state:'RELIABLE'}),getLastGpsFixAgeMs:()=>1000};
    jest.resetModules();const owner=require('../app/road-match-orchestration.js');
    const overlay=require('../app/lane-guidance-orchestration.js');
    const speak=jest.fn();
    overlay.bind({laneGuidance:()=>LG,getCurrentRouteSteps:()=>[{begin_shape_index:0},step],getCurrentStepIndex:()=>0,
        getRoutePolyline:()=>path,getVoiceAnnouncementsEnabled:()=>false,
        call:{calculateDistanceMeters:()=>200,speakMessage:speak}});
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({context:c})});
    const fix=t=>({timestamp:NOW+t,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10}});
    try {
        owner.observe(fix(0),path,route);await new Promise(resolve=>setTimeout(resolve,0));
        clock.mockReturnValue(NOW+1000);owner.observe(fix(1000),path,route);
        expect(owner.matchesProviderLaneApproach(step)).toBe(false);
        clock.mockReturnValue(NOW+2000);owner.observe(fix(2000),path,route);
        expect(owner.matchesProviderLaneApproach(step)).toBe(true);
        overlay.updateLaneGuidance(53.524,-1.13,0,'right',0,1);
        expect(document.querySelectorAll('.recommended')).toHaveLength(1);
        expect(Array.from(document.querySelectorAll('.lane-arrow')).map(n=>n.textContent)).toEqual(['↑→','→']);
        expect(document.querySelectorAll('.valid-route-lane')).toHaveLength(1);
        expect(document.querySelector('.recommended').getAttribute('aria-label')).toContain('Preferred route lane');
        expect(document.querySelector('.lane-guidance-title').textContent).toContain('Lane Guidance');
        owner.invalidate('GPS lost');
        expect(owner.matchesProviderLaneApproach(step)).toBe(false);
        overlay.updateLaneGuidance(53.524,-1.13,0,'right',0,1);
        expect(document.getElementById('laneGuidanceDisplay').classList.contains('show')).toBe(false);
        expect(speak).not.toHaveBeenCalled();
    } finally {
        clock.mockRestore();global.fetch=oldFetch;
        delete window.VoyagrRoadMatchOrchestration;delete window.VoyagrRoadMatching;delete window.VoyagrGpsOrchestration;
    }
});
