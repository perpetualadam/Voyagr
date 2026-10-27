const RM=require('../modules/navigation/road-matching.js');
const LG=require('../modules/navigation/lane-guidance.js');
const HA=require('../modules/navigation/hazard-alerts.js');
const fixtures=require('../../../tests/fixtures/phase7/directional-replay-v1.json');
const {replay}=require('../../../scripts/lib/navigation-replay.cjs');
const NOW=1800000000000;
const copy=x=>JSON.parse(JSON.stringify(x));
const single=()=>copy(Object.values(fixtures.contexts).find(c=>c.roads.length===1 && !c.roads[0].tags.junction));
const fix=(t=0,coords={})=>({timestamp:NOW+t,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10,...coords}});
function matched(context=single()){const i=RM.createIndex(context);const first=RM.matchPosition(fix(),i,{now:NOW,route_generation:1});return RM.matchPosition(fix(1000),i,{now:NOW+1000,previous:first,route_generation:1});}

test.each(fixtures.scenarios)('$name: actual matching, attributes, GPS progress and hazard voice',scenario=>{
    const context=fixtures.contexts[scenario.context];
    const rows=replay({...scenario,road_context:context},scenario.route);
    const last=rows[rows.length-1];
    expect(last.roadMatch.evidence_status).toBe(scenario.expected_match_state);
    expect(last.roadMatch.osm_way_id).toBe(scenario.expected_road);
    expect(last.roadMatch.attributes_allowed).toBe(scenario.expected_attributes);
    expect(rows.every(r=>r.roadMatch.evidence_status!=='VERIFIED_AGAINST_SOURCE')).toBe(true);
    if(!scenario.expected_attributes){expect(last.attributes).toBeNull();expect(last.lane.show_lane_guidance).toBe(false);expect(last.hazardStatus).toBe('POSSIBLE');expect(last.voice).toContain('Possible');}
    else{expect(last.attributes.speed.evidence_state).toBe('MAPPED_POSTED');expect(last.attributes.speed.speed_limit_mph).toBe(30);expect(last.hazardStatus).toBe(scenario.expected_hazard||'APPLICABLE');}
    if(['AMBIGUOUS','UNMATCHED'].includes(last.roadMatch.evidence_status)){expect(last.remaining).toBe(rows[rows.length-2].remaining);expect(last.reroute).toBe(false);}
    expect(rows.some(r=>r.reroute)).toBe(!!scenario.expect_reroute);
    if(scenario.expected_hazard==='UNRELATED')expect(last.voice).toBeNull();
    if(scenario.name==='intermediate_stop_arrival')expect(rows.every(r=>r.arrival!=='end')).toBe(true);
    if(scenario.name==='final_destination_arrival')expect(last.arrival).toBe('end');
    if(scenario.name==='closely_spaced_manoeuvres')expect(last.maneuverIndex).toBe(2);
});

