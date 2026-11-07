const RM=require('../modules/navigation/road-matching.js');
const LC=require('../modules/navigation/lane-connectivity.js');
const LG=require('../modules/navigation/lane-guidance.js');
const NOW=1800000000000;
function relation(to='20',connectivity='2:1,2') {
    return {osm_relation_id:'99',from_way:'10',from_ways:['10'],via_node:'2',to_way:to,
        unsupported:false,tags:{type:'connectivity',connectivity}};
}
function scenario() {
    const context={schema_version:1,source:'Overpass',revision:'test',acquired_at_ms:NOW,
        source_data_at_ms:NOW-86400000,bounds:[53.52,-1.134,53.528,-1.126],
        coverage:'PARTIAL',speed_observations_only:true,lane_observations_only:true,restrictions:[],
        roads:[{osm_way_id:'10',node_ids:[1,2],geometry:[[53.52,-1.13],[53.526,-1.13]],
            tags:{highway:'primary',oneway:'yes',lanes:'2','turn:lanes':'through|right',maxspeed:'30 mph'}},
        {osm_way_id:'20',node_ids:[2,3],geometry:[[53.526,-1.13],[53.526,-1.124]],
            tags:{highway:'primary',oneway:'yes',lanes:'2'}},
        {osm_way_id:'30',node_ids:[2,4],geometry:[[53.526,-1.13],[53.532,-1.13]],
            tags:{highway:'primary',oneway:'yes',lanes:'1'}}],
        lane_connectivity:{acquired_at_ms:NOW,relations:[relation(),relation('30','1:1')]}};
    return {context,line:[[53.52,-1.13],[53.526,-1.13],[53.526,-1.124]],
        route:{source:'GraphHopper'},vehicle:'car',now:NOW+1000,step:{type:10,begin_shape_index:1}};
}
function match(s,extra={}) {
    const index=RM.createIndex(s.context),p={timestamp:NOW,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10,...extra}};
    const first=RM.matchPosition(p,index,{now:NOW});
    return RM.bindRoute(RM.matchPosition({...p,timestamp:NOW+1000},index,{now:NOW+1000,previous:first}),s.line,[],index);
}
function resolve(s=scenario()) {return LC.resolve({...s,match:match(s)},RM);}
test('GraphHopper right and straight routes select their own positive lane connections',()=>{
    const s=scenario(),right=resolve(s);
    expect(right).toMatchObject({evidence_state:'MAPPED_CONNECTIVITY',from_way:'10',via_node:'2',to_way:'20',recommended_lanes:[2],current_lane:null});
    expect(RM.attributes(match(s),s.context,'car',NOW+1000)).toBeNull();
    s.line[2]=[53.532,-1.13];s.step.type=8;
    expect(resolve(s).recommended_lanes).toEqual([1]);
    expect(resolve(s).to_way).toBe('30');
});
test.each([
    ['1:1|2:(2)',[1]], ['1:(1),2|2:(1)',[1]], ['2:1,2',[2]], ['1:(1)|2:(2)',[]],
    ['bw:1',null],['0:1',null],['3:1',null],['1:3',null],['1:1|1:2',null],['1:1,1',null],
    ['1:(1',null],['1:',null],['',null]
])('connectivity %s keeps direct connections only',(raw,expected)=>{
    expect(LC.directConnections(raw,2,2)).toEqual(expected);
});
test('missing, duplicate and unsupported relations never become native GraphHopper lane data',()=>{
    expect(LC.resolve(scenario(),{})).toBeNull();
    expect(LC.resolve(null,RM)).toBeNull();
    const s=scenario();s.context.lane_connectivity.relations=[];
    expect(resolve(s)).toBeNull();
    s.context.lane_connectivity.relations=[relation(),relation()];expect(resolve(s)).toBeNull();
    s.context.lane_connectivity.relations=[{...relation(),unsupported:true}];expect(resolve(s)).toBeNull();
    s.context.lane_connectivity.relations=[relation('20','2:(1),(2)')];expect(resolve(s)).toBeNull();
    s.context.lane_connectivity.relations=[{...relation(),tags:{type:'connectivity',connectivity:'2:1',except:'motorcar'}}];
    expect(resolve(s)).toBeNull();
    s.context.lane_connectivity.relations=[{...relation(),osm_relation_id:null}];expect(resolve(s)).toBeNull();
    s.context.lane_connectivity.relations=[relation(),{...relation(),from_way:'50',from_ways:['50'],member_ways:['50','10','20'],unsupported:true}];
    expect(resolve(s)).toBeNull();
});
test.each(['no_right_turn','only_straight_on','unrecognized'])('turn restriction %s prevents contradictory guidance',kind=>{
    const s=scenario();s.context.lane_connectivity.relations.push({...relation(kind==='only_straight_on'?'30':'20'),
        tags:{type:'restriction',restriction:kind}});
    expect(resolve(s)).toBeNull();
});
test('unrelated restrictions do not invent a prohibition for the selected route',()=>{
    const s=scenario();s.context.lane_connectivity.relations.push({...relation('30'),tags:{type:'restriction',restriction:'no_straight_on'}});
    expect(resolve(s).recommended_lanes).toEqual([2]);
});
test('freshness, route source, step scope, access and direction remain mandatory',()=>{
    const s=scenario();expect(resolve({...s,route:{source:'Valhalla'}})).toBeNull();
    expect(resolve({...s,now:NOW+61000})).toBeNull();
    expect(resolve({...s,vehicle:'bus'})).toBeNull();
    expect(resolve({...s,step:{type:26,begin_shape_index:1}})).toBeNull();
    expect(resolve({...s,step:{type:10,begin_shape_index:0}})).toBeNull();
    s.context.roads[1].tags.oneway='-1';expect(resolve(s)).toBeNull();
    s.context.roads[1].tags.oneway='yes';s.context.roads[1].tags['bus:lanes']='designated|no';expect(resolve(s)).toBeNull();
    delete s.context.roads[1].tags['bus:lanes'];s.context.lane_connectivity.acquired_at_ms=NOW-60000;expect(resolve(s)).toBeNull();
});
test('near-parallel and restricted outgoing competitors cannot be silently discarded',()=>{
    const s=scenario();s.context.roads.push({osm_way_id:'40',node_ids:[2,5],
        geometry:[[53.526,-1.13],[53.52603,-1.124]],tags:{highway:'service',access:'private'}});
    expect(resolve(s)).toBeNull();
});
test('hybrid UI retains mapped provenance and never claims occupied lane or necessary lane change',()=>{
    const data=LG.buildHybridLaneGuidance({apiData:resolve(),maneuver:'right',distanceToManeuver:200});
    expect(data.recommended_lanes).toEqual([2]);
    expect(data.evidence_state).toBe('MAPPED_CONNECTIVITY');
    expect(LG.badge(data)).toEqual({text:'Mapped',visible:true});
    expect(data.lane_change_needed).toBe(false);
    expect(LG.buildLaneVoiceAnnouncementPlan(data,'').message).toBe('Use the right lane');
});

