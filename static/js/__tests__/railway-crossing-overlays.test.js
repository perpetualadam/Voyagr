const OT=require('../modules/map/map-overlay-toggles.js');
const OSM=require('../modules/map/osm-map-icons.js');
const TU=require('../modules/ui/toggle-ui.js');
let Overlay,map,bounds,markers,oldFetch;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const point={lat:53.505,lon:-1.195};
const data=(points=[point],coverage={status:'PARTIAL',response_state:'VALID_WITH_DATA'})=>({success:true,railway_crossings:points,coverage});
const response=d=>({ok:true,json:async()=>d});
const text=()=>document.getElementById('osmRailwayCrossingDataStatus').textContent;
const refresh=()=>{Overlay.setShowOsmRailwayCrossingsEnabled(false);return Overlay.toggleShowOsmRailwayCrossings();};
beforeEach(()=>{
 localStorage.clear();oldFetch=global.fetch;markers=[];window.osmRailwayCrossingMarkers=[];
 document.body.innerHTML='<p id="osmRailwayCrossingDataStatus"></p><button id="showOsmRailwayCrossingsToggle"></button>';
 jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'warn').mockImplementation(()=>{});
 bounds={getNorth:()=>53.52,getSouth:()=>53.49,getEast:()=>-1.18,getWest:()=>-1.21};map={getBounds:()=>bounds,getZoom:()=>16};
 global.fetch=jest.fn().mockResolvedValue(response(data()));
 jest.isolateModules(()=>{Overlay=require('../app/map-overlay-orchestration.js');});
 Overlay.bind({getMap:()=>map,mapOverlayToggles:()=>OT,toggleUI:()=>TU,osmMapIcons:()=>OSM,getMapLibreHelpers:()=>({createMarker:(lat,lon,options)=>({lat,lon,options,addTo(){markers.push(this);return this;},remove(){this.removed=true;}})}),call:{saveAllSettings:()=>{}}});
});
afterEach(()=>{global.fetch=oldFetch;jest.restoreAllMocks();});
test('crossing marker uses the original coordinate order/icon and qualifies coverage and barrier state',async()=>{
 await refresh();expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/railway-crossings/area?'));
 expect(markers).toHaveLength(1);expect(markers[0]).toMatchObject(point);
 expect(markers[0].options.popup).toContain('Level crossing');expect(markers[0].options.popup).toContain('Live barrier or train state is unavailable');
 expect(text()).toContain('1 mapped level-crossing');expect(text()).toContain('partial or unverified');
});
test.each([data([],{status:'PARTIAL',response_state:'VALID_EMPTY'}),data([],{status:'UNKNOWN',response_state:'UNAVAILABLE'}),data([],{status:'UNAVAILABLE',reason:'acquisition_busy'}),{success:false},{success:true},{success:true,railway_crossings:{}},null])('mapped empty and failure stay distinct: %j',async value=>{
 global.fetch.mockResolvedValue(response(value));await refresh();
 expect(markers).toHaveLength(0);expect(text()).toMatch(/does not establish|does not mean/);
 if(value?.coverage?.response_state==='VALID_EMPTY')expect(text()).toContain('No mapped');else expect(text()).toContain('unavailable');
});
test('oversized result reports skipped acquisition and stale observations remain labelled',async()=>{
 global.fetch.mockResolvedValueOnce(response(data([],{status:'PARTIAL',reason:'area_too_large',response_state:'NOT_QUERIED'})));
 await refresh();expect(text()).toContain('area is too large');
 global.fetch.mockResolvedValueOnce(response(data([point],{status:'STALE'})));await refresh();expect(text()).toContain('Coverage is stale');
});
test('late older bounds results cannot replace the newest markers',async()=>{
 const first=deferred(),second=deferred();global.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 const a=refresh();bounds={getNorth:()=>53.54,getSouth:()=>53.52,getEast:()=>-1.17,getWest:()=>-1.19};const b=refresh();
 second.resolve(response(data([{lat:53.53,lon:-1.18}])));await b;first.resolve(response(data()));await a;
 expect(markers).toHaveLength(1);expect(markers[0].lat).toBe(53.53);
});
test('toggle off invalidates in-flight results and clears existing crossing markers only',async()=>{
 await refresh();window.osmTrafficLightMarkers=[{remove:jest.fn()}];
 const pending=deferred();global.fetch.mockReturnValue(pending.promise);const request=refresh();
 Overlay.toggleShowOsmRailwayCrossings();pending.resolve(response(data()));await request;
 expect(markers).toHaveLength(1);expect(markers[0].removed).toBe(true);expect(text()).toContain('off');
 expect(window.osmTrafficLightMarkers[0].remove).not.toHaveBeenCalled();
});
test('pan, map replacement and runtime teardown all refuse obsolete observations',async()=>{
 for(const mode of ['pan','map','unbind']){
  const pending=deferred();global.fetch.mockReturnValue(pending.promise);const request=refresh();
  if(mode==='pan')bounds={getNorth:()=>54,getSouth:()=>53.98,getEast:()=>-2,getWest:()=>-2.02};
  if(mode==='map')map={...map};
  if(mode==='unbind')Overlay.bind(null);
  pending.resolve(response(data()));await expect(request).resolves.toBeUndefined();
 }
 expect(markers).toHaveLength(0);
});
test('transport/HTTP/JSON errors clear old markers and report unknown coverage',async()=>{
 await refresh();
 for(const implementation of [()=>Promise.reject(Error('offline')),()=>Promise.resolve({ok:false,status:503}),()=>Promise.resolve({ok:true,json:async()=>{throw Error('bad JSON');}})]){
  global.fetch.mockImplementation(implementation);await refresh();expect(text()).toContain('Coverage is unknown');
 }
 expect(markers[0].removed).toBe(true);
});
test('malformed and duplicate coordinates cannot inflate shown markers',async()=>{
 global.fetch.mockResolvedValue(response(data([point,point,null,{lat:NaN,lon:1},{lat:true,lon:1},{lat:91,lon:1}])));await refresh();
 expect(markers).toHaveLength(1);expect(text()).toContain('1 mapped');
});
test('display cap and zoom-out keep work bounded without claiming crossing absence',async()=>{
 global.fetch.mockResolvedValue(response(data(Array.from({length:205},(_,i)=>({lat:53.5+i*.00001,lon:-1.19})))));await refresh();expect(markers).toHaveLength(200);
 map.getZoom=()=>5;await refresh();expect(text()).toContain('Zoom in');expect(markers.every(m=>m.removed)).toBe(true);
});

test('restoring an off preference removes mounted crossings and invalidates pending results',async()=>{
 await refresh();const pending=deferred();global.fetch.mockReturnValue(pending.promise);const request=refresh();
 Overlay.setShowOsmRailwayCrossingsEnabled(false);pending.resolve(response(data()));await request;
 expect(markers).toHaveLength(1);expect(markers[0].removed).toBe(true);expect(text()).toContain('off');
 expect(Overlay.getShowOsmRailwayCrossingsEnabled()).toBe(false);
});
