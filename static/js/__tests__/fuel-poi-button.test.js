const Orch=require('../app/poi-search-orchestration.js');
const POI=require('../modules/navigation/poi-search.js');
let status,calculate,oldFetch;
const item={name:'Station <img src=x>',type:'fuel',lat:53.5,lon:-1.2,distance_m:100,reported_fuels:['Diesel'],opening_hours:'24/7'};
beforeEach(()=>{
    oldFetch=global.fetch;status=jest.fn();calculate=jest.fn();document.body.innerHTML='<input id="start" data-lat="1" data-journey-original-source="gps"><input id="end" data-lon="2">';
    Orch.bind({poiSearch:()=>POI,getCurrentLat:()=>53.5,getCurrentLon:()=>0,call:{showStatus:status,calculateRoute:calculate,formatPoiDistance:()=> '100 m'}});
    jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{global.fetch=oldFetch;delete global.VoyagrLocationOrchestration;jest.restoreAllMocks();});
function result(rows){return {ok:true,json:async()=>({success:true,source:'Overpass',results:rows})};}
test('Fuel action uses valid zero longitude and reports unverified hours and fuels safely',async()=>{
    global.fetch=jest.fn().mockResolvedValue(result([item]));await Orch.quickSearch('fuel');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({type:'fuel',lat:53.5,lon:0,radius:3000});
    const modal=document.getElementById('poiModal');expect(modal.querySelector('img')).toBeNull();
    expect(modal.textContent).toContain('Reported hours: 24/7');expect(modal.textContent).toContain('Reported fuels: Diesel');
    expect(modal.textContent).toContain('Check current opening hours');
    expect(modal.textContent).toContain('Plan route here');
});
test('empty is qualified while failure removes old selection',async()=>{
    global.fetch=jest.fn().mockResolvedValueOnce(result([item])).mockResolvedValueOnce(result([])).mockResolvedValueOnce({ok:false});
    await Orch.quickSearch('fuel');await Orch.quickSearch('fuel');
    expect(document.getElementById('poiModal').textContent).toContain('Coverage may be incomplete');
    await Orch.quickSearch('fuel');expect(document.getElementById('poiModal')).toBeNull();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('temporarily unavailable'),'error');
});
test('malformed successful response is an error rather than no stations',async()=>{
    global.fetch=jest.fn().mockResolvedValue(result({}));await Orch.quickSearch('fuel');
    expect(document.getElementById('poiModal')).toBeNull();expect(status.mock.calls.at(-1)[1]).toBe('error');
});
test('late response cannot replace newer Fuel results',async()=>{
    let finish;global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(result([{...item,name:'Latest'}]));
    const pending=Orch.quickSearch('fuel');await Orch.quickSearch('fuel');finish(result([{...item,name:'Old'}]));await pending;
    expect(document.getElementById('poiModal').textContent).toContain('Latest');expect(document.getElementById('poiModal').textContent).not.toContain('Old');
});
test('selection preserves planning flow and clears old endpoint provenance',async()=>{
    const invalidate=jest.fn();global.VoyagrLocationOrchestration={invalidateEndpointRequests:invalidate};
    global.fetch=jest.fn().mockResolvedValue(result([item]));await Orch.quickSearch('fuel');
    const handler=document.querySelector('#poiModal button[onclick^="selectPOI"]').getAttribute('onclick');
    Function('selectPOI',handler)(Orch.selectPOI);
    expect(invalidate).toHaveBeenCalledTimes(1);expect(calculate).toHaveBeenCalledTimes(1);
    expect(document.getElementById('start').value).toBe('53.5,0');expect(document.getElementById('end').value).toBe('53.5,-1.2');
    expect(document.getElementById('start').dataset.lat).toBeUndefined();expect(document.getElementById('end').dataset.journeySource).toBe('coordinates');
    expect(document.getElementById('poiModal')).toBeNull();
});
