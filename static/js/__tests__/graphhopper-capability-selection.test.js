const RS=require('../modules/navigation/route-selection.js');
const AI=require('../modules/navigation/avoidance-integrity.js');

test('route alternatives retain their own provider limitations and mandatory assessment',()=>{
    const points=[[53,-1],[53.01,-1.01]];
    const gh={id:'gh',source:'GraphHopper',geometry:points,geometry_precision:6,
        provider_limitations:[{category:'tolls',reason:'attribute_not_verified'}],
        provider_capabilities:{state:'verified',profile_available:true},
        avoidance_assessment:{status:'UNVERIFIED',checked_at:Date.now()/1000,origin_integrity:{checked_at:Date.now()/1000,status:'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE',navigation_allowed:true,transition_verified:false},requirements:[{category:'tolls',mode:'mandatory',enabled:true,status:'UNVERIFIED'}]}};
    const vh={id:'vh',source:'Valhalla',geometry:points,geometry_precision:6,
        avoidance_assessment:{status:'SATISFIED',checked_at:Date.now()/1000,origin_integrity:{checked_at:Date.now()/1000,status:'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE',navigation_allowed:true,transition_verified:false},requirements:[{category:'tolls',mode:'mandatory',enabled:true,status:'SATISFIED'}]}};
    const options=RS.buildRouteOptionsFromApiResponse({routes:[gh,vh]},()=>points);
    for(const route of options) route.avoidance_assessment.geometry_binding=AI.geometryBinding(route);
    expect(options[0].provider_limitations).toEqual(gh.provider_limitations);
    expect(options[1].provider_limitations).toBeUndefined();
    expect(AI.summary(options[0])).toContain('Toll avoidance was not applied');
    expect(AI.decision(options[0]).allowed).toBe(false);
    expect(AI.decision(options[1]).allowed).toBe(true);
});

test('best-effort preference can be reviewed without claiming enforcement',()=>{
    const route={geometry:[[53,-1],[53.01,-1.01]],provider_limitations:[{category:'tolls'}],avoidance_assessment:{status:'UNVERIFIED',checked_at:Date.now()/1000,origin_integrity:{checked_at:Date.now()/1000,status:'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE',navigation_allowed:true,transition_verified:false},requirements:[{category:'tolls',enabled:true,mode:'preference',status:'UNVERIFIED'}]}};
    route.avoidance_assessment.geometry_binding=AI.geometryBinding(route);
    expect(AI.decision(route).allowed).toBe(true);
    expect(AI.summary(route)).toContain('Toll avoidance was not applied');
});

test('switching alternatives clears the previous provider limitation in navigation payloads',()=>{
    const old={source:'GraphHopper',provider_limitations:[{category:'tolls'}],provider_capabilities:{state:'verified'}};
    const vh={id:'vh',source:'Valhalla',geometry:[[53,-1],[53.01,-1.01]],avoidance_assessment:{status:'SATISFIED'}};
    const navigation=RS.mergeNavigationRouteFromSelected(old,[vh],0);
    expect(navigation.source).toBe('Valhalla');
    expect(navigation.provider_limitations).toBeUndefined();
    expect(RS.mergeLastCalculatedRouteFromSelection(old,vh).provider_limitations).toBeUndefined();
    expect(AI.summary(navigation)).not.toContain('not applied');
});
