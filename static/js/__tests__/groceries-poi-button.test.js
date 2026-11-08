const Orch=require('../app/poi-search-orchestration.js');
const POI=require('../modules/navigation/poi-search.js');
let status,calculate,oldFetch,runtime;
const item={name:'Groceries <img src=x>',type:'groceries',shop_kind:'convenience',lat:53.5,lon:-1.2,distance_m:100,operator:'Operator <script>',opening_hours:'24/7'};
beforeEach(()=>{
    oldFetch=global.fetch;status=jest.fn();calculate=jest.fn();
    document.body.innerHTML='<input id="start" data-lat="1" data-journey-original-source="gps"><input id="end" data-lon="2">';
    runtime={poiSearch:()=>POI,getCurrentLat:()=>53.5,getCurrentLon:()=>0,s:jest.fn(),call:{showStatus:status,calculateRoute:calculate,formatPoiDistance:jest.fn(()=> '0.1 mi')}};
    Orch.bind(runtime);
    jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{global.fetch=oldFetch;delete global.VoyagrLocationOrchestration;jest.restoreAllMocks();});
function result(rows){return {ok:true,json:async()=>({success:true,source:'Overpass',results:rows})};}
test('Groceries button sends category, accepts zero longitude and delegates distance formatting',async()=>{
    global.fetch=jest.fn().mockResolvedValue(result([item]));await Orch.quickSearch('groceries');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({type:'groceries',lat:53.5,lon:0,radius:3000});
    const modal=document.getElementById('poiModal');expect(modal.querySelector('img,script')).toBeNull();
    expect(modal.textContent).toContain('Reported hours: 24/7');expect(modal.textContent).toContain('Reported operator: Operator <script>');
    expect(modal.textContent).toContain('Check current opening hours, stock and access');
    expect(modal.textContent).toContain('Reported shop: Convenience store');
    expect(runtime.call.formatPoiDistance).toHaveBeenCalledWith(100);expect(modal.textContent).toContain('0.1 mi');
});
test('mapped-empty is qualified and acquisition failure clears old selection',async()=>{
    global.fetch=jest.fn().mockResolvedValueOnce(result([item])).mockResolvedValueOnce(result([])).mockResolvedValueOnce({ok:false});
    await Orch.quickSearch('groceries');await Orch.quickSearch('groceries');
    expect(document.getElementById('poiModal').textContent).toContain('No grocery candidates returned. Coverage may be incomplete');
    await Orch.quickSearch('groceries');expect(document.getElementById('poiModal')).toBeNull();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('temporarily unavailable'),'error');
});
test('malformed successful response is an error rather than absence of grocery shops',async()=>{
    global.fetch=jest.fn().mockResolvedValue(result({}));await Orch.quickSearch('groceries');
    expect(document.getElementById('poiModal')).toBeNull();expect(status.mock.calls.at(-1)[1]).toBe('error');
});
test('late response cannot replace newer results',async()=>{
    let finish;global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(result([{...item,name:'Latest'}]));
    const pending=Orch.quickSearch('groceries');await Orch.quickSearch('groceries');finish(result([{...item,name:'Old'}]));await pending;
    expect(document.getElementById('poiModal').textContent).toContain('Latest');expect(document.getElementById('poiModal').textContent).not.toContain('Old');
});
test('selection invalidates old endpoint requests and calculates through the existing planner',async()=>{
    const invalidate=jest.fn();global.VoyagrLocationOrchestration={invalidateEndpointRequests:invalidate};
    global.fetch=jest.fn().mockResolvedValue(result([item]));await Orch.quickSearch('groceries');
    const handler=document.querySelector('#poiModal button[onclick^="selectPOI"]').getAttribute('onclick');
    Function('selectPOI',handler)(Orch.selectPOI);
    expect(invalidate).toHaveBeenCalledTimes(1);expect(calculate).toHaveBeenCalledTimes(1);
    expect(document.getElementById('start').value).toBe('53.5,0');expect(document.getElementById('end').value).toBe('53.5,-1.2');
    expect(document.getElementById('start').dataset.lat).toBeUndefined();expect(document.getElementById('end').dataset.journeySource).toBe('coordinates');
    expect(document.getElementById('poiModal')).toBeNull();
});
test('late GPS callback cannot search after a newer category action',async()=>{
    const callbacks=[];jest.spyOn(navigator.geolocation,'getCurrentPosition').mockImplementation(success=>callbacks.push(success));
    runtime.getCurrentLat=()=>null;runtime.getCurrentLon=()=>null;
    global.fetch=jest.fn().mockResolvedValue(result([item]));Orch.quickSearch('groceries');Orch.quickSearch('fuel');
    callbacks[0]({coords:{latitude:53.5,longitude:-1.2}});expect(global.fetch).not.toHaveBeenCalled();
    callbacks[1]({coords:{latitude:53.5,longitude:-1.2}});await Promise.resolve();await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(global.fetch.mock.calls[0][1].body).type).toBe('fuel');
});
