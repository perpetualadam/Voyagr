const LG=require('../modules/navigation/lane-guidance.js');
const RG=require('../modules/navigation/route-geometry.js');
const TI=require('../modules/navigation/turn-instructions.js');
const VA=require('../modules/navigation/voice-announcements.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const Codec=require('../modules/navigation/polyline-codec.js');
const OFF=require('../modules/navigation/offline-navigation.js');
const RS=require('../modules/navigation/route-selection.js');
const fixtures=require('../../../tests/fixtures/phase6-gps-replay.json');
const {replay}=require('../../../scripts/lib/navigation-replay.cjs');

test('inferred lane arrays cannot masquerade as provider lane observations',()=>{
    expect(LG.extractRoutingLaneGuidance([{active:false,evidence_state:'INFERRED'},{active:true,evidence_state:'INFERRED'}])).toBeNull();
    const guidance=LG.buildHybridLaneGuidance({maneuver:'roundabout',roundaboutExitCount:3,roadType:'motorway',distanceToManeuver:100});
    expect(guidance.show_lane_guidance).toBe(false);
    expect(guidance.recommended_lanes).toEqual([]);
});

test('second roundabout exit cannot override explicit provider lane choice',()=>{
    const guidance=LG.buildHybridLaneGuidance({routingManeuverLanes:[{active:false},{active:true}],maneuver:'roundabout',roundaboutExitCount:2,distanceToManeuver:100});
    expect(guidance.evidence_state).toBe('PROVIDER');
    expect(guidance.recommended_lanes).toEqual([2]);
    expect(guidance.show_lane_guidance).toBe(true);
});

test('provider active lanes preserve all legal choices and ignore bus-only lanes',()=>{
    const lanes=[{active:true,bus_only:true},{active:true},{active:true}];
    expect(LG.extractRoutingLaneGuidance(lanes).recommended_lanes).toEqual([2,3]);
    expect(LG.extractRoutingLaneGuidance([{active:false,valid_indications:['left']},{active:false,valid_indications:['right']}])).toBeNull();
});

test('visual and spoken roundabout exit counts agree despite contradictory verbal text',()=>{
    expect(TI.getRoundaboutDirectionText(26,3)).toContain('3rd');
    const spoken=VA.buildTurnAnnouncement({direction:'roundabout',announcementDistance:500,distanceUnit:'mi',roundaboutExitCount:3,verbalAlert:'Take the second exit'});
    expect(spoken).toContain('3rd');expect(spoken).not.toContain('second');
    expect(TI.getRoundaboutDirectionText(26,2.5)).toBe('enter the roundabout');
});

test.each(fixtures.scenarios)('$name: replay actual admission, matching, progress and reroute logic',scenario=>{
    const rows=replay(scenario,fixtures.routes[scenario.route]);
    expect(rows.at(-1).state).toBe(scenario.expected_last_state);
    if (scenario.expected_maneuvers) expect(rows.map(r=>r.maneuverIndex)).toEqual(scenario.expected_maneuvers);
    if (scenario.expected_last_direction) expect(rows.at(-1).direction).toBe(scenario.expected_last_direction);
    expect(rows.some(r=>r.arrival==='end')).toBe(!!scenario.expect_arrival);
    expect(rows.some(r=>r.reroute)).toBe(!!scenario.expect_reroute);
    if(scenario.hold_last_progress) {
        const reliable=rows.filter(r=>r.along!==null);
        expect(reliable.at(-1).along).toBe(reliable[1].along);
    }
    const progress=rows.filter(r=>r.along!==null).map(r=>r.along);
    expect(progress.every((p,i)=>i===0 || p>=progress[i-1])).toBe(true);
});

test('persisted selected alternative preserves visits but invalidates an old verified claim',()=>{
    const points=fixtures.routes.main;
    const selected={id:2,geometry:Codec.encodePolyline(points,6),geometry_precision:6,
        leg_geometry_ranges:[{leg_index:0,stop:{name:'B'},waypoint:{lat:53.525,lon:-1.13},end_shape_index:1}],
        avoidance_assessment:{status:'SATISFIED',geometry_binding:null,checked_at:Date.now()/1000,
            requirements:[{enabled:true,mode:'mandatory',status:'SATISFIED'}]}};
    selected.avoidance_assessment.geometry_binding=AI.geometryBinding(selected);
    const record=OFF.buildActiveRoutePersistRecord({polyline:points,steps:[],stepIndex:1,routeData:{...selected,routes:[{id:1}]}});
    expect(record.navigation_schema_version).toBe(3);expect(record.routeData.routes).toBeUndefined();
    const restored=RS.buildRoutePayloadFromPersisted(record,Codec.encodePolyline);
    expect(restored.id).toBe(2);expect(restored.leg_geometry_ranges).toEqual(selected.leg_geometry_ranges);
    expect(restored.avoidance_assessment.status).toBe('UNVERIFIED');
    expect(AI.decision(restored).allowed).toBe(false);
    expect(selected.avoidance_assessment.status).toBe('SATISFIED');
});

test('mismatched or malformed saved geometry is not silently resumed',()=>{
    expect(RS.buildRoutePayloadFromPersisted({polyline:fixtures.routes.main,routeData:{geometry:Codec.encodePolyline([[53,-1],[54,-2]],6)}},Codec.encodePolyline)).toBeNull();
    expect(RS.buildRoutePayloadFromPersisted({polyline:[[NaN,0],[53,-1]]},Codec.encodePolyline)).toBeNull();
    expect(OFF.isPersistedRouteExpired(Date.now()+5000)).toBe(true);
});

test('one continuous road remains matchable regardless of vertex density',()=>{
    const line=Array.from({length:101},(_,i)=>[53.52+i*.00001,-1.13]);
    const p={timestamp:1800000000000,coords:{latitude:53.5205,longitude:-1.13,accuracy:30,speed:0}};
    const first=RG.assessNavigationPosition(p,line,null,p.timestamp);
    expect(first.state).toBe('REACQUIRING');
    expect(RG.assessNavigationPosition({...p,timestamp:p.timestamp+1000},line,first,p.timestamp+1000).state).toBe('RELIABLE');
});

test('unknown-side motorway exit stays generic in initial and next-manoeuvre guidance',()=>{
    const m={type:20,maneuver_kind:'off ramp',direction_override:'exit',begin_shape_index:1,instruction:'Take the exit'};
    expect(TI.directionForManeuver(m)).toBe('exit');
    expect(TI.buildNavStartTurnInstructionInit([m],0,fixtures.routes.main).direction).toBe('exit');
});

test('geometry-only turn inference is labelled and cannot produce a definitive instruction',()=>{
    const payload=TI.buildTurnWidgetDisplayPayloadFromTurnInfo({direction:'right',distance:50,evidence_state:'INFERRED'});
    expect(payload.direction).toBe('straight');
    expect(payload.instruction).toContain('unavailable');
});

test('actual GPS watch rejects ambiguous matching before progress, arrival or voice mutation',()=>{
    const GPS=require('../app/gps-orchestration.js'),SG=require('../modules/navigation/speed-gps.js');
    const now=1800000000000;const time=jest.spyOn(Date,'now').mockReturnValue(now);
    const showStatus=jest.fn(),mutate=jest.fn();
    const state={routeInProgress:true,routePolyline:fixtures.routes.parallel};
    GPS.bind({g:k=>state[k],s:mutate,m:{speedGps:()=>SG,routeGeometry:()=>RG},call:{showStatus}});
    GPS.setGpsTrackingStoppedByUser(false);GPS.setGpsWatchId(null);GPS.setIsTrackingActive(false);
    navigator.geolocation.watchPosition=jest.fn(()=>77);
    GPS.ensureGPSTracking({forceRestart:true,documentVisible:true});
    navigator.geolocation.watchPosition.mock.calls[0][0]({timestamp:now,coords:{latitude:53.525,longitude:-1.1299,accuracy:15,speed:0}});
    expect(mutate).not.toHaveBeenCalled();
    expect(GPS.getNavigationPositionEvidence().state).toBe('UNKNOWN');
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('progress paused'),'warning');
    time.mockRestore();
});

