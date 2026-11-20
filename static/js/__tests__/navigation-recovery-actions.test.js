const fs=require('fs'),path=require('path');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
let UX,life,failed,active,starting;
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();failed='inconsistent_map';active=false;starting=false;
 document.body.innerHTML='<p id="navigationStartExplanation"></p>'+template.match(/<div class="navigation-recovery-actions"[\s\S]*?<\/div>/)[0]+template.match(/<p id="navigationRecoveryFeedback"[^>]*>[\s\S]*?<\/p>/)[0]+'<button data-navigation-start>Start</button>';
 life={getNavigationFailure:()=>failed,getRouteInProgress:()=>active,getNavigationStarting:()=>starting,recoverNavigationMap:jest.fn(()=>{failed=null;return true;})};
 window.VoyagrNavigationLifecycleOrchestration=life;UX=require('../app/navigation-safety-ux');
});
afterEach(()=>{UX.reset();jest.clearAllTimers();jest.useRealTimers();delete window.VoyagrNavigationLifecycleOrchestration;delete window.VoyagrNavigationSafetyUX;});
test('production Navigation markup offers recovery and end actions outside the hidden chooser',()=>{
 UX.reset();const recover=document.getElementById('navigationRecoverMap');
 expect(recover.hidden).toBe(false);expect(recover.disabled).toBe(false);
 expect(recover.getAttribute('onclick')).toBe('VoyagrNavigationSafetyUX.recoverMap()');
 expect(document.querySelector('[data-journey-abandon]').getAttribute('onclick')).toBe('VoyagrJourneyModes.abandonJourney()');
 expect(document.querySelector('[data-journey-abandon]').closest('#journeyModeChooser')).toBeNull();
 expect(document.querySelector('[data-navigation-start]').disabled).toBe(true);
});
test('explicit verified recovery clears stale start presentation and requires recalculation',()=>{
 expect(UX.recoverMap()).toBe(true);expect(life.recoverNavigationMap).toHaveBeenCalledTimes(1);
 expect(document.getElementById('navigationRecoverMap').hidden).toBe(true);
 expect(document.querySelector('[data-navigation-start]').disabled).toBe(true);
 expect(document.getElementById('navigationStartExplanation').textContent).toContain('Calculate and select');
 expect(document.getElementById('navigationRecoveryFeedback').textContent).toContain('remains retained');
});
test.each(['rejected','exception'])('unsuccessful recovery %s preserves the stop and gives a persistent explanation',mode=>{
 life.recoverNavigationMap.mockImplementation(()=>{if(mode==='exception')throw Error('GPU unavailable');return false;});
 expect(UX.recoverMap()).toBe(false);expect(failed).toBe('inconsistent_map');
 expect(document.querySelector('[data-navigation-start]').disabled).toBe(true);
 expect(document.getElementById('navigationRecoveryFeedback').hidden).toBe(false);
 expect(document.getElementById('navigationRecoveryFeedback').textContent).toContain('has not been ended');
});
test.each(['active','starting','no failure','missing getter'])('recovery action cannot bypass %s lifecycle state',mode=>{
 if(mode==='active')active=true;if(mode==='starting')starting=true;if(mode==='no failure')failed=null;if(mode==='missing getter')delete life.getRouteInProgress;
 expect(UX.recoverMap()).toBe(false);expect(life.recoverNavigationMap).not.toHaveBeenCalled();
 expect(document.getElementById('navigationRecoveryFeedback').textContent).not.toContain('Navigation remains stopped');
});

test('real lifecycle stop exposes recovery after state cleanup, and verified recovery retains remaining intent',()=>{
 const Life=require('../app/navigation-lifecycle-orchestration');
 const reconcile=jest.fn(()=>true),clear=jest.fn(()=>true);
 Life.bind({getMap:()=>({isStyleLoaded:()=>true}),getMapLibreHelpers:()=>({reconcilePolylineLayers:reconcile}),getRouteLayer:()=>null,setRouteLayer:jest.fn(),call:{clearAllRouteLayerHandles:clear,showStatus:jest.fn()}});
 window.VoyagrNavigationSafetyUX=UX;
 window.lastCalculatedRoute={id:'old',journey_continuation:{stops:['remaining']}};
 Life.setRouteInProgress(true);Life.failNavigation('inconsistent_map');
 expect(document.getElementById('navigationRecoverMap').disabled).toBe(false);
 expect(UX.recoverMap()).toBe(true);expect(reconcile).toHaveBeenCalledTimes(1);expect(clear).toHaveBeenCalledTimes(1);
 expect(Life.getRouteInProgress()).toBe(false);expect(Life.getNavigationFailure()).toBeNull();
 expect(window.lastCalculatedRoute.journey_continuation.stops).toEqual(['remaining']);
 expect(window.lastCalculatedRoute.navigation_resume_requires_fresh_gps).toBe(true);
 expect(document.querySelector('[data-navigation-start]').disabled).toBe(true);
 delete window.lastCalculatedRoute;
});
test('a later plan presentation clears stale recovery feedback',()=>{
 UX.recoverMap();expect(document.getElementById('navigationRecoveryFeedback').hidden).toBe(false);
 UX.present({id:'new'});expect(document.getElementById('navigationRecoveryFeedback').hidden).toBe(true);
});
