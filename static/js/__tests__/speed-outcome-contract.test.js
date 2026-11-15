const RM=require('../modules/navigation/road-matching');
const SL=require('../modules/navigation/speed-limit-widget');
const NOW=1800000000000;
function inputs(){return {
 context:{schema_version:1,source:'Overpass',source_kind:'OSM_EXTRACT',revision:'fixture',acquired_at_ms:NOW,source_data_at_ms:NOW-86400000,bounds:[53.52,-1.134,53.528,-1.126],coverage:'PARTIAL',speed_observations_only:true,restrictions:[],roads:[{osm_way_id:'10',node_ids:[1,2],geometry:[[53.52,-1.13],[53.528,-1.13]],tags:{highway:'residential',maxspeed:'30 mph'}}]},
 position:{timestamp:NOW,coords:{latitude:53.524,longitude:-1.13,accuracy:17.7,heading:null,speed:0}},vehicle:'car',now:NOW
};}
function assess(x){return RM.assessSpeedObservationWithinUncertainty(x.position,x.context?RM.createIndex(x.context):null,x.vehicle,x.now);}
test('available consensus reports an advisory value through the common outcome contract',()=>{
 const result=assess(inputs());
 expect(result).toMatchObject({status:'AVAILABLE',reasonCode:'MAPPED_SPEED_CONSENSUS',observation:{speed_limit_mph:30,applicable:false,position_uncertain:true}});
 expect(result.reason).toContain('Check road signs');
});
test.each([
 ['SOURCE_UNAVAILABLE',x=>{x.context=null;}],
 ['INVALID_GEOMETRY',x=>{x.context.roads[0].geometry=[[NaN,-1.13],[53.528,-1.13]];}],
 ['UNSUPPORTED_VEHICLE',x=>{x.vehicle='truck';}],
 ['GPS_UNAVAILABLE',x=>{x.position=null;}],
 ['GPS_INVALID',x=>{x.position.coords.accuracy=36;}],
 ['GPS_STALE',x=>{x.position.timestamp=NOW-15001;}],
 ['SOURCE_INVALID',x=>{x.context.source_kind='unreviewed';}],
 ['SOURCE_STALE',x=>{x.context.acquired_at_ms=NOW-60001;}],
 ['DATASET_STALE',x=>{x.context.source_data_at_ms=NOW-72*3600000-1;}],
 ['SOURCE_EDGE',x=>{x.context.bounds[1]=-1.13001;}],
 ['ROAD_RESTRICTIONS',x=>{x.context.roads[0].tags.access='private';}],
 ['SPEED_TAG_MISSING',x=>{delete x.context.roads[0].tags.maxspeed;}],
 ['SPEED_TAG_UNSUPPORTED',x=>{x.context.roads[0].tags.maxspeed='signals';}],
 ['SPEED_CONFLICT',x=>{x.context.roads[0].tags['maxspeed:forward']='20 mph';}],
 ['NO_CANDIDATES',x=>{x.context.roads=[];}],
])('%s explains an unavailable value without leaking location data',(reason,change)=>{
 const x=inputs();change(x);const result=assess(x);
 expect(result).toMatchObject({status:'UNAVAILABLE',reasonCode:reason,observation:null});
 expect(typeof result.reason).toBe('string');expect(result.reason.length).toBeGreaterThan(0);
 expect(JSON.stringify(result)).not.toMatch(/53\.524|-1\.13|\/api\/|GraphHopper|Valhalla|TomTom/);
});
test('conflicting parallel ways retain the same reason independent of input order',()=>{
 const x=inputs();x.context.roads.push({osm_way_id:'11',node_ids:[3,4],geometry:[[53.52,-1.1301],[53.528,-1.1301]],tags:{highway:'residential',maxspeed:'20 mph'}});
 expect(assess(x)).toMatchObject({status:'UNAVAILABLE',reasonCode:'SPEED_CONFLICT',observation:null});
 x.context.roads.reverse();
 expect(assess(x)).toMatchObject({status:'UNAVAILABLE',reasonCode:'SPEED_CONFLICT',observation:null});
});
test('display resolution uses the same status/reason contract without alert authority for routes',()=>{
 expect(SL.resolveSpeedDisplay({})).toMatchObject({status:'UNAVAILABLE',reasonCode:'NO_USABLE_SPEED',legalLimitMph:null});
 expect(SL.resolveSpeedDisplay({routeObservation:{evidence_state:'ROUTE_OBSERVATION',applicable:false,speed_limit_mph:30}})).toMatchObject({status:'AVAILABLE',reasonCode:'ROUTE_SPEED_OBSERVATION',limitMph:30,legalLimitMph:null});
});
