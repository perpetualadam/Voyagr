const {install}=require('../../../scripts/browser/planning-commit-diagnostic.cjs');
const AI=require('../modules/navigation/avoidance-integrity.js');
const Plan=require('../modules/navigation/journey-plan.js');
const RS=require('../modules/navigation/route-selection.js');
const Codec=require('../modules/navigation/polyline-codec.js');
const fixture=require('./fixtures/sheffield-doncaster-20261101.json');
let Modes,candidate,ready,operations,previous,originalReady;
beforeEach(()=>{
 jest.spyOn(Date,'now').mockReturnValue((fixture.routes[0].avoidance_assessment.checked_at+1)*1000);
 document.body.innerHTML='<div id="status"></div><div id="journeyModeStatus"></div>';
 global.VoyagrAvoidanceIntegrity=AI;global.VoyagrJourneyPlan=Plan;
 jest.isolateModules(()=>{Modes=require('../app/journey-modes.js');});global.VoyagrJourneyModes=Modes;
 ready=false;global.map={isStyleLoaded:()=>ready};originalReady=global.map.isStyleLoaded;
 previous={private:'previous-journey'};window.lastCalculatedRoute=previous;
 candidate=AI.prepareNavigationCandidate(RS.buildRouteOptionsFromApiResponse(JSON.parse(JSON.stringify(fixture)),Codec.decodePolyline)[0]);
 Modes.bind({selected:()=>null,isLive:()=>false,showStatus:m=>document.getElementById('journeyModeStatus').textContent=m});
 operations={requestCurrent:()=>true,stage(){if(!global.map.isStyleLoaded())throw Error('Map not ready; current journey retained.');return {};},publish(){window.lastCalculatedRoute=candidate;},verify:()=>true,removePrevious(){},restore(){window.lastCalculatedRoute=previous;},cleanup:()=>true,present(){}};
 install();
});
afterEach(()=>{window.__voyagrPlanningCommitProbe?.dispose();delete global.map;delete global.VoyagrJourneyModes;delete global.VoyagrJourneyPlan;delete window.lastCalculatedRoute;jest.restoreAllMocks();});
const report=()=>window.__voyagrPlanningCommitProbe.report().attempts[0];
const seen=(row,op,outcome,detail)=>row.events.some(e=>e.operation===op&&e.outcome===outcome&&(detail===undefined||e.detail===detail));
test('records the actual false staging style check even when the final map becomes ready',async()=>{
 expect(await Modes.commitPlanning(Modes.captureIntent(),candidate,operations)).toBe(false);ready=true;
 const row=report();expect(row.outcome).toBe('false');expect(row.entry_intent_current).toBe(true);expect(row.entry_commit_pending).toBe(false);
 expect(seen(row,'stage','style_check_returned','false')).toBe(true);expect(seen(row,'stage','threw','map_not_ready')).toBe(true);expect(row.warning_class).toBe('map_not_ready');expect(global.map.isStyleLoaded()).toBe(true);expect(global.map.isStyleLoaded).toBe(originalReady);expect(window.lastCalculatedRoute).toBe(previous);
});
test.each(['publish','removePrevious'])('%s exception is identified and actual rollback retains the prior context',async name=>{
 ready=true;operations[name]=()=>{throw Error('private-coordinate-and-token-sentinel');};
 expect(await Modes.commitPlanning(Modes.captureIntent(),candidate,operations)).toBe(false);const row=report();
 expect(seen(row,name,'threw')).toBe(true);expect(seen(row,'restore','returned')).toBe(true);expect(seen(row,'cleanup','returned','true')).toBe(true);expect(window.lastCalculatedRoute).toBe(previous);expect(JSON.stringify(row)).not.toContain('private-coordinate-and-token-sentinel');expect(JSON.stringify(row)).not.toContain('53.3806626');
});
test('false verify result is distinct from a thrown stage and triggers actual restoration',async()=>{
 ready=true;operations.verify=()=>false;expect(await Modes.commitPlanning(Modes.captureIntent(),candidate,operations)).toBe(false);
 const row=report();expect(seen(row,'verify','returned','false')).toBe(true);expect(row.warning_class).toBe('publish_verification_failed');expect(window.lastCalculatedRoute).toBe(previous);
});
test('caught presentation failure is recorded without changing the successful commit verdict',async()=>{
 ready=true;operations.present=()=>{throw Error('private display error');};expect(await Modes.commitPlanning(Modes.captureIntent(),candidate,operations)).toBe(true);
 const row=report();expect(row.outcome).toBe('true');expect(seen(row,'present','threw')).toBe(true);expect(AI.decision(window.lastCalculatedRoute).allowed).toBe(false);
});
test('early stale intent returns false before invoking any operation or style check',async()=>{
 expect(await Modes.commitPlanning(-1,candidate,operations)).toBe(false);const row=report();expect(row.entry_intent_current).toBe(false);expect(row.events).toEqual([]);
});
test('expired candidate remains rejected before map staging',async()=>{
 candidate.avoidance_assessment.checked_at-=601;expect(await Modes.commitPlanning(Modes.captureIntent(),candidate,operations)).toBe(false);
 const row=report();expect(seen(row,'candidate_revalidation','returned','empty')).toBe(true);expect(row.events.some(e=>e.operation==='stage')).toBe(false);expect(row.warning_class).toBe('candidate_revalidation_failed');
});
test('disposal restores exported functions and temporary revalidation hooks leave no changed implementation',async()=>{
 const rawPrepare=AI.prepareNavigationCandidate,rawInspection=Plan.inspection;ready=true;await Modes.commitPlanning(Modes.captureIntent(),candidate,operations);
 expect(AI.prepareNavigationCandidate).toBe(rawPrepare);expect(Plan.inspection).toBe(rawInspection);const wrapped=Modes.commitPlanning;window.__voyagrPlanningCommitProbe.dispose();expect(Modes.commitPlanning).not.toBe(wrapped);expect(global.map.isStyleLoaded).toBe(originalReady);expect(window.__voyagrPlanningCommitProbe).toBeUndefined();
});
test('requestCurrent=false is observed before staging, without inferring map failure',async()=>{
 operations.requestCurrent=()=>false;expect(await Modes.commitPlanning(Modes.captureIntent(),candidate,operations)).toBe(false);
 const row=report();expect(seen(row,'requestCurrent','returned','false')).toBe(true);expect(row.events.some(e=>e.operation==='stage')).toBe(false);expect(row.warning_class).toBe('intent_changed_or_cancelled');
});
test('observer returns the exact coordinator Promise, including a failed result',async()=>{
 window.__voyagrPlanningCommitProbe.dispose();const coordinator=Modes.commitPlanning;let actual;
 Modes.commitPlanning=function(){actual=coordinator.apply(this,arguments);return actual;};install();
 const observed=Modes.commitPlanning(Modes.captureIntent(),candidate,operations);expect(observed).toBe(actual);expect(await observed).toBe(false);
});
