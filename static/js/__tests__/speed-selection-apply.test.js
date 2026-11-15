const SL=require('../modules/navigation/speed-limit-widget');
test.each(['MAPPED_OBSERVATION','ROUTE_OBSERVATION'])('%s displays its observation while clearing previous legal state',evidence_state=>{
 const observation={evidence_state,applicable:false,speed_limit_mph:30};
 const selection=SL.resolveSpeedDisplay({mappedObservation:observation,routeObservation:observation});
 const plan=SL.buildSpeedSelectionApplyPlan(selection,null,12);
 expect(plan).toMatchObject({action:'apply',legalEvidence:null,speedObservation:observation,statePatch:{currentLimitMph:null,currentSpeedLimitMph:null},widgetUpdate:{displaySpeedMph:12,shownLimit:null}});
});
test('applicable legal evidence updates both state and displayed limit',()=>{
 const legal={evidence_state:'MAPPED_POSTED',applicable:true,speed_limit_mph:40};
 const selection=SL.resolveSpeedDisplay({legalEvidence:legal,legalLimitMph:40});
 expect(SL.buildSpeedSelectionApplyPlan(selection,legal,15)).toMatchObject({legalEvidence:legal,speedObservation:null,statePatch:{currentLimitMph:40,currentSpeedLimitMph:40},widgetUpdate:{shownLimit:40}});
});
test.each([null,{kind:'LEGAL',legalLimitMph:30},{kind:'ROUTE',observation:{evidence_state:'ROUTE_OBSERVATION',applicable:true,speed_limit_mph:30}}])('missing or invalid evidence clears stale state: %j',selection=>{
 expect(SL.buildSpeedSelectionApplyPlan(selection,null,0)).toMatchObject({legalEvidence:null,speedObservation:null,statePatch:{currentLimitMph:null,currentSpeedLimitMph:null},widgetUpdate:{shownLimit:null}});
});
