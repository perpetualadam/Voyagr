const RM=require('../modules/navigation/road-matching.js');
const RS=require('../modules/navigation/route-selection.js');
const codec=require('../modules/navigation/polyline-codec.js');
const fixtures=require('../../../tests/fixtures/phase7/directional-replay-v1.json');
const NOW=1800000000000;
const single=()=>JSON.parse(JSON.stringify(Object.values(fixtures.contexts).find(c=>c.roads.length===1&&!c.roads[0].tags.junction)));
const fix=t=>({timestamp:NOW+t,coords:{latitude:53.524,longitude:-1.13,accuracy:5,heading:0,speed:10}});

test.each([0,-1,1.5,'3',99])('unsupported navigation schema %s cannot be restored as a current route',version=>{
    expect(RS.buildRoutePayloadFromPersisted({navigation_schema_version:version,polyline:[[53.52,-1.13],[53.53,-1.13]],routeData:{}},codec.encodePolyline)).toBeNull();
});
test('source node identity cannot refer to conflicting coordinates',()=>{
    const d=single(),other=JSON.parse(JSON.stringify(d.roads[0]));other.osm_way_id='other';other.geometry[0][0]+=.01;d.roads.push(other);
    expect(RM.createIndex(d).invalid).toBe(true);
});
test('vehicle changes invalidate old car attributes before the next GPS fix',async()=>{
    const clock=jest.spyOn(Date,'now').mockReturnValue(NOW);
    document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option><option value="truck">Truck</option></select>';
    window.VoyagrRoadMatching=RM;jest.resetModules();const owner=require('../app/road-match-orchestration.js');
    const line=[[53.52,-1.13],[53.53,-1.13]],route={};
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({context:{...single(),served_at_ms:NOW}})});
    try{
        owner.observe(fix(0),line,route);await new Promise(r=>setTimeout(r,0));
        clock.mockReturnValue(NOW+1000);owner.observe(fix(1000),line,route);
        clock.mockReturnValue(NOW+2000);owner.observe(fix(2000),line,route);
        expect(owner.getAttributes().speed.speed_limit_mph).toBe(30);
        document.getElementById('vehicleType').value='truck';
        expect(owner.getAttributes()).toBeNull();
    }finally{clock.mockRestore();delete window.VoyagrRoadMatchOrchestration;delete window.VoyagrRoadMatching;delete global.fetch;}
});

test.each([undefined,1,2,3])('compatible offline schema %s preserves stops and keeps mandatory evidence unverified',version=>{
    const AI=require('../modules/navigation/avoidance-integrity.js');
    window.VoyagrAvoidanceIntegrity=AI;
    const line=[[53.52,-1.13],[53.525,-1.13],[53.53,-1.13]];
    const route={id:'selected',geometry:codec.encodePolyline(line,6),geometry_precision:6,
        leg_geometry_ranges:[{stop:{name:'remaining-stop'},end_shape_index:1}],
        avoidance_assessment:{status:'SATISFIED',checked_at:Date.now()/1000,requirements:[{enabled:true,mode:'mandatory',status:'SATISFIED'}]}};
    const restored=RS.buildRoutePayloadFromPersisted({navigation_schema_version:version,polyline:line,routeData:route},codec.encodePolyline);
    expect(restored.id).toBe('selected');expect(restored.leg_geometry_ranges).toEqual(route.leg_geometry_ranges);
    expect(restored.navigation_resume_requires_fresh_gps).toBe(true);
    expect(restored.avoidance_assessment.status).toBe('UNVERIFIED');expect(AI.decision(restored).allowed).toBe(false);
});
