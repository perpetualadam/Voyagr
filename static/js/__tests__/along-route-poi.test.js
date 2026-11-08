const Orch=require('../app/poi-search-orchestration');
const POI=require('../modules/navigation/poi-search');
let route,status,calculate,oldFetch;
const row={type:'fuel',name:'Station <img src=x>',lat:53.5002,lon:-1.19,distance_m:22,distance_kind:'STRAIGHT_LINE_TO_ROUTE'};
const result=(rows=[row],type='fuel')=>({ok:true,json:async()=>({success:true,type,results:rows,source:'Overpass',search_context:{coverage:'SAMPLED_CANDIDATES_ONLY',distance_kind:'STRAIGHT_LINE_TO_ROUTE'}})});
beforeEach(()=>{
    oldFetch=global.fetch;route=[[53.5,-1.2],[53.5,-1.18]];status=jest.fn();calculate=jest.fn();
    document.body.innerHTML='<input id="start" data-lat="1"><input id="end" data-lon="2">';
    window._poiMarkers=[];delete window.map;
    Orch.bind({poiSearch:()=>POI,getRoutePolyline:()=>route,getCurrentLat:()=>null,getCurrentLon:()=>null,call:{showStatus:status,calculateRoute:calculate,formatPoiDistance:jest.fn(()=> '0.01 mi')}});
    jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{Orch.closePOIModal();global.fetch=oldFetch;jest.restoreAllMocks();delete window._poiMarkers;delete global.VoyagrLocationOrchestration;});

test('search captures the planned route without GPS and labels sampled corridor distances',async()=>{
    global.fetch=jest.fn().mockResolvedValue(result());await Orch.searchAlongRouteByType('fuel');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({route_points:route,type:'fuel',radius:1000});
    const modal=document.getElementById('poiModal');
    expect(modal.textContent).toContain('Limited search near sampled points');
    expect(modal.textContent).toContain('not driving detours');expect(modal.textContent).toContain('does not add a stop');
    expect(modal.textContent).toContain('0.01 mi');expect(modal.querySelector('img')).toBeNull();expect(calculate).not.toHaveBeenCalled();
});

test('selection plans from captured route origin, never a fabricated London position',async()=>{
    const invalidate=jest.fn();global.VoyagrLocationOrchestration={invalidateEndpointRequests:invalidate};
    global.fetch=jest.fn().mockResolvedValue(result());await Orch.searchAlongRouteByType('fuel');
    const handler=document.querySelector('#poiModal button[onclick^="selectPOI"]').getAttribute('onclick');
    Function('selectPOI',handler)(Orch.selectPOI);
    expect(document.getElementById('start').value).toBe('53.5,-1.2');expect(document.getElementById('end').value).toBe('53.5002,-1.19');
    expect(calculate).toHaveBeenCalledTimes(1);expect(invalidate).toHaveBeenCalledTimes(1);
});

test('route change while modal is open refuses the old destination selection',async()=>{
    global.fetch=jest.fn().mockResolvedValue(result());await Orch.searchAlongRouteByType('fuel');
    route=[[54,-2],[55,-2]];Orch.selectPOI(row.lat,row.lon,row.name,51.5,-.1);
    expect(calculate).not.toHaveBeenCalled();expect(document.getElementById('poiModal')).toBeNull();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('planned route changed'),'warning');
});

test('route change or newer search discards late results and aborts superseded fetch',async()=>{
    let finish;global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(result([{...row,type:'food',name:'Newest'}],'food'));
    const pending=Orch.searchAlongRouteByType('fuel');const signal=global.fetch.mock.calls[0][1].signal;
    await Orch.searchAlongRouteByType('food');finish(result());await pending;
    expect(signal.aborted).toBe(true);expect(document.getElementById('poiModal').textContent).toContain('Newest');
    expect(document.getElementById('poiModal').textContent).not.toContain('Station');
});

test('late response after a route geometry change does not mount results or markers',async()=>{
    let finish;global.fetch=jest.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=Orch.searchAlongRouteByType('fuel');route[0]=[54,-2];finish(result());await pending;
    expect(document.getElementById('poiModal')).toBeNull();expect(window._poiMarkers).toEqual([]);
});

test('sampled empty is qualified and failed acquisition clears old modal and markers',async()=>{
    const remove=jest.fn();window._poiMarkers=[{remove}];
    global.fetch=jest.fn().mockResolvedValueOnce(result([])).mockResolvedValueOnce({ok:false});
    await Orch.searchAlongRouteByType('fuel');expect(remove).toHaveBeenCalledTimes(1);
    expect(document.getElementById('poiModal').textContent).toContain('Coverage may be incomplete');
    await Orch.searchAlongRouteByType('fuel');expect(document.getElementById('poiModal')).toBeNull();expect(status.mock.calls.at(-1)[1]).toBe('error');
});

test('invalid route or response cannot acquire selectable candidates',async()=>{
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({success:true,results:[row]})});
    route=[[true,0],[53,0]];await Orch.searchAlongRouteByType('fuel');expect(global.fetch).not.toHaveBeenCalled();
    route=[[53,0],[53.1,0]];await Orch.searchAlongRouteByType('fuel');expect(document.getElementById('poiModal')).toBeNull();
    expect(calculate).not.toHaveBeenCalled();
});

test('parking along-route modal does not expose the unrelated nearby fee-filter action',async()=>{
    global.fetch=jest.fn().mockResolvedValue(result([{...row,type:'parking',fee_category:'unknown'}],'parking'));
    await Orch.searchAlongRouteByType('parking');expect(document.getElementById('poiParkingPrice')).toBeNull();
    expect(document.getElementById('poiModal').textContent).toContain('does not add a stop');
});

test('marker popup preserves route-relative meaning on unit refresh',()=>{
    document.body.innerHTML=POI.buildPoiMapMarkerPopupHtml(row,{distanceText:'0.01 mi'});
    expect(document.body.textContent).toContain('0.01 mi from route (straight-line)');
    expect(document.querySelector('[data-distance-meters]').dataset.distanceSuffix).toBe(' from route (straight-line)');
});

test('production route-geometry setter clears old along-route results and markers immediately',async()=>{
    const Lifecycle=require('../app/navigation-lifecycle-orchestration');
    global.fetch=jest.fn().mockResolvedValue(result());await Orch.searchAlongRouteByType('fuel');
    const remove=jest.fn();window._poiMarkers=[{remove}];
    route=[[54,-2],[54.1,-2]];Lifecycle.setRoutePolyline(route);
    expect(document.getElementById('poiModal')).toBeNull();expect(remove).toHaveBeenCalledTimes(1);
    expect(window._poiMarkers).toEqual([]);expect(calculate).not.toHaveBeenCalled();
});

test('new nearby search cancels a pending along-route request without stale hydration',async()=>{
    let finish;global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({ok:true,json:async()=>({success:true,results:[{...row,name:'Nearby latest'}]})});
    const pending=Orch.searchAlongRouteByType('fuel');
    Orch.bind({poiSearch:()=>POI,getRoutePolyline:()=>route,getCurrentLat:()=>53.5,getCurrentLon:()=>0,call:{showStatus:status,calculateRoute:calculate,formatPoiDistance:()=> '22 m'}});
    await Orch.quickSearch('fuel');finish(result());await pending;
    expect(document.getElementById('poiModal').textContent).toContain('Nearby latest');
    expect(document.getElementById('poiModal').textContent).not.toContain('Limited search near sampled points');
});
