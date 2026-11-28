const Plan=require('../modules/navigation/journey-plan.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const Codec=require('../modules/navigation/polyline-codec.js');
const Sharing=require('../modules/navigation/route-sharing.js');

function preview(){
    const via={type:'via',coordinates:[.003,.006],original_index:0,duration_minutes:0,kind:'coordinates'};
    const stop={type:'stop',coordinates:[.003,.014],original_index:1,duration_minutes:15,kind:'coordinates'};
    const points=[[0,0],via.coordinates,stop.coordinates,[0,.02]];
    return {id:'mixed',geometry:Codec.encodePolyline(points,6),geometry_precision:6,polyline:points,geometry_complete:true,
        duration_minutes:25,driving_duration_minutes:10,dwell_duration_minutes:15,navigation_allowed:false,automatic_selection_allowed:false,
        stop_semantics:{mode:'continuous_no_turn_reset',access_verification:'UNVERIFIED'},
        journey_context:{ordered_visits:[via,stop],ordered_stops:[{...stop}]},
        leg_geometry_ranges:[{begin_shape_index:0,end_shape_index:1,visit:{...via}},
            {begin_shape_index:1,end_shape_index:2,visit:{...stop},stop:{...stop}},
            {begin_shape_index:2,end_shape_index:3}]};
}

test('mixed preview inspects all three legs and survives device save projection',()=>{
    const route=preview();expect(Plan.inspection(route,AI).ranges).toHaveLength(3);
    const saved=Sharing.buildSaveCurrentRoutePlan({lastCalculatedRoute:route,routeName:'Synthetic mixed',now:123,startLabel:'A',endLabel:'B'}).savedRoute;
    const restored=Sharing.buildUseSavedRoutePlan(123,[saved]).lastCalculatedRoutePatch;
    expect(restored.journey_context.ordered_visits.map(v=>v.type)).toEqual(['via','stop']);
    expect(restored.journey_context.ordered_visits.map(v=>v.kind)).toEqual(['saved','saved']);
    expect(restored.journey_context.ordered_visits.map(v=>v.source_kind)).toEqual(['coordinates','coordinates']);
    expect(restored.journey_context.ordered_stops).toHaveLength(1);
    expect(restored.dwell_duration_minutes).toBe(15);
    expect(Plan.inspection(restored,AI).ranges).toHaveLength(3);
    expect(()=>Plan.liveIntent(restored,false,0)).toThrow(/inspection only/);
});

test.each([
    r=>{r.leg_geometry_ranges.splice(1,1);},
    r=>{r.journey_context.ordered_visits[0].type='stop';},
    r=>{r.journey_context.ordered_visits[0].duration_minutes=15;},
    r=>{r.journey_context.ordered_stops=[];},
    r=>{r.journey_context.ordered_visits[1].original_index=0;},
    r=>{r.leg_geometry_ranges[1].visit.coordinates=[0,0];},
    r=>{r.navigation_allowed=true;},
])('malformed mixed preview cannot silently omit or reinterpret a visit (%#)',mutate=>{
    const route=preview();mutate(route);
    expect(()=>Plan.inspection(route,AI)).toThrow();
});
