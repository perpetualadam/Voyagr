const Orch=require('../app/poi-search-orchestration.js');
const POI=require('../modules/navigation/poi-search.js');
let status,oldFetch;
const item={name:'Mapped parking',type:'parking',lat:53.52,lon:-1.13,fee_category:'free',access_category:'customers',reported_fee:{maxstay:'2 hours'}};
beforeEach(()=>{
    oldFetch=global.fetch;status=jest.fn();document.body.innerHTML='<select id="parkingPricePreference"><option value="any">Any</option><option value="free">Free</option></select>';
    Orch.bind({poiSearch:()=>POI,getCurrentLat:()=>53.52,getCurrentLon:()=>-1.13,call:{showStatus:status,formatPoiDistance:()=> '100 m'}});
    jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{global.fetch=oldFetch;jest.restoreAllMocks();});
function result(rows,price='any'){return {ok:true,json:async()=>({success:true,source:'Overpass',results:rows,search_context:{price_pref:price}})};}
test('actual Parking POI action sends current-location price preference and renders restrictions',async()=>{
    document.getElementById('parkingPricePreference').value='free';global.fetch=jest.fn().mockResolvedValue(result([item],'free'));
    await Orch.quickSearch('parking');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({type:'parking',lat:53.52,lon:-1.13,radius:3000,price_pref:'free'});
    const modal=document.getElementById('poiModal');expect(modal.textContent).toContain('Reported free');
    expect(modal.textContent).toContain('Customers only');expect(modal.textContent).toContain('2 hours');
    expect(document.getElementById('poiParkingPrice').value).toBe('free');
});
test('valid empty keeps price selector while acquisition failure clears stale rows and reports error',async()=>{
    global.fetch=jest.fn().mockResolvedValueOnce(result([item])).mockResolvedValueOnce(result([],'free')).mockResolvedValueOnce({ok:false});
    await Orch.quickSearch('parking');document.getElementById('poiParkingPrice').value='free';await Orch.quickSearch('parking');
    expect(document.getElementById('poiModal').textContent).toContain('No matching mapped parking');
    expect(document.getElementById('poiParkingPrice').value).toBe('free');
    await Orch.quickSearch('parking');expect(document.getElementById('poiModal')).toBeNull();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('temporarily unavailable'),'error');
});
test('late older POI response cannot replace the latest filtered parking modal',async()=>{
    let finish;global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(result([{...item,name:'Latest free'}],'free'));
    const pending=Orch.quickSearch('parking');document.getElementById('parkingPricePreference').value='free';await Orch.quickSearch('parking');
    finish(result([{...item,name:'Old paid',fee_category:'paid'}]));await pending;
    expect(document.getElementById('poiModal').textContent).toContain('Latest free');expect(document.getElementById('poiModal').textContent).not.toContain('Old paid');
});
test('provider markup cannot escape the modal or its selection handler',()=>{
    const malicious='x\" );alert(1);//<img src=x onerror=alert(1)>';
    const node=document.createElement('div');node.innerHTML=POI.buildPoiResultItemHtml({...item,name:malicious,address:malicious},{userLat:53.52,userLon:-1.13});
    expect(node.querySelector('img')).toBeNull();expect(node.textContent).toContain(malicious);
    const handler=node.querySelector('button').getAttribute('onclick');const select=jest.fn();
    Function('selectPOI',handler)(select);expect(select).toHaveBeenCalledWith(53.52,-1.13,malicious,53.52,-1.13);
});
test('filtered Parking POI action rejects an older server response that lacks fee context',async()=>{
    document.getElementById('parkingPricePreference').value='free';global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({success:true,results:[item]})});
    await Orch.quickSearch('parking');expect(document.getElementById('poiModal')).toBeNull();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('fee-filter response mismatch'),'error');
});
