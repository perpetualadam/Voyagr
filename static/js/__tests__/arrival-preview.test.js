const UI=require('../app/arrival-preview.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const Plan=require('../modules/navigation/journey-plan.js');
const capture=require('./fixtures/sheffield-doncaster-20261101.json');
let made;
function route(index=0){
    const r=JSON.parse(JSON.stringify(capture.routes[index]));const end=AI.geometryPoints(r).slice(-1)[0];
    const chosen=[end[0]+0.00015,end[1]-0.00015];
    r.avoidance_assessment.geometry_binding=AI.geometryBinding(r);
    r.endpoint_resolution={version:1,authority:'planning_evidence_only',navigation_authority:'NONE',
        geometry_binding:AI.geometryBinding(r),destination:{requested:{coordinates:chosen},routing_anchor:{coordinates:end}}};
    r.journey_context={destination:{coordinates:chosen},arrival_choice:{requested_destination:{coordinates:[53.5227681,-1.1335312]}}};
    return r;
}
beforeEach(()=>{
    made=[];document.body.innerHTML='<section id="arrivalEndpointPreview" hidden></section>';
    global.VoyagrAvoidanceIntegrity=AI;global.VoyagrJourneyPlan=Plan;
    global.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>false};
    global.maplibregl={Marker:jest.fn(function(options){
        this.element=options.element;this.setLngLat=jest.fn(()=>this);this.addTo=jest.fn(()=>this);this.remove=jest.fn();made.push(this);
    })};
});
afterEach(()=>{UI.clearMap();delete global.maplibregl;delete global.VoyagrNavigationLifecycleOrchestration;});
test('panel distinguishes chosen point, actual returned endpoint, original destination and geometric gap',()=>{
    const r=route(),before=JSON.stringify(r),decision=AI.decision(r);UI.render(r,{});
    const panel=document.getElementById('arrivalEndpointPreview');
    expect(panel.hidden).toBe(false);expect(panel.textContent).toContain('Chosen driving arrival');
    expect(panel.textContent).toContain('Returned road endpoint');expect(panel.textContent).toContain('Original destination (retained)');
    expect(panel.textContent).toContain('Straight-line gap: about '+Math.round(Plan.distance(UI.model(r).chosen,UI.model(r).road)*3.28084)+' ft');
    expect(panel.textContent).toContain('not a driving or walking distance');expect(panel.textContent).toContain('No connection across the gap has been verified');
    expect(made).toHaveLength(2);expect(made[0].setLngLat).toHaveBeenCalledWith(UI.model(r).chosen.slice().reverse());
    expect(made[1].setLngLat).toHaveBeenCalledWith(UI.model(r).road.slice().reverse());
    expect(made[0].element.getAttribute('aria-label')).toBe('Chosen arrival point');
    expect(JSON.stringify(r)).toBe(before);expect(AI.decision(r)).toEqual(decision);
});
test.each(['binding','geometry','context','anchor','authority','saved'])('invalid %s evidence clears old markers and hides panel',kind=>{
    UI.render(route(),{});const previous=made.slice(),r=route();
    if(kind==='binding')r.endpoint_resolution.geometry_binding='stale';
    if(kind==='geometry')r.geometry=null;
    if(kind==='context')r.journey_context.destination.coordinates=[0,0];
    if(kind==='anchor')r.endpoint_resolution.destination.routing_anchor.coordinates=[0,0];
    if(kind==='authority')r.endpoint_resolution.navigation_authority='FULL';
    if(kind==='saved')r.navigation_resume_requires_fresh_gps=true;
    UI.render(r,{});expect(document.getElementById('arrivalEndpointPreview').hidden).toBe(true);
    expect(made).toHaveLength(2);previous.forEach(m=>expect(m.remove).toHaveBeenCalledTimes(1));
});
test('alternative selection replaces only owned endpoint markers using that alternative geometry',()=>{
    const map={},r=route(0),second=route(1);UI.render(r,map);const previous=made.slice();UI.render(second,map);
    previous.forEach(m=>expect(m.remove).toHaveBeenCalledTimes(1));
    expect(made[3].setLngLat).toHaveBeenCalledWith(UI.model(second).road.slice().reverse());
    UI.clearMap();expect(made[3].remove).toHaveBeenCalledTimes(1);
});
test('coincident points use one combined marker without implying access is verified',()=>{
    const r=route();r.journey_context.destination.coordinates=r.endpoint_resolution.destination.routing_anchor.coordinates.slice();
    r.endpoint_resolution.destination.requested.coordinates=r.journey_context.destination.coordinates.slice();
    UI.render(r,{});expect(made).toHaveLength(1);expect(made[0].element.textContent).toBe('A/R');
    expect(document.getElementById('arrivalEndpointPreview').textContent).toContain('not a verified entrance or stopping place');
});
test('no WebGL renderer still leaves an accessible endpoint panel',()=>{
    delete global.maplibregl;UI.render(route(),{});
    expect(document.getElementById('arrivalEndpointPreview').hidden).toBe(false);expect(made).toHaveLength(0);
});
test('live navigation never mounts preview markers',()=>{
    global.VoyagrNavigationLifecycleOrchestration.getRouteInProgress=()=>true;
    UI.render(route(),{});expect(made).toHaveLength(0);
});
test('partial marker mount failure cleans up its own markers',()=>{
    global.maplibregl.Marker.mockImplementationOnce(function(){this.setLngLat=()=>this;this.addTo=()=>{throw Error('map removed');};this.remove=jest.fn();made.push(this);});
    expect(UI.showMap(route(),{})).toBe(false);expect(made[0].remove).toHaveBeenCalledTimes(1);
});

test('real comparison cleanup releases endpoint markers when route resources are cleared',()=>{
    const Compare=require('../app/route-comparison-orchestration.js');
    Compare.bind({getRouteLayer:()=>null});UI.render(route(),{});
    expect(Compare.clearComparisonRouteLayers()).toBe(true);
    made.forEach(marker=>expect(marker.remove).toHaveBeenCalledTimes(1));
});

test('endpoint rendering succeeds without creating any route or gap line resources',()=>{
    const map={addLayer(){throw Error('Unexpected line layer');},addSource(){throw Error('Unexpected line source');}};
    expect(UI.showMap(route(),map)).toBe(true);
    expect(made).toHaveLength(2);
});
