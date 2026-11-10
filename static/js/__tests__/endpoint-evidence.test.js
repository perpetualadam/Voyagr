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

function arrival(status){return {version:1,policy:'arrival-reference-correspondence-v1',authority:'planning_evidence_only',navigation_authority:'NONE',selection:'NONE',vehicle_access:'UNKNOWN',connector:'NOT_EVALUATED',status};}
test.each([
    ['NO_REFERENCE','No entrance reference is available'],
    ['AMBIGUOUS_REFERENCES','Multiple entrance references need review'],
    ['REFERENCE_OUTSIDE_DECLARED_BOUNDS','outside the declared place boundary'],
    ['UNCORROBORATED_ANCHOR','cannot be corroborated'],
    ['ANCHOR_ALIGNED_REFERENCE','vehicle access remains unverified'],
    ['DIFFERENT_ROUTING_ANCHOR','a route to that point has not been checked']
])('arrival status %s appears separately from live-navigation authority',(status,message)=>{
    const route=attach(JSON.parse(JSON.stringify(capture.routes[0])));
    route.endpoint_resolution.destination.arrival_access=arrival(status);
    const before=JSON.stringify(route);
    expect(AI.planningSummary(route)).toContain('Destination arrival:');
    expect(AI.planningSummary(route)).toContain(message);
    expect(AI.decision(route).allowed).toBe(false);
    expect(JSON.stringify(route)).toBe(before);
});
test('arrival records follow selected alternatives and ordered visits',()=>{
    const payload=JSON.parse(JSON.stringify(capture));
    payload.routes.forEach((route,i)=>{
        attach(route);
        route.endpoint_resolution.destination.arrival_access=arrival(i?'UNCORROBORATED_ANCHOR':'ANCHOR_ALIGNED_REFERENCE');
        route.endpoint_resolution.stops=[{original_index:7,arrival_access:arrival('AMBIGUOUS_REFERENCES')}];
    });
    const options=RS.buildRouteOptionsFromApiResponse(payload,codec.decodePolyline);
    const selected=RS.mergeNavigationRouteFromSelected(options[0],options,1);
    expect(AI.planningSummary(selected)).toContain('cannot be corroborated');
    expect(AI.planningSummary(selected)).toContain('Stop 1 arrival: Multiple entrance');
});
test.each([
    {version:2},{policy:'unknown'},{authority:'verified'},
    {navigation_authority:'FULL'},{selection:'ACCEPTED'},{vehicle_access:'VERIFIED'},
    {connector:'VERIFIED'},{status:'<img src=x onerror=alert(1)>'}
])('unsupported arrival claims %p are not presented as evidence',change=>{
    const route=attach(JSON.parse(JSON.stringify(capture.routes[0])));
    route.endpoint_resolution.destination.arrival_access={...arrival('ANCHOR_ALIGNED_REFERENCE'),...change};
    expect(AI.planningSummary(route)).not.toContain('Destination arrival:');
    expect(AI.decision(route).allowed).toBe(false);
});

