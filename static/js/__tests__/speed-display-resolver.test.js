const {resolveSpeedDisplay}=require('../modules/navigation/speed-limit-widget');
const legal={applicable:true,evidence_state:'MAPPED_POSTED',speed_limit_mph:50};
const mapped={applicable:false,evidence_state:'MAPPED_OBSERVATION',speed_limit_mph:20};
const route={applicable:false,evidence_state:'ROUTE_OBSERVATION',speed_limit_mph:30};
test('applicable evidence wins consistently for displayed value, label and alert state',()=>{
    const result=resolveSpeedDisplay({legalEvidence:legal,legalLimitMph:50,mappedObservation:mapped,routeObservation:route});
    expect(result).toMatchObject({kind:'LEGAL',limitMph:50,legalLimitMph:50,badge:'',observation:null});
});
test('mapped observations precede route observations without granting legal alert authority',()=>{
    expect(resolveSpeedDisplay({mappedObservation:mapped,routeObservation:route})).toMatchObject({kind:'MAPPED',limitMph:20,legalLimitMph:null,badge:'Mapped'});
});
test('an inapplicable legal candidate cannot block a valid route observation',()=>{
    expect(resolveSpeedDisplay({legalEvidence:{...legal,applicable:false},legalLimitMph:50,routeObservation:route})).toMatchObject({kind:'ROUTE',limitMph:30,legalLimitMph:null,badge:'Route'});
});
test.each([null,undefined,NaN,Infinity,0,-1,101,'30',true])('invalid mapped values fall through to the valid route: %s',value=>{
    const result=resolveSpeedDisplay({mappedObservation:{...mapped,speed_limit_mph:value},routeObservation:route});
    expect(result).toMatchObject({kind:'ROUTE',limitMph:30,legalLimitMph:null});
});
test.each([NaN,Infinity,0,-1,101,'30'])('invalid legal values are not promoted into an alert limit: %s',value=>{
    expect(resolveSpeedDisplay({legalEvidence:legal,legalLimitMph:value})).toMatchObject({kind:'UNKNOWN',limitMph:null,legalLimitMph:null});
});
test.each([
    ['mappedObservation',{...mapped,position_uncertain:true},'Mapped est.'],
    ['routeObservation',{...route,position_uncertain:true},'Route est.'],
])('uncertainty remains explicit in %s presentation',(key,observation,badge)=>{
    expect(resolveSpeedDisplay({[key]:observation})).toMatchObject({badge,legalLimitMph:null,observation});
});
test('unsupported evidence types remain unknown and retain an explanatory reason',()=>{
    const result=resolveSpeedDisplay({mappedObservation:{...mapped,evidence_state:'LEGAL_RULE_INFERRED'},routeObservation:{...route,applicable:true}});
    expect(result).toMatchObject({kind:'UNKNOWN',limitMph:null,legalLimitMph:null,badge:''});
    expect(result.reason).toContain('No usable');
});
