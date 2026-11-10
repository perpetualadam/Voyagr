const AI=require('../modules/navigation/avoidance-integrity.js');
const Plan=require('../modules/navigation/journey-plan.js');
const capture=require('./fixtures/sheffield-doncaster-20261101.json');
const channels=['instruction','verbal_pre_transition_instruction','verbal_transition_alert_instruction','verbal_post_transition_instruction'];
const epoch=capture.routes[0].avoidance_assessment.checked_at+2;
const fresh=()=>JSON.parse(JSON.stringify(capture.routes[0]));
let clock;
beforeEach(()=>{clock=jest.spyOn(Date,'now').mockReturnValue(epoch*1000);});
afterEach(()=>clock.mockRestore());

test.each(channels)('meaningful %s cannot be silently classified or filtered',channel=>{
 const route=fresh(),step=route.maneuvers[5];step[channel]='Turn left at the junction';
 expect(AI.maneuverInstructionState(step)).toBe('spoken');expect(AI.isEdgeMetadataManeuver(step)).toBe(false);
 if(channel==='instruction'){
  const prepared=AI.prepareNavigationCandidate(route);expect(prepared).not.toBeNull();
  expect(Plan.inspection(prepared,AI).steps.some(s=>s.instruction==='Turn left at the junction')).toBe(true);
 }else{
  expect(AI.prepareNavigationCandidate(route)).toBeNull();expect(()=>Plan.inspection(route,AI)).toThrow(/Maneuver/);
 }
});
test.each(channels.flatMap(channel=>['missing','empty','whitespace'].map(kind=>[channel,kind])))('%s %s remains silent only with valid edge metadata',(channel,kind)=>{
 const route=fresh(),step=route.maneuvers[5];
 if(kind==='missing')delete step[channel];else step[channel]=kind==='empty'?'':' \t\n ';
 expect(AI.maneuverInstructionState(step)).toBe('silent');expect(AI.isEdgeMetadataManeuver(step)).toBe(true);
 expect(AI.prepareNavigationCandidate(route)).not.toBeNull();expect(()=>Plan.inspection(route,AI)).not.toThrow();
});
test.each(channels.flatMap(channel=>[null,0,false,[],{}].map(value=>[channel,value])))('%s malformed type %p rejects candidate and inspection',(channel,value)=>{
 const route=fresh();route.maneuvers[5][channel]=value;
 expect(AI.maneuverInstructionState(route.maneuvers[5])).toBe('invalid');expect(AI.isEdgeMetadataManeuver(route.maneuvers[5])).toBe(false);
 expect(AI.prepareNavigationCandidate(route)).toBeNull();expect(()=>Plan.inspection(route,AI)).toThrow(/Maneuver/);
});
test.each(channels.slice(1))('valid ordinary directions with %s remain in original order',channel=>{
 const route=fresh();route.maneuvers[0][channel]='Continue toward the next junction';
 const prepared=AI.prepareNavigationCandidate(route);expect(prepared).not.toBeNull();
 const inspected=Plan.inspection(prepared,AI);expect(inspected.steps[0][channel]).toBe('Continue toward the next junction');
 expect(inspected.steps.map(s=>s.instruction)).toEqual(route.maneuvers.filter(s=>s.instruction.trim()).map(s=>s.instruction));
});
test('all 18 captured metadata updates survive preparation and only they are omitted from simulation instructions',()=>{
 const route=fresh(),before=JSON.stringify(route),metadata=route.maneuvers.filter(AI.isEdgeMetadataManeuver);
 expect(metadata).toHaveLength(18);const candidate=AI.prepareNavigationCandidate(route);
 expect(candidate.maneuvers).toEqual(route.maneuvers);expect(AI.geometryBinding(candidate)).toBe('7b82209c');
 const inspected=Plan.inspection(candidate,AI);expect(inspected.steps).toHaveLength(48);
 const positions=[0,.25,.5,.75,1].map(f=>Plan.position(inspected,inspected.total*f));
 expect(positions.every(p=>p.instruction.trim())).toBe(true);expect(positions.at(-1).remaining_m).toBe(0);
 expect(positions.map(p=>p.index)).toEqual([...positions.map(p=>p.index)].sort((a,b)=>a-b));
 expect(JSON.stringify(route)).toBe(before);expect(AI.decision(candidate).allowed).toBe(false);
});
test.each([
 ['missing',r=>{delete r.avoidance_assessment;},'missing_assessment'],
 ['null',r=>{r.avoidance_assessment=null;},'missing_assessment'],
 ['geometry false',r=>{r.avoidance_assessment.geometry_valid=false;},'invalid_geometry_validity'],
 ['geometry missing',r=>{delete r.avoidance_assessment.geometry_valid;},'invalid_geometry_validity'],
 ['geometry string',r=>{r.avoidance_assessment.geometry_valid='true';},'invalid_geometry_validity'],
 ['timestamp missing',r=>{delete r.avoidance_assessment.checked_at;},'invalid_assessment_timestamp'],
 ['timestamp null',r=>{r.avoidance_assessment.checked_at=null;},'invalid_assessment_timestamp'],
 ['timestamp NaN',r=>{r.avoidance_assessment.checked_at=NaN;},'invalid_assessment_timestamp'],
 ['timestamp Infinity',r=>{r.avoidance_assessment.checked_at=Infinity;},'invalid_assessment_timestamp'],
 ['timestamp string',r=>{r.avoidance_assessment.checked_at=String(epoch);},'invalid_assessment_timestamp'],
 ['expired',r=>{r.avoidance_assessment.checked_at=epoch-600.001;},'expired_assessment'],
 ['future',r=>{r.avoidance_assessment.checked_at=epoch+.001;},'future_assessment'],
])('bounded diagnostic for %s assessment',(_,mutate,reason)=>{
 const route=fresh(),diagnostics={};mutate(route);expect(AI.prepareNavigationCandidate(route,diagnostics)).toBeNull();
 expect(diagnostics).toEqual({reason});expect(JSON.stringify(diagnostics)).not.toContain('53.');
});
test.each([0,599.999,600])('assessment age %p seconds remains within the unchanged freshness bound',age=>{
 const route=fresh();route.avoidance_assessment.checked_at=epoch-age;
 expect(AI.prepareNavigationCandidate(route)).not.toBeNull();expect(AI.decision(route).allowed).toBe(false);
});


test.each([.001,60,3600,-601])('planning accepts clock offset %p while strict navigation still refuses it',offset=>{
 const route=fresh(),before=JSON.stringify(route);route.avoidance_assessment.checked_at=epoch+offset;const original=JSON.stringify(route);
 expect(AI.preparePlanningCandidate(route).polyline).toEqual(AI.geometryPoints(route));expect(JSON.stringify(route)).toBe(original);expect(AI.prepareNavigationCandidate(route)).toBeNull();expect(before).not.toBe(original);
});
test.each([
 ['geometry binding',r=>{r.avoidance_assessment.geometry_binding='deadbeef';}],
 ['geometry',r=>{r.geometry='?';}],
 ['instructions',r=>{r.maneuvers=[];}],
 ['assessment',r=>{delete r.avoidance_assessment;}],
 ['timestamp',r=>{r.avoidance_assessment.checked_at=Infinity;}],
 ['zero timestamp',r=>{r.avoidance_assessment.checked_at=0;}],
])('planning still rejects malformed %s without relying on the browser clock',(_label,mutate)=>{
 const route=fresh();mutate(route);expect(AI.preparePlanningCandidate(route)).toBeNull();
});