function chooseDrivingArrival(){
    document.body.insertAdjacentHTML('beforeend','<input id="drivingArrival"><div id="autocomplete_drivingArrival"></div>');
    Geo.selectAutocompleteResult('end',53.5227681,-1.1335312,'Doncaster','searched',{...result(),name:'Doncaster'});
    Geo.displayAutocompleteResults('drivingArrival',[{lat:'53.52296',lon:'-1.13341',name:'Selected car park entrance',class:'amenity',type:'parking'}]);
    document.querySelector('#autocomplete_drivingArrival .autocomplete-item').click();
    return document.getElementById('drivingArrival');
}
test('explicit car park selection routes to the choice and retains the original city',()=>{
    const input=chooseDrivingArrival(),body={start:'53,-1',end:'53.5227681,-1.1335312'};
    const context=Plan.applyDrivingArrival(body,document.getElementById('start'),document.getElementById('end'),input);
    expect(body.end).toBe('53.52296,-1.13341');
    expect(context.destination.coordinates).toEqual([53.52296,-1.13341]);
    expect(context.arrival_choice.requested_destination).toMatchObject({label:'Doncaster',coordinates:[53.5227681,-1.1335312]});
    expect(document.getElementById('end').value).toBe('Doncaster');
    expect(input.value).toBe('Selected car park entrance');
});
test('edited, stale or unselected arrival text cannot silently change the route',()=>{
    const input=chooseDrivingArrival(),end=document.getElementById('end');
    const body={start:'53,-1',end:'53.5227681,-1.1335312'};
    end.value='Different destination';
    expect(()=>Plan.applyDrivingArrival(body,null,end,input)).toThrow(/Select the driving arrival/);
    expect(body.end).toBe('53.5227681,-1.1335312');
    end.value='Doncaster';input.value='Unselected typed entrance';
    expect(()=>Plan.applyDrivingArrival(body,null,end,input)).toThrow(/Select the driving arrival/);
    expect(()=>Plan.applyDrivingArrival({...body,round_trip:true},null,end,input)).toThrow(/round trip/);
});
test('selecting a different destination clears arrival and ordinary destination behavior returns',()=>{
    const input=chooseDrivingArrival();
    Geo.selectAutocompleteResult('end',54,-2,'Another place');
    expect(input.value).toBe('');
    const body={start:'53,-1',end:'54,-2'};
    expect(Plan.applyDrivingArrival(body,null,document.getElementById('end'),input).arrival_choice).toBeUndefined();
    expect(body.end).toBe('54,-2');
});
test('saved arrival context restores separate fields and live intent retains the chosen route target',()=>{
    const input=chooseDrivingArrival(),end=document.getElementById('end');
    const body={start:'53,-1',end:'53.5227681,-1.1335312'};
    const context=Plan.applyDrivingArrival(body,null,end,input);context.ordered_stops=[];
    const intent=Plan.liveIntent({destination:body.end,journey_context:context},false,0);
    expect(intent.destination).toBe('53.52296,-1.13341');
    expect(intent.arrivalChoice.requested_destination.coordinates).toEqual([53.5227681,-1.1335312]);
    Plan.clearArrival();end.value='Unrelated';Plan.restoreArrival(context,end,input);
    expect(end.value).toBe('Doncaster');expect(input.value).toBe('Selected car park entrance');
    const next={start:'53,-1',end:'53.5227681,-1.1335312'};
    expect(Plan.applyDrivingArrival(next,null,end,input).arrival_choice).toEqual(context.arrival_choice);
});
test('route display retains arrival limitations while allowing explicit Start',()=>{
    jest.useFakeTimers();
    const UX=require('../app/navigation-safety-ux.js');
    document.body.innerHTML='<p id="routeAvoidanceNotice"></p><p id="routePlanningNotice"></p><p id="navigationStartExplanation"></p><button data-navigation-start></button>';
    global.VoyagrAvoidanceIntegrity=AI;
    const route=attach(JSON.parse(JSON.stringify(capture.routes[0])));
    route.endpoint_resolution.arrival_choice={version:1,authority:'request_metadata_only',navigation_authority:'NONE'};
    UX.present(route);jest.advanceTimersByTime(1100);
    expect(document.getElementById('routePlanningNotice').textContent).toContain('chosen arrival point');
    expect(document.getElementById('routePlanningNotice').textContent).toContain('onward connection is not included');
    expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('limitations are informational');
    expect(document.querySelector('[data-navigation-start]').disabled).toBe(false);
    UX.reset();jest.useRealTimers();
});
test('deviation rerouting preserves the driving target even when the destination field is the city',()=>{
    const route=JSON.parse(JSON.stringify(capture.routes[0]));
    route.destination='53.52296,-1.13341';route.journey_context={destination:{kind:'searched',coordinates:[53.52296,-1.13341]},ordered_stops:[],arrival_choice:{version:1,target:[53.52296,-1.13341],requested_destination:{coordinates:[53.5227681,-1.1335312]}}};
    global.VoyagrJourneyPlan=Plan;global.lastCalculatedRoute=route;
    const body=AI.augment({is_reroute:true,start:'53,-1',end:'53.5227681,-1.1335312'},localStorage);
    expect(body.end).toBe('53.52296,-1.13341');
    expect(body.journey_context.arrival_choice.requested_destination.coordinates).toEqual([53.5227681,-1.1335312]);
    delete global.lastCalculatedRoute;
});
test('map/GPS destination changes clear the old arrival, while arrival selection retains itself',()=>{
    const previous=global.VoyagrLocationOrchestration;
    const Location=require('../app/location-orchestration.js');global.VoyagrLocationOrchestration=Location;
    try{
        const input=chooseDrivingArrival();
        expect(input.value).toBe('Selected car park entrance');
        Location.invalidateEndpointRequests('end');
        expect(input.value).toBe('');expect(input.dataset.arrivalFor).toBeUndefined();
    }finally{global.VoyagrLocationOrchestration=previous;}
});

