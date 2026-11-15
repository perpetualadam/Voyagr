const SL=require('../modules/navigation/speed-limit-widget');
test.each(['TomTom-SnapToRoads','OSM-maxspeed','road-type-default'])('provider name %s cannot promote an unverified candidate',source=>{
 const data={success:true,data:{source,speed_limit_mph:30,estimated_speed_mph:30,applicable:false,evidence_state:'UNKNOWN'}};
 expect(SL.resolveSpeedApiResponse(data)).toMatchObject({status:'UNAVAILABLE',reasonCode:'API_EVIDENCE_UNVERIFIED',limitMph:null,legalLimitMph:null});
});
test.each([null,{success:false,error:'private upstream details'}])('failed API envelope has a stable outcome without leaking errors',data=>{
 const result=SL.resolveSpeedApiResponse(data);
 expect(result).toMatchObject({reasonCode:'API_UNAVAILABLE',kind:'UNKNOWN'});
 expect(JSON.stringify(result)).not.toContain('private');
});
test.each([undefined,[],30])('malformed API payload is rejected: %j',data=>{
 expect(SL.resolveSpeedApiResponse({success:true,data})).toMatchObject({reasonCode:'API_INVALID_RESPONSE',limitMph:null});
});
test('applicable evidence keeps the legacy API usable',()=>{
 const data={success:true,data:{evidence_state:'MAPPED_POSTED',applicable:true,speed_limit_mph:30}};
 const selection=SL.resolveSpeedApiResponse(data);
 expect(selection).toMatchObject({kind:'LEGAL',limitMph:30});
 expect(SL.buildSpeedSelectionApplyPlan(selection,data.data,10)).toMatchObject({statePatch:{currentSpeedLimitMph:30}});
});
test('estimated and km/h fields cannot substitute for missing applicable mph evidence',()=>{
 expect(SL.resolveSpeedApiResponse({success:true,data:{evidence_state:'MAPPED_POSTED',applicable:true,estimated_speed_mph:30,speed_limit_kmh:48}})).toMatchObject({kind:'UNKNOWN',limitMph:null});
});
