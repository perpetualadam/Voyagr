const RTF=require('../modules/navigation/route-traffic-flow.js');
const RS=require('../modules/navigation/route-selection.js');
let owner,polyline,map,addPolyline;
const line=[[51.5,-.1],[51.51,-.11],[51.52,-.12]];
function payload(level='red'){return {success:true,source:'test',segments:[{start:line[0],end:line[2],traffic_level:level}]};}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function response(data){return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data};}
beforeEach(()=>{
    jest.resetModules();owner=require('../app/traffic-orchestration.js');polyline=line.map(p=>p.slice());
    map={getStyle:()=>({layers:[]}),getLayer:()=>null};addPolyline=jest.fn(()=>({remove:jest.fn()}));
    owner.bind({toggleUI:()=>({writeBoolPref:jest.fn(),applyToggleButton:jest.fn()}),getRouteInProgress:()=>true,showStatus:jest.fn(),saveAllSettings:jest.fn(),getRoutePolyline:()=>polyline,getMap:()=>map,routeTrafficFlow:()=>RTF,routeSelection:()=>RS,getMapLibreHelpers:()=>({addPolyline}),getRouteLayer:()=>null,getAllRouteLayers:()=>[],applyMapLayerReorderFromPlan:jest.fn()});
    global.fetch=jest.fn();jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'debug').mockImplementation(()=>{});
});
afterEach(()=>{jest.restoreAllMocks();delete global.fetch;});
test('three simultaneous preview/selection/traffic calls make one request and one mount',async()=>{
    const d=deferred();fetch.mockReturnValue(d.promise);
    const pending=[owner.fetchAndDisplayRouteTraffic(),owner.fetchAndDisplayRouteTraffic(),owner.fetchAndDisplayRouteTraffic()];
    expect(fetch).toHaveBeenCalledTimes(1);d.resolve(response(payload()));await Promise.all(pending);
    expect(addPolyline).toHaveBeenCalledTimes(1);
});
test('superseded route response never renders over newer route',async()=>{
    const old=deferred();fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(payload()));
    const pending=owner.fetchAndDisplayRouteTraffic();polyline=[...line,[51.53,-.13]];
    await owner.fetchAndDisplayRouteTraffic();addPolyline.mockClear();
    old.resolve(response(payload()));await pending;expect(addPolyline).not.toHaveBeenCalled();
});
test('all-green traffic reports zero overlays instead of Cannot display then Displayed',async()=>{
    const data=payload('green');data.segments=Array.from({length:9},()=>({...data.segments[0]}));
    fetch.mockResolvedValue(response(data));await owner.fetchAndDisplayRouteTraffic();
    expect(addPolyline).not.toHaveBeenCalled();
    const logs=console.log.mock.calls.map(c=>c.join(' ')).join('\n');
    expect(logs).not.toMatch(/Cannot display|Displayed 9 traffic segments/);
    expect(logs).toContain('0 congested traffic overlays');
});
test('turning traffic off while request is pending prevents stale mount',async()=>{
    const d=deferred();fetch.mockReturnValue(d.promise);const pending=owner.fetchAndDisplayRouteTraffic();
    owner.applyTrafficSettingsPatch('routeTrafficEnabled',false);d.resolve(response(payload()));await pending;
    expect(addPolyline).not.toHaveBeenCalled();
});
test('identical completed calls coalesce briefly but refresh after the one-second window',async()=>{
    jest.spyOn(Date,'now').mockReturnValue(1000);fetch.mockResolvedValue(response(payload()));
    await owner.fetchAndDisplayRouteTraffic();await owner.fetchAndDisplayRouteTraffic();expect(fetch).toHaveBeenCalledTimes(1);
    Date.now.mockReturnValue(2001);await owner.fetchAndDisplayRouteTraffic();expect(fetch).toHaveBeenCalledTimes(2);
});
test('style replacement invalidates a pending traffic result',async()=>{
    const d=deferred();fetch.mockReturnValue(d.promise);const pending=owner.fetchAndDisplayRouteTraffic();
    window.__voyagrMapStyleGeneration=(window.__voyagrMapStyleGeneration||0)+1;
    d.resolve(response(payload()));await pending;expect(addPolyline).not.toHaveBeenCalled();
});
test('malformed/unmatched traffic leaves a valid existing overlay intact',async()=>{
    const remove=jest.fn();addPolyline.mockReturnValue({remove});fetch.mockResolvedValue(response(payload()));
    await owner.fetchAndDisplayRouteTraffic();owner.displayRouteTrafficEdges([{traffic_level:'red',start:[0,0],end:[0,0]}]);
    expect(remove).not.toHaveBeenCalled();
});

test('rapid off/on starts a fresh display request instead of joining the invalidated one',async()=>{
    const old=deferred();fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(payload()));
    const pending=owner.fetchAndDisplayRouteTraffic();owner.toggleRouteTraffic();owner.toggleRouteTraffic();
    expect(fetch).toHaveBeenCalledTimes(2);await owner.fetchAndDisplayRouteTraffic();addPolyline.mockClear();
    old.resolve(response(payload()));await pending;expect(addPolyline).not.toHaveBeenCalled();
});

function styleMap(){
    const layers=new Map(),sources=new Map();let id=0;
    map={getStyle:()=>({layers:[...layers.values()]}),isStyleLoaded:()=>true,
        getLayer:key=>layers.get(key),getSource:key=>sources.get(key)};
    addPolyline.mockImplementation(()=>{
        const key='traffic-test-'+(++id);layers.set(key,{id:key});sources.set(key,{});
        return {id:key,remove:()=>{layers.delete(key);sources.delete(key);}};
    });
    return ()=>{layers.clear();sources.clear();};
}
test('style replacement restores displayed route traffic once without requesting data',()=>{
    const wipe=styleMap();owner.displayRouteTrafficEdges(payload().segments);
    expect(owner.restoreRouteTrafficAfterStyleLoad(map)).toBe(false);
    wipe();expect(owner.restoreRouteTrafficAfterStyleLoad(map)).toBe(true);
    expect(addPolyline).toHaveBeenCalledTimes(2);expect(fetch).not.toHaveBeenCalled();
    expect(addPolyline.mock.calls[1]).toEqual(addPolyline.mock.calls[0]);
    expect(owner.restoreRouteTrafficAfterStyleLoad(map)).toBe(false);
});
test.each(['clear','disable','route','map','loading','foreign'])('traffic restoration refuses %s context',reason=>{
    const wipe=styleMap();owner.displayRouteTrafficEdges(payload().segments);wipe();
    if(reason==='clear')owner.clearRouteTrafficLayers();
    if(reason==='disable')owner.applyTrafficSettingsPatch('routeTrafficEnabled',false);
    if(reason==='route')polyline=[...line,[52,-1]];
    const target=map;
    if(reason==='map')map={...map};
    if(reason==='loading')map.isStyleLoaded=()=>false;
    if(reason==='foreign')map.getSource=()=>({foreign:true});
    expect(owner.restoreRouteTrafficAfterStyleLoad(target)).toBe(false);
    expect(addPolyline).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
});
test('all-green refresh revokes previously displayed congestion restoration',()=>{
    const wipe=styleMap();owner.displayRouteTrafficEdges(payload().segments);
    owner.displayRouteTrafficEdges(payload('green').segments);wipe();
    expect(owner.restoreRouteTrafficAfterStyleLoad(map)).toBe(false);
    expect(addPolyline).toHaveBeenCalledTimes(1);
});