test('generic arrival parking results favor proximity without selecting or mutating them',()=>{
    const input=chooseDrivingArrival();input.value='car park doncaster';
    const results=[{lat:'53.5026045',lon:'-1.0434077',name:'Old car park',type:'parking'},
        {lat:'53.5198586',lon:'-1.1346897',name:'Civic Quarter Car Park',type:'parking'}];
    const before=JSON.stringify(results);
    Geo.displayAutocompleteResults('drivingArrival',results);
    const items=[...document.querySelectorAll('#autocomplete_drivingArrival .autocomplete-item')];
    expect(items[0].textContent).toContain('Civic Quarter');
    expect(items[0].textContent).toContain('straight line');
    expect(items[1].textContent).toContain('Old car park');
    expect(input.value).toBe('car park doncaster');expect(JSON.stringify(results)).toBe(before);
    input.value='Old car park';Geo.displayAutocompleteResults('drivingArrival',results);
    expect(document.querySelector('#autocomplete_drivingArrival .autocomplete-item').textContent).toContain('Old car park');
});
test('older autocomplete responses cannot replace a newer arrival search',async()=>{
    jest.useFakeTimers();
    const input=chooseDrivingArrival();let release;
    const oldFetch=global.fetch;
    global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}))
        .mockResolvedValueOnce({ok:true,json:async()=>[{lat:'53.52',lon:'-1.13',name:'New search result'}]});
    try{
        input.value='old query';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        input.value='new query';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        release({ok:true,json:async()=>[{lat:'54',lon:'-2',name:'Stale search result'}]});
        await Promise.resolve();await Promise.resolve();
        const dropdown=document.getElementById('autocomplete_drivingArrival');
        expect(dropdown.textContent).toContain('New search result');expect(dropdown.textContent).not.toContain('Stale search result');
        expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});