test('source missing IDs never fabricates a stable way or graph edge',()=>{const d=single();delete d.roads[0].osm_way_id;const r=matched(d);expect(r.osm_way_id).toBeNull();expect(r.graph_edge_id).toBeNull();expect(r.attributes_allowed).toBe(false);});
test('source freshness, incomplete coverage, malformed geometry and source schema fail closed',()=>{
    const d=single();d.acquired_at_ms=NOW-86400001;expect(matched(d).evidence_status).toBe('STALE');
    d.acquired_at_ms=NOW;d.coverage='PARTIAL';expect(matched(d).attributes_allowed).toBe(false);
    d.roads[0].geometry=[[NaN,-1.13],[53.53,-1.13]];expect(matched(d).evidence_status).toBe('UNMATCHED');
    d.schema_version=9;expect(matched(d).evidence_status).toBe('UNMATCHED');
});
test('hazard IDs are typed and stale/ambiguous hazards remain possible',()=>{
    const r=matched();
    expect(RM.hazardAssociation(r,{osm_way_id:'200',observed_at_ms:NOW},NOW+1000)).toBe('UNRELATED');
    expect(RM.hazardAssociation(r,{graph_edge_id:'100',graph_provider:'OSRM',observed_at_ms:NOW},NOW+1000)).toBe('POSSIBLE');
    expect(RM.hazardAssociation(r,{osm_way_id:'200'},NOW+1000)).toBe('POSSIBLE');
    expect(RM.hazardAssociation(r,{osm_way_id:'100',direction:'backward',observed_at_ms:NOW},NOW+1000)).toBe('UNRELATED');
});
test('unrelated source road cannot advance progress merely because it is near the route',()=>{
    const d=single(),r=matched(d),bound=RM.bindRoute(r,[[53.52,-1.1298],[53.53,-1.1298]],[],RM.createIndex(d));
    expect(bound.route_relation).toBe('DIFFERENT');expect(RM.shouldPauseNavigation({...bound,context_available:true})).toBe(true);
});
test('road attributes expire, cannot cross route/source/vehicle changes or override provider identity',()=>{
    const d=single(),r=matched(d);expect(RM.attributes(r,d,'truck',NOW+1000)).toBeNull();
    expect(RM.attributes(r,{...d,revision:'new'},'car',NOW+1000)).toBeNull();
    expect(RM.attributes(r,d,'car',NOW+16001)).toBeNull();
    const fresh={...r,match_timestamp_ms:NOW+301000};expect(RM.attributes(fresh,d,'car',NOW+301000).speed.applicable).toBe(false);
    expect(RM.bindRoute(r,[],[{osm_way_id:'200',begin_shape_index:1}],RM.createIndex(d)).route_relation).toBe('DIFFERENT');
});
test('uncertain hazards keep a useful warning without a definitive on-route claim',()=>{
    const p=HA.buildHazardAnnouncementPlan({type:'camera_speed',road_match_status:'POSSIBLE'},100,{now:NOW,cameraAlertType:'voice',unavoidableRouteCamera:true});
    expect(p.notification.message).toContain('uncertain');expect(p.spokenMessage).toContain('Possible');expect(p.spokenMessage).not.toContain('on route');
});

