const Plan=require('../modules/navigation/journey-plan.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const Codec=require('../modules/navigation/polyline-codec.js');
const Sharing=require('../modules/navigation/route-sharing.js');

test('optimized stop order survives inspection/save/restore without acquiring live continuation',()=>{
    const points=[[0,0],[0,.004],[0,.008],[0,.012],[0,.02]];
    const stops=[0,2,1].map((original_index,i)=>({coordinates:points[i+1],original_index,duration_minutes:original_index*5,kind:'coordinates'}));
    const report={scope:'registered_primary_paths_only',requested_order:[0,1,2],resolved_order:[0,2,1],evaluated_orders:6,navigation_allowed:false};
    const route={geometry:Codec.encodePolyline(points,6),polyline:points,geometry_precision:6,geometry_complete:true,
        duration_minutes:25,driving_duration_minutes:10,dwell_duration_minutes:15,navigation_allowed:false,
        stop_semantics:{mode:'continuous_no_turn_reset',access_verification:'UNVERIFIED'},
        journey_context:{destination:{coordinates:points[4]},ordered_stops:stops,registered_stop_order_optimization:report},
        leg_geometry_ranges:points.slice(1).map((_,i)=>({begin_shape_index:i,end_shape_index:i+1}))};
    expect(Plan.inspection(route,AI).ranges).toHaveLength(4);
    const saved=Sharing.buildSaveCurrentRoutePlan({lastCalculatedRoute:route,routeName:'Synthetic ordered plan',now:123,startLabel:'A',endLabel:'B'}).savedRoute;
    const restored=Sharing.buildUseSavedRoutePlan(123,[saved]).lastCalculatedRoutePatch;
    expect(restored.journey_context.ordered_stops.map(stop=>stop.original_index)).toEqual([0,2,1]);
    expect(restored.journey_context.ordered_stops.map(stop=>stop.duration_minutes)).toEqual([0,10,5]);
    expect(restored.journey_context.registered_stop_order_optimization.requested_order).toEqual([0,1,2]);
    expect(restored.journey_context.registered_stop_order_optimization.evaluated_orders).toBe(6);
    expect(restored.navigation_allowed).toBe(false);
    expect(Plan.inspection(restored,AI).ranges).toHaveLength(4);
    expect(()=>Plan.liveIntent(restored,false,0)).toThrow(/Optimized registered plans are inspection only/);
});
