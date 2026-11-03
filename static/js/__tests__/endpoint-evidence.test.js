const Plan=require('../modules/navigation/journey-plan.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const RS=require('../modules/navigation/route-selection.js');
const codec=require('../modules/navigation/polyline-codec.js');
const Geo=require('../app/geocoding-orchestration.js');
const Search=require('../modules/navigation/search-autocomplete.js');
const capture=require('./fixtures/sheffield-doncaster-20261101.json');
let clock;
beforeEach(()=>{
    clock=jest.spyOn(Date,'now').mockReturnValue((capture.routes[0].avoidance_assessment.checked_at+1)*1000);
    document.body.innerHTML='<input id="start"><input id="end"><div id="autocompleteStart"></div><div id="autocompleteEnd"></div>';
    window.VoyagrJourneyPlan=Plan;
    Geo.bind({searchAutocomplete:()=>Search,call:{showStatus:jest.fn(),recordRecentDestination:jest.fn()}});
    jest.spyOn(console,'log').mockImplementation(()=>{});
});
afterEach(()=>{clock.mockRestore();jest.restoreAllMocks();});
function result(){return {lat:'53.3806626',lon:'-1.4702278',name:'Sheffield',type:'city',class:'place',osm_type:'relation',osm_id:123,boundingbox:['53','54','-2','0']};}
function attach(route,disposition='ROAD_SNAPPED'){
    route.endpoint_resolution={version:1,authority:'planning_evidence_only',navigation_authority:'NONE',geometry_binding:route.avoidance_assessment.geometry_binding,planning_disposition:disposition,
        origin:{offset_m:23.651},destination:{offset_m:22.793}};
    return route;
}
test('actual autocomplete selection carries coordinate-bound search metadata into request context',()=>{
    Geo.displayAutocompleteResults('start',[result()]);
    document.querySelector('#autocompleteStart .autocomplete-item').click();
    const context=Plan.requestContext({start:'53.3806626,-1.4702278',end:'53.5227681,-1.1335312'},document.getElementById('start'),document.getElementById('end'));
    expect(context.origin.search_evidence).toMatchObject({version:1,semantic_class:'locality',provider:'nominatim',provider_ref:'relation:123',bounds:[53,-2,54,0]});
    expect(context.origin.search_evidence.coordinates).toEqual(context.origin.coordinates);
});
test('changing coordinates or choosing a saved result cannot reuse stale geocoder evidence',()=>{
    const input=document.getElementById('start');input.dataset.journeySource='searched';input.dataset.journeySearchEvidence=JSON.stringify(Plan.searchEvidence(result(),53.3806626,-1.4702278));
    expect(Plan.endpoint(input,'54,-2').search_evidence).toBeUndefined();
    Geo.selectAutocompleteResult('start',53.3806626,-1.4702278,'Saved point','saved');
    expect(input.dataset.journeySearchEvidence).toBeUndefined();
});
test('search metadata preserves available entrances without replacing the chosen point',()=>{
    const evidence=Plan.searchEvidence({_source:'tomtom',type:'poi',id:'poi-reference',entry_points:[{lat:53.1,lon:-1.1,type:'main'}]},53,-1);
    expect(evidence.coordinates).toEqual([53,-1]);
    expect(evidence.entry_points).toEqual([{coordinates:[53.1,-1.1],type:'main'}]);
    expect(evidence.semantic_class).toBe('poi');
});
test.each([null,[],['bad'],['',54,-2,0]])('malformed search bounds %p are not forwarded',box=>{
    expect(Plan.searchEvidence({...result(),boundingbox:box},53,-1).bounds).toBeUndefined();
});
test('route normalization, selected-route merging and fallback retain independent evidence',()=>{
    const payload=JSON.parse(JSON.stringify(capture));
    payload.routes.forEach((r,i)=>attach(r,i?'REVIEW_REQUIRED':'ROAD_SNAPPED'));
    const options=RS.buildRouteOptionsFromApiResponse(payload,codec.decodePolyline);
    expect(options[0].endpoint_resolution).toEqual(payload.routes[0].endpoint_resolution);
    expect(options[1].endpoint_resolution).toEqual(payload.routes[1].endpoint_resolution);
    const selected=RS.mergeNavigationRouteFromSelected(options[0],options,1);
    expect(selected.endpoint_resolution).toEqual(options[1].endpoint_resolution);
    const fallback=RS.buildRouteOptionsFromApiResponse({...payload.routes[0],success:true},codec.decodePolyline,options[0].polyline)[0];
    expect(fallback.endpoint_resolution).toEqual(options[0].endpoint_resolution);
});
test('planning summary explains ordinary snapping but never grants live navigation',()=>{
    const route=attach(JSON.parse(JSON.stringify(capture.routes[0])));
    const before=JSON.stringify(route),summary=AI.summary(route);
    expect(summary).toContain('Road-snapped planning endpoints');expect(summary).toContain('Start offset: about 24 m');
    expect(summary).toContain('Destination offset: about 23 m');expect(summary).toContain('road access remains unverified');
    expect(AI.decision(route).allowed).toBe(false);expect(JSON.stringify(route)).toBe(before);
    route.endpoint_resolution.navigation_authority='FULL';
    expect(AI.planningSummary(route)).toBe('');expect(AI.decision(route).allowed).toBe(false);
});
test('stale bindings and unknown record versions cannot present planning evidence',()=>{
    const route=attach(JSON.parse(JSON.stringify(capture.routes[0])));
    route.endpoint_resolution.geometry_binding='bad';expect(AI.planningSummary(route)).toBe('');
    route.endpoint_resolution.geometry_binding=route.avoidance_assessment.geometry_binding;
    route.endpoint_resolution.version=2;expect(AI.planningSummary(route)).toBe('');
});