describe('actual road owner lifecycle',()=>{
    let clock,owner,line,route;
    beforeEach(()=>{
        clock=jest.spyOn(Date,'now').mockReturnValue(NOW);
        document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option><option value="truck">Truck</option></select>';
        window.VoyagrRoadMatching=RM;
        jest.resetModules();owner=require('../app/road-match-orchestration.js');
        line=[[53.52,-1.13],[53.53,-1.13]];route={};
    });
    afterEach(()=>{clock.mockRestore();delete window.VoyagrRoadMatchOrchestration;delete window.VoyagrRoadMatching;delete global.fetch;});
    const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
    test('one source feeds all attributes and invalid GPS clears that authority immediately',async()=>{
        global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({context:{...single(),served_at_ms:NOW}})});
        expect(owner.observe(fix(),line,route).evidence_status).toBe('UNMATCHED');await flush();
        clock.mockReturnValue(NOW+1000);owner.observe(fix(1000),line,route);
        expect(owner.getAttributes()).toBeNull();
        clock.mockReturnValue(NOW+2000);owner.observe(fix(2000),line,route);
        expect(owner.getAttributes().speed.speed_limit_mph).toBe(30);
        expect(owner.getAttributes().lanes.straight.recommended_lanes).toEqual([1]);
        expect(owner.classifyHazard({osm_way_id:'200',observed_at_ms:NOW})).toBe('UNRELATED');
        owner.invalidate('GPS lost');expect(owner.getAttributes()).toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    test('a late context cannot overwrite a newer route or vehicle',async()=>{
        let resolve;global.fetch=jest.fn(()=>new Promise(r=>{resolve=r;}));
        owner.observe(fix(),line,route);const old=resolve;
        clock.mockReturnValue(NOW+1000);owner.observe(fix(1000),line.slice(),route);
        old({ok:true,json:async()=>({context:single()})});await flush();const middle=resolve;
        expect(owner.getAttributes()).toBeNull();
        document.getElementById('vehicleType').value='truck';
        clock.mockReturnValue(NOW+2000);owner.observe(fix(2000),line,route);
        expect(owner.getSnapshot().attributes_allowed).toBe(false);
        expect(JSON.parse(global.fetch.mock.calls[2][1].body).vehicle_type).toBe('truck');
        // Resolve remaining requests to dispose timers without discarding stale-response guards.
        middle({ok:true,json:async()=>({context:null})});resolve({ok:true,json:async()=>({context:null})});await flush();
    });
    test('network failure never manufactures source data or floods each GPS tick',async()=>{
        global.fetch=jest.fn().mockRejectedValue(new Error('offline'));
        owner.observe(fix(),line,route);await flush();
        for(let i=1;i<10;i++){clock.mockReturnValue(NOW+i*1000);owner.observe(fix(i*1000),line,route);}
        expect(owner.getAttributes()).toBeNull();expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

test('conflicting graph identity, access restrictions and reverse roundabout direction fail closed',()=>{
    const d=single();d.roads[0].graph_provider='test';d.roads[0].graph_edge_id='7';d.roads.push({...copy(d.roads[0]),osm_way_id:'other'});
    expect(matched(d).evidence_status).toBe('UNMATCHED');
    const r=single();r.roads[0].tags.motorcar='no';expect(matched(r).attributes_allowed).toBe(false);
    r.roads[0].tags.oneway='-1';r.roads[0].tags.junction='roundabout';
    expect(matched(r).evidence_status).toBe('UNMATCHED');
});
test('stale fixes, boundary coverage and impossible transitions never gain authority',()=>{
    const d=single(),i=RM.createIndex(d),first=RM.matchPosition(fix(),i,{now:NOW,route_generation:1});
    expect(RM.matchPosition(fix(),i,{now:NOW+16000}).evidence_status).toBe('STALE');
    expect(RM.matchPosition(fix(1000),i,{now:NOW+1000,previous:first,route_generation:2}).attributes_allowed).toBe(false);
    const changed=single();changed.roads[0].osm_way_id='200';changed.roads[0].node_ids=['8','9'];
    expect(RM.matchPosition(fix(1000),RM.createIndex(changed),{now:NOW+1000,previous:first,route_generation:1}).evidence_status).toBe('AMBIGUOUS');
    d.bounds[1]=-1.13001;expect(matched(d).attributes_allowed).toBe(false);
});

test('actual lane UI cannot revive an unrelated provider lane without common road evidence',()=>{
    const LGO=require('../app/lane-guidance-orchestration.js');
    const steps=[{type:15,begin_shape_index:1,lanes:[{active:true},{active:false}]}];
    document.body.innerHTML='<div id="laneGuidanceDisplay" class="show"><span id="laneGuidanceBadge"></span><div id="laneVisual"></div><div id="laneGuidanceText"></div></div>';
    window.VoyagrRoadMatchOrchestration={getAttributes:()=>null,getSnapshot:()=>({evidence_status:'AMBIGUOUS',attributes_allowed:false})};
    LGO.bind({laneGuidance:()=>LG,getCurrentRouteSteps:()=>steps,getCurrentStepIndex:()=>0,getRoutePolyline:()=>[[53.52,-1.13],[53.53,-1.13]],getVoiceAnnouncementsEnabled:()=>true,call:{calculateDistanceMeters:()=>100,speakMessage:jest.fn()}});
    LGO.updateLaneGuidance(53.524,-1.13,0,'left',0,0);
    expect(document.getElementById('laneGuidanceDisplay').classList.contains('show')).toBe(false);
    delete window.VoyagrRoadMatchOrchestration;
});