test('dense junction manoeuvre lookup does not jump five vertices ahead',()=>{
    const RP=require('../modules/navigation/route-progress.js');
    const steps=[{begin_shape_index:0},{begin_shape_index:1},{begin_shape_index:3}];
    expect(RP.resolveStepIndexFromSnapIndex(steps,0)).toBe(0);
    expect(RP.resolveStepIndexFromSnapIndex(steps,2)).toBe(1);
});

test('arrival requires reliable evidence and completion of an intermediate stop near the destination',()=>{
    const RP=require('../modules/navigation/route-progress.js');
    const now=1800000000000;
    const opts={now,accuracy:5,routeInProgress:true,speedMs:0,arrivalZoneSince:0,
        positionEvidence:{state:'RELIABLE',timestamp:now,remainingM:3,snap:{index:2,t:.5}},
        legRanges:[{stop:true,end_shape_index:3}]};
    expect(RP.buildEvidenceNavigationArrivalTickPlan(opts).reason).toBe('pending-intermediate-stop');
    expect(RP.buildEvidenceNavigationArrivalTickPlan({...opts,legRanges:[]}).action).toBe('end');
    expect(RP.buildEvidenceNavigationArrivalTickPlan({...opts,legRanges:[],positionEvidence:{...opts.positionEvidence,state:'UNKNOWN'}}).reason).toBe('unreliable-position');
});