test('search provider failure has visible retry guidance instead of a misleading empty result',async()=>{
    jest.useFakeTimers();const input=chooseDrivingArrival(),oldFetch=global.fetch;
    global.fetch=jest.fn().mockResolvedValue({ok:false,status:502});
    try{
        input.value='unavailable query';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        const text=document.getElementById('autocomplete_drivingArrival').textContent;
        expect(text).toContain('temporarily unavailable');expect(text).toContain('Try again');expect(text).not.toContain('No results');
        expect(input.dataset.lat).toBeUndefined();
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});

function scopeFixture(label='Doncaster',lat=53.5227681,lon=-1.1335312){
    const input=chooseDrivingArrival();
    Geo.selectAutocompleteResult('end',lat,lon,label,'searched',{name:label,type:'city'});
    document.body.insertAdjacentHTML('beforeend','<small id="arrivalSearchContext"></small>');
    return input;
}
function nearbyPayload(point,name='Nearby parking'){
    return {success:true,search_context:{version:1,coordinates:point,radius_m:2000,source:'overpass'},
        results:[{lat:String(point[0]),lon:String(point[1]),name,type:'parking',class:'amenity',_source:'overpass',osm_type:'way',osm_id:42}]};
}
test('bare parking search retrieves a category set around the destination, never map centre',async()=>{
    jest.useFakeTimers();const input=scopeFixture(),oldFetch=global.fetch;
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>nearbyPayload([53.5227681,-1.1335312])});
    try{
        input.value='car park';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        const [url,options]=global.fetch.mock.calls[0];
        expect(url).toBe('/api/arrival-parking-search');expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({lat:53.5227681,lon:-1.1335312});
        expect(document.getElementById('arrivalSearchContext').textContent).toContain('within 2.0 km of Doncaster');
        expect(document.getElementById('autocomplete_drivingArrival').textContent).toContain('Nearby parking');
        expect(input.value).toBe('car park');expect(input.dataset.lat).toBeUndefined();
        document.querySelector('#autocomplete_drivingArrival .autocomplete-item').click();
        expect(JSON.parse(input.dataset.journeySearchEvidence).provider).toBe('overpass');
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});
test.each(['Frenchgate car park','parking Sheffield'])('explicit search %s retains the literal query and provider ordering',async(query)=>{
    jest.useFakeTimers();const input=scopeFixture('Explicit context'),oldFetch=global.fetch;
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>[
        {lat:'53.38',lon:'-1.47',name:'Explicit named result'},
        {lat:'53.52276',lon:'-1.13353',name:'Closer but less relevant result'}]});
    try{
        input.value=query;await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        expect(global.fetch.mock.calls[0][0]).toBe('/api/geocode?q='+encodeURIComponent(query)+'&limit=8');
        expect(document.querySelector('#autocomplete_drivingArrival .autocomplete-item').textContent).toContain('Explicit named result');
        expect(document.getElementById('arrivalSearchContext').textContent).toBe('');
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});
test('identical parking text has separate caches and requests for different destinations',async()=>{
    jest.useFakeTimers();const input=scopeFixture('First cache destination',53,-1),oldFetch=global.fetch;
    global.fetch=jest.fn().mockResolvedValueOnce({ok:true,json:async()=>nearbyPayload([53,-1],'First city parking')})
        .mockResolvedValueOnce({ok:true,json:async()=>nearbyPayload([54,-2],'Second city parking')});
    try{
        input.value='parking';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        await Geo.showAutocomplete('drivingArrival',false);await jest.advanceTimersByTimeAsync(301);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        Geo.selectAutocompleteResult('end',54,-2,'Second cache destination');
        expect(document.getElementById('arrivalSearchContext').textContent).toBe('');
        input.value='parking';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({lat:54,lon:-2});
        expect(document.getElementById('autocomplete_drivingArrival').textContent).toContain('Second city parking');
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});
test('changing destination rejects a late parking response even when query text is identical',async()=>{
    jest.useFakeTimers();const input=scopeFixture('Old race destination',53,-1),oldFetch=global.fetch;let release;
    global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}))
        .mockResolvedValueOnce({ok:true,json:async()=>nearbyPayload([54,-2],'Current city parking')});
    try{
        input.value='car parks';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        Geo.selectAutocompleteResult('end',54,-2,'New race destination');input.value='car parks';
        await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        release({ok:true,json:async()=>nearbyPayload([53,-1],'Stale city parking')});
        await Promise.resolve();await Promise.resolve();
        const text=document.getElementById('autocomplete_drivingArrival').textContent;
        expect(text).toContain('Current city parking');expect(text).not.toContain('Stale city parking');
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});
test('bare parking requires a resolved destination and never guesses from map or GPS',async()=>{
    jest.useFakeTimers();const input=scopeFixture(),oldFetch=global.fetch;
    const end=document.getElementById('end');end.value='Unselected town';delete end.dataset.lat;delete end.dataset.lon;
    global.fetch=jest.fn();
    try{
        input.value='parking';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(document.getElementById('arrivalSearchContext').textContent).toContain('Select a destination first');
        expect(document.getElementById('autocomplete_drivingArrival').textContent).toContain('Select a destination');
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});
test('parking provider failure retains retry guidance and offers no invalid candidates',async()=>{
    jest.useFakeTimers();const input=scopeFixture('Failed provider destination'),oldFetch=global.fetch;
    global.fetch=jest.fn().mockResolvedValue({ok:false,status:503});
    try{
        input.value='carpark';await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        expect(document.getElementById('autocomplete_drivingArrival').textContent).toContain('temporarily unavailable');
        expect(document.querySelector('#autocomplete_drivingArrival .autocomplete-item')).toBeNull();
        expect(input.dataset.lat).toBeUndefined();
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});
test('focusing the destination keeps its selected coordinate and parking search context',async()=>{
    jest.useFakeTimers();scopeFixture('Focus destination');const end=document.getElementById('end');
    try{
        await Geo.showAutocomplete('end',false);
        expect(end.dataset.lat).toBe('53.5227681');expect(end.dataset.lon).toBe('-1.1335312');
    }finally{jest.clearAllTimers();jest.useRealTimers();}
});
test('preview names the selected arrival and retained destination independently for each alternative',()=>{
    const payload=JSON.parse(JSON.stringify(capture));
    const context=(label,point)=>({destination:{label,coordinates:point},arrival_choice:{version:1,authority:'request_metadata_only',navigation_authority:'NONE',target:point,
        requested_destination:{label:'Doncaster',coordinates:[53.5227681,-1.1335312]}}});
    payload.routes[0].journey_context=context('Civic Quarter Car Park',[53.5198586,-1.1346897]);
    payload.routes[1].journey_context=context('Other chosen arrival',[53.52,-1.14]);
    const make=index=>RS.buildRoutePreviewPanelApplyPlan({routeData:payload,selectedRouteIndex:index,startLabel:'Sheffield',endLabel:'Doncaster'});
    expect(make(0).routeLabel).toBe('Sheffield → Civic Quarter Car Park (driving arrival for Doncaster)');
    expect(make(1).routeLabel).toContain('Other chosen arrival');
    payload.routes[0].journey_context.arrival_choice.target=[0,0];
    expect(make(0).routeLabel).toBe('Sheffield → Doncaster');
    expect(AI.decision(payload.routes[0]).allowed).toBe(false);
});

test('browser preserves server shortlist ranking instead of re-sorting private parking by distance',()=>{
    const input=scopeFixture('Doncaster shortlist');input.value='parking';
    const rows=[
        {lat:'53.5198586',lon:'-1.1346897',name:'Named public parking',access_category:'general',reported_access:{access:'yes'}},
        {lat:'53.52276',lon:'-1.13353',name:'Closer private parking',access_category:'restricted',reported_access:{access:'private'}}];
    Geo.displayAutocompleteResults('drivingArrival',rows);
    const items=[...document.querySelectorAll('#autocomplete_drivingArrival .autocomplete-item')];
    expect(items[0].textContent).toContain('Named public parking');
    expect(items[1].textContent).toContain('Closer private parking');
    expect(items[0].textContent).toContain('not verified');
    expect(items[1].textContent).toContain('check permission');
    expect(input.value).toBe('parking');
});
test('customer, unknown, vehicle, conditional and opening restrictions stay explicit and unverified',()=>{
    scopeFixture('Restriction labels');
    const base={lat:'53.52',lon:'-1.13'};
    Geo.displayAutocompleteResults('drivingArrival',[
        {...base,name:'Customer parking',access_category:'customers',reported_access:{access:'customers'},opening_hours:'Mo-Sa 08:00-17:00'},
        {...base,name:'Unknown parking',access_category:'unknown'},
        {...base,name:'Restricted parking',access_category:'restricted',reported_access:{access:'yes',motor_vehicle:'no'}},
        {...base,name:'Conditional parking',access_category:'unknown',has_conditional_access:true,reported_access:{'access:conditional':'no @ (Mo-Fr)'}},
        {...base,name:'Conflicting parking',access_category:'unknown',has_conflicting_access:true,reported_access:{access:'private',motorcar:'yes'}}]);
    const text=[...document.querySelectorAll('#autocomplete_drivingArrival .autocomplete-item')].map(item=>item.textContent);
    expect(text[0]).toContain('Customers only');expect(text[0]).toContain('check eligibility');
    expect(text[0]).toContain('current opening is not checked');
    expect(text[1]).toContain('Vehicle access unknown');expect(text[2]).toContain('motor_vehicle: no');
    expect(text[3]).toContain('Conditional restrictions reported; not evaluated');
    expect(text[4]).toContain('Conflicting access reports need review');
    expect(text.every(row=>row.includes('not verified'))).toBe(true);
});

test('unnamed mapped-point label survives selection, request context and preview',()=>{
    const input=scopeFixture(),end=document.getElementById('end');
    const label='Unnamed parking — map point 53.521983, -1.131094';
    Geo.displayAutocompleteResults('drivingArrival',[{name:'Unnamed parking',location_label:label,lat:'53.5219825',lon:'-1.1310942',type:'parking',_source:'overpass',osm_type:'way',osm_id:9}]);
    const item=document.querySelector('#autocomplete_drivingArrival .autocomplete-item');
    expect(item.querySelector('.autocomplete-item-name').textContent).toBe(label);
    expect(item.querySelector('.autocomplete-item-text .autocomplete-arrival-details')).not.toBeNull();
    item.click();expect(input.value).toBe(label);
    const body={start:'53,-1',end:'53.5227681,-1.1335312'};
    const context=Plan.applyDrivingArrival(body,null,end,input);
    context.arrival_choice.authority='request_metadata_only';context.arrival_choice.navigation_authority='NONE';
    const route={journey_context:context};
    const panel=RS.buildRoutePreviewPanelApplyPlan({routeData:route,startLabel:'Sheffield',endLabel:'Doncaster'});
    expect(panel.routeLabel).toContain(label);expect(panel.routeLabel).toContain('driving arrival for Doncaster');
    expect(context.destination.coordinates).toEqual([53.5219825,-1.1310942]);
    expect(context.arrival_choice.requested_destination.coordinates).toEqual([53.5227681,-1.1335312]);
});
test('provider labels and addresses render as text rather than injected HTML',()=>{
    scopeFixture();
    const malicious='<img src=x onerror=alert(1)>';
    Geo.displayAutocompleteResults('drivingArrival',[{name:malicious,location_label:malicious,display_name:malicious,lat:'53.52',lon:'-1.13',type:'parking'}]);
    const item=document.querySelector('#autocomplete_drivingArrival .autocomplete-item');
    expect(item.textContent).toContain(malicious);expect(item.querySelector('img')).toBeNull();
});
test('preference panel uses the selected assessment and provider limitations without claiming application',()=>{
    const payload=JSON.parse(JSON.stringify(capture));
    payload.routes[0].provider_limitations=[{category:'tolls'}];
    payload.routes[1].provider_limitations=[];
    payload.routes[1].avoidance_assessment={status:'UNVERIFIED',requirements:[]};
    const make=index=>RS.buildRoutePreviewPanelApplyPlan({routeData:payload,selectedRouteIndex:index,preferencesApplied:true});
    expect(make(0).hazardPlan.title).toBe('⚠ Provider preferences limited');
    expect(make(1).hazardPlan.title).toBe('⚠ Route preferences need review');
    expect(make(0).hazardPlan.title).not.toContain('applied');
    expect(make(0).hazardPlan.countLabel).toBe('Nearby observations:');
    expect(AI.decision(payload.routes[0]).allowed).toBe(false);
    const neutral=RS.getHazardPreviewPanelState({preferencesApplied:true,camerasNearRoute:0,assessment:{status:'SATISFIED'}});
    expect(neutral.title).toBe('Route preference assessment');expect(neutral.title).not.toMatch(/✓|applied/);
    expect(neutral.background).toBe('#FFF3E0');
});

function intentControl(mode='place'){
    const select=document.createElement('select');select.id='arrivalIntent';
    for(const value of ['place','roadside','vehicle_entrance']){const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);}
    select.value=mode;document.body.appendChild(select);return select;
}
test.each(['roadside','vehicle_entrance'])('arrival intent %s targets the actual choice and restores with the saved plan',mode=>{
    const input=chooseDrivingArrival(),end=document.getElementById('end'),select=intentControl(mode);
    const body={start:'53,-1',end:'53.5227681,-1.1335312'};
    const context=Plan.applyDrivingArrival(body,null,end,input);
    expect(context.arrival_intent).toEqual({version:1,mode,target:[53.52296,-1.13341]});
    Plan.restoreArrival(context,end,input);expect(select.value).toBe(mode);
    expect(end.value).toBe('Doncaster');expect(input.value).toBe('Selected car park entrance');
    expect(()=>Plan.liveIntent({journey_context:{...context,ordered_stops:[]}},false,0)).toThrow(/preview only/);
});
test('arrival intent without a separate choice binds to the original routed target',()=>{
    intentControl('roadside');
    const body={start:'53,-1',end:'54,-2'};
    expect(Plan.applyDrivingArrival(body,null,document.getElementById('end'),null).arrival_intent.target).toEqual([54,-2]);
    expect(()=>Plan.applyDrivingArrival({...body,round_trip:true},null,document.getElementById('end'),null)).toThrow(/round trip/);
    Plan.clearArrival();expect(document.getElementById('arrivalIntent').value).toBe('place');
});
test('unsupported saved intent requires a fresh explicit selection',()=>{
    const select=intentControl();
    Plan.restoreArrival({arrival_intent:{version:2,mode:'future_mode'}},null,null);
    expect(select.value).toBe('unsupported');
    expect(()=>Plan.requestContext({start:'53,-1',end:'54,-2'},null,null)).toThrow(/supported arrival intent/);
});
test.each(['roadside','vehicle_entrance'])('a declared %s intent can be inspected but cannot bypass the live gate',mode=>{
    const route=attach(JSON.parse(JSON.stringify(capture.routes[0])));
    route.journey_context={arrival_intent:{version:1,mode,target:[53.52,-1.13]}};
    route.endpoint_resolution.destination.requested={coordinates:[53.52,-1.13]};
    route.endpoint_resolution.arrival_policy={version:1,policy:'planning-arrival-intent-v1',mode,target:[53.52,-1.13],
        geometry_binding:route.avoidance_assessment.geometry_binding,authority:'planning_evidence_only',navigation_authority:'NONE'};
    expect(AI.planningSummary(route)).toContain(mode==='roadside'?'Roadside arrival intent':'Vehicle-entrance intent');
    expect(AI.decision(route)).toMatchObject({allowed:false,acceptance:false});
    expect(AI.decision(route).message).toContain('preview only');
    expect(Plan.inspection(route,AI).points.length).toBeGreaterThan(0);
    route.endpoint_resolution.arrival_policy.navigation_authority='FULL';
    expect(AI.planningSummary(route)).not.toContain(mode==='roadside'?'Roadside arrival intent:':'Vehicle-entrance intent:');
    expect(AI.decision(route).allowed).toBe(false);
});

test('arrival intent response compatibility rejects silent custom-intent downgrades per alternative',()=>{
    const intent={version:1,mode:'roadside',target:[54,-2]};
    const record=()=>({journey_context:{arrival_intent:{...intent,status:'DECLARED'}}});
    expect(Plan.responseArrivalIntentMatches(intent,{})).toBe(false);
    expect(Plan.responseArrivalIntentMatches(intent,{...record(),routes:[record()]})).toBe(true);
    expect(Plan.responseArrivalIntentMatches(intent,{...record(),routes:[{}]})).toBe(false);
    const stale=record();stale.journey_context.arrival_intent.target=[55,-2];
    expect(Plan.responseArrivalIntentMatches(intent,stale)).toBe(false);
    expect(Plan.responseArrivalIntentMatches({...intent,mode:'place'},{})).toBe(true);
    expect(Plan.responseArrivalIntentMatches(undefined,{})).toBe(true);
});

test('reported fee categories and restrictions render as text in arrival results',()=>{
    scopeFixture();Geo.displayAutocompleteResults('drivingArrival',[
        {name:'Reported free',lat:'53.52',lon:'-1.13',fee_category:'free',reported_fee:{maxstay:'2 hours',fee:'no'},access_category:'customers'},
        {name:'No fee data',lat:'53.52',lon:'-1.13'},
        {name:'Conditional',lat:'53.52',lon:'-1.13',fee_category:'conditional',reported_fee:{'fee:conditional':'<img src=x onerror=alert(1)>'}}
    ]);
    const items=document.querySelectorAll('.autocomplete-item');
    expect(items[0].textContent).toContain('Reported free — check signs and eligibility');
    expect(items[0].textContent).toContain('Customers only');expect(items[0].textContent).toContain('2 hours');
    expect(items[1].textContent).toContain('Fee unknown');expect(items[2].textContent).toContain('Conditional fee');
    expect(items[2].querySelector('img')).toBeNull();
});
test('changing free filter changes request/cache ownership and rejects downgraded fee responses',async()=>{
    jest.useFakeTimers();const input=scopeFixture('Fee filter destination'),oldFetch=global.fetch;
    document.body.insertAdjacentHTML('beforeend','<select id="arrivalParkingPrice"><option value="any">Any</option><option value="free">Free</option><option value="paid">Paid</option></select>');
    const select=document.getElementById('arrivalParkingPrice');
    global.fetch=jest.fn(async(_url,options)=>{
        const body=JSON.parse(options.body),payload=nearbyPayload([53.5227681,-1.1335312]);
        payload.search_context.price_pref=body.price_pref;
        payload.results[0].fee_category=body.price_pref==='free'?'free':'paid';return {ok:true,json:async()=>payload};
    });
    try{
        select.value='free';await Geo.searchArrivalParking();await jest.advanceTimersByTimeAsync(301);
        expect(JSON.parse(global.fetch.mock.calls[0][1].body).price_pref).toBe('free');
        expect(document.querySelector('.autocomplete-item').textContent).toContain('Reported free');
        select.value='paid';await Geo.searchArrivalParking();await jest.advanceTimersByTimeAsync(301);
        expect(global.fetch).toHaveBeenCalledTimes(2);expect(document.querySelector('.autocomplete-item').textContent).toContain('Reported paid');
        select.value='free';input.value='free parking';
        global.fetch.mockResolvedValueOnce({ok:true,json:async()=>nearbyPayload([53.5227681,-1.1335312])});
        await Geo.showAutocomplete('drivingArrival',true);await jest.advanceTimersByTimeAsync(301);
        expect(document.querySelector('.autocomplete-item')).toBeNull();
        expect(document.getElementById('autocomplete_drivingArrival').textContent).toContain('temporarily unavailable');
    }finally{global.fetch=oldFetch;jest.useRealTimers();}
});

test('parking list reports fees and customer limits without injecting provider markup',()=>{
    const Parking=require('../modules/navigation/multimodal-parking.js');
    const html=Parking.buildParkingOptionItemHtml({name:'<img src=x onerror=alert(1)>',distance_m:100,
        fee_label:'Reported free — check signs and eligibility',access_category:'customers',reported_fee:{maxstay:'2 hours'}},0,{distanceText:'100',distUnit:'m'});
    const panel=document.createElement('div');panel.innerHTML=html;
    expect(panel.querySelector('img')).toBeNull();expect(panel.textContent).toContain('Reported free');
    expect(panel.textContent).toContain('Customers only');expect(panel.textContent).toContain('2 hours');
});