test('real road owner and overlay follow the selected GraphHopper route and clear on GPS loss',async()=>{
    const clock=jest.spyOn(Date,'now').mockReturnValue(NOW),oldFetch=global.fetch;
    const s=scenario(),speak=jest.fn();
    document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option></select><div id="laneGuidanceDisplay"><span class="lane-guidance-title"></span><span id="laneGuidanceBadge"></span><div id="laneVisual"></div><div id="laneGuidanceText"></div></div>';
    window.VoyagrRoadMatching=RM;window.VoyagrLaneConnectivity=LC;
    window.VoyagrGpsOrchestration={getNavigationPositionEvidence:()=>({state:'RELIABLE'}),getLastGpsFixAgeMs:()=>1000};
    jest.resetModules();const owner=require('../app/road-match-orchestration.js');
    const overlay=require('../app/lane-guidance-orchestration.js');
    let step=s.step,path=s.line;
    overlay.bind({laneGuidance:()=>LG,getCurrentRouteSteps:()=>[{begin_shape_index:0},step],getCurrentStepIndex:()=>0,
        getRoutePolyline:()=>path,getVoiceAnnouncementsEnabled:()=>true,
        call:{calculateDistanceMeters:()=>200,speakMessage:speak}});
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({context:s.context})});
    const fix=t=>({timestamp:NOW+t,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10}});
    try {
        owner.observe(fix(0),path,s.route);await new Promise(resolve=>setTimeout(resolve,0));
        expect(JSON.parse(global.fetch.mock.calls[0][1].body).lane_connectivity).toBe(true);
        clock.mockReturnValue(NOW+1000);owner.observe(fix(1000),path,s.route);
        expect(owner.getGraphHopperLaneGuidance(step)).toBeNull();
        clock.mockReturnValue(NOW+2000);owner.observe(fix(2000),path,s.route);
        overlay.updateLaneGuidance(53.524,-1.13,0,'right',0,1);
        expect(document.querySelectorAll('.recommended')).toHaveLength(1);
        expect(document.getElementById('laneGuidanceBadge').textContent).toBe('Mapped');
        expect(document.getElementById('laneGuidanceText').textContent).toBe('Use the right lane');
        expect(speak).toHaveBeenCalledWith('Use the right lane','normal');
        expect(owner.getSnapshot().attributes_allowed).toBe(false);
        const nextRoute={source:'GraphHopper'};path=[path[0],path[1],[53.532,-1.13]];step={type:8,begin_shape_index:1};
        clock.mockReturnValue(NOW+3000);owner.observe(fix(3000),path,nextRoute);
        expect(owner.getGraphHopperLaneGuidance(step)).toBeNull();
        await new Promise(resolve=>setTimeout(resolve,0));
        clock.mockReturnValue(NOW+4000);owner.observe(fix(4000),path,nextRoute);
        clock.mockReturnValue(NOW+5000);owner.observe(fix(5000),path,nextRoute);
        expect(owner.getGraphHopperLaneGuidance(step).recommended_lanes).toEqual([1]);
        owner.invalidate('GPS lost');overlay.updateLaneGuidance(53.524,-1.13,0,'straight',0,1);
        expect(document.getElementById('laneGuidanceDisplay').classList.contains('show')).toBe(false);
    } finally {
        clock.mockRestore();global.fetch=oldFetch;
        delete window.VoyagrRoadMatchOrchestration;delete window.VoyagrRoadMatching;
        delete window.VoyagrLaneConnectivity;delete window.VoyagrGpsOrchestration;
    }
});
