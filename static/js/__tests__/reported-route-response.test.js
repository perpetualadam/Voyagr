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
 expect(diagnostics.reason).toBe('expired_assessment');
});


test('endpoint road matching is a brief note and preserves the requested locations and assessment',()=>{
 const route=options()[0];route.journey_context={origin:{kind:'searched'},destination:{kind:'searched'}};
 const before=JSON.stringify(route);const result=AI.decision(route);
 expect(result).toMatchObject({allowed:false,acceptance:false,outcome:'REFUSED'});
 expect(result.message).toBe('Locations are matched to nearby roads.');
 expect(result.message).not.toMatch(/cannot start|recalculate|entrance|legal access/i);
 expect(JSON.stringify(route)).toBe(before);
});
test.each([[8,7],[24,0],[0,23],[2,2],[undefined,undefined],[NaN,Infinity],[-1,'23']])(
 'endpoint offsets (%p, %p) stay in route data without adding a navigation lecture',(start,end)=>{
 const route=options()[0],origin=route.avoidance_assessment.origin_integrity;
 origin.origin_displacement_m=start;origin.destination_displacement_m=end;
 const result=AI.decision(route);
 expect(result.allowed).toBe(false);expect(result.acceptance).toBe(false);
 expect(result.message).toBe('Locations are matched to nearby roads.');
 expect(origin.origin_displacement_m).toBe(start);expect(origin.destination_displacement_m).toBe(end);
});

const parkingAssessment=require('./fixtures/sheffield-unnamed-parking-assessment-20261104.json');
test('captured unnamed-parking assessment refuses endpoint relocation despite preference-only requirements',()=>{
 const route=JSON.parse(JSON.stringify(parkingAssessment)),before=JSON.stringify(route);
 const result=AI.decision(route);
 expect(result).toMatchObject({allowed:false,acceptance:false,outcome:'REFUSED'});
 expect(result.message).toBe('Locations are matched to nearby roads.');
 expect(route.avoidance_assessment.origin_integrity.origin_displacement_m).toBeGreaterThan(20);
 expect(route.avoidance_assessment.requirements.some(row=>row.enabled&&row.mode==='mandatory')).toBe(false);
 expect(AI.planningSummary(route)).toContain('No entrance reference is available');
 expect(JSON.stringify(route)).toBe(before);
 // The supplied capture omits geometry: this is not a complete route replay.
 expect(route.geometry).toBeUndefined();
});
test('captured parking context keeps the intended driving target separate from the original city',()=>{
 const route=JSON.parse(JSON.stringify(parkingAssessment));
 const intent=Plan.liveIntent(route,false,0);
 expect(intent.destination).toBe('53.5237353,-1.1307239');
 expect(intent.arrivalChoice.requested_destination.coordinates).toEqual([53.5227681,-1.1335312]);
 expect(intent.arrivalChoice.navigation_authority).toBe('NONE');
 expect(AI.decision(route).allowed).toBe(false);
});
