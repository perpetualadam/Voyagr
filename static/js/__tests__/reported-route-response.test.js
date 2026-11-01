const AI=require('../modules/navigation/avoidance-integrity.js');
const Plan=require('../modules/navigation/journey-plan.js');
const RS=require('../modules/navigation/route-selection.js');
const codec=require('../modules/navigation/polyline-codec.js');
const captured=require('./fixtures/sheffield-doncaster-20261101.json');
let clock;
beforeEach(()=>{clock=jest.spyOn(Date,'now').mockReturnValue((captured.routes[0].avoidance_assessment.checked_at+1)*1000);});
afterEach(()=>clock.mockRestore());
function options(){return RS.buildRouteOptionsFromApiResponse(JSON.parse(JSON.stringify(captured)),codec.decodePolyline);}
test('actual GraphHopper assessment binds but its first empty metadata record triggers old instruction validation',()=>{
 const route=options()[0];expect(AI.geometryBinding(route)).toBe('7b82209c');
 expect(route.avoidance_assessment.geometry_valid).toBe(true);
 const bad=route.maneuvers.findIndex(s=>typeof s.instruction!=='string'||!s.instruction.trim());
 expect(bad).toBe(5);expect(route.maneuvers[bad]).toMatchObject({type:8,instruction:'',begin_shape_index:27,end_shape_index:46,distance:0,time:0,speed_limit:30});
 expect(AI.prepareNavigationCandidate(route)).not.toBeNull();
 expect(()=>Plan.inspection(route,AI)).not.toThrow();
});
test('all five captured alternatives retain their independent assessment and navigation refusal',()=>{
 const routes=options();expect(routes).toHaveLength(5);
 routes.forEach((route,i)=>{
  expect(AI.geometryBinding(route)).toBe(captured.routes[i].avoidance_assessment.geometry_binding);
  expect(AI.prepareNavigationCandidate(route)).not.toBeNull();
  expect(AI.decision(route).allowed).toBe(false);
  expect(route.avoidance_assessment).toEqual(captured.routes[i].avoidance_assessment);
 });
 const inspection=Plan.inspection(routes[0],AI);
 expect(inspection.steps.every(s=>s.instruction.trim())).toBe(true);
 expect(routes[0].maneuvers.some(s=>s.instruction==='')).toBe(true);
});
test.each([
 ['ordinary missing instruction',r=>{r.maneuvers[0].instruction='';}],
 ['nonzero metadata distance',r=>{r.maneuvers[5].distance=1;}],
 ['nonzero metadata time',r=>{r.maneuvers[5].time=1;}],
 ['wrong metadata type',r=>{r.maneuvers[5].type=10;}],
 ['missing edge metadata',r=>{delete r.maneuvers[5].speed_limit;delete r.maneuvers[5].road_class;}],
 ['invalid metadata index',r=>{r.maneuvers[5].end_shape_index=1e9;}],
 ['binding mismatch',r=>{r.avoidance_assessment.geometry_binding='deadbeef';}],
 ['malformed geometry',r=>{r.geometry='?';}],
 ['only metadata without guidance',r=>{r.maneuvers=[r.maneuvers[5]];}],
])('%s still fails candidate preparation',(_,mutate)=>{
 const route=options()[0];mutate(route);expect(AI.prepareNavigationCandidate(route)).toBeNull();
});
test('captured assessment expiry is a separate rejection, not inferred browser clock evidence',()=>{
 clock.mockReturnValue((captured.routes[0].avoidance_assessment.checked_at+601)*1000);
 const diagnostics={};expect(AI.prepareNavigationCandidate(options()[0],diagnostics)).toBeNull();
 expect(diagnostics.reason).toBe('invalid_or_expired_geometry_assessment');
});
