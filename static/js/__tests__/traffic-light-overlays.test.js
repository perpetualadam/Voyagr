const OT=require('../modules/map/map-overlay-toggles.js');
const OSM=require('../modules/map/osm-map-icons.js');
const TU=require('../modules/ui/toggle-ui.js');
let Traffic,Overlay,markers,areaMarkers,map,bounds,oldFetch;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const light=(id='one')=>({id,lat:53.5,lng:-1.19,name:'Signal'});
const data=(lights=[light()],coverage={status:'PARTIAL',response_state:'VALID_WITH_DATA'})=>({success:true,lights,coverage});
const response=d=>({ok:true,json:async()=>d});
const route=[[53.5,-1.2],[53.5,-1.18]];
const refreshArea=()=>{Overlay.setShowOsmTrafficLightsEnabled(false);return Overlay.toggleShowOsmTrafficLights();};
beforeEach(()=>{
 jest.useFakeTimers();localStorage.clear();oldFetch=global.fetch;markers=[];areaMarkers=[];
 document.body.innerHTML='<p id="routeTrafficLightStatus"></p><p id="osmTrafficLightDataStatus"></p><button id="trafficLightsToggle"></button><button id="showOsmTrafficLightsToggle"></button>';
 jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'warn').mockImplementation(()=>{});
 bounds={getNorth:()=>53.51,getSouth:()=>53.49,getEast:()=>-1.18,getWest:()=>-1.2};
 map={getBounds:()=>bounds,getZoom:()=>16};global.map=map;window.osmTrafficLightMarkers=[];
 global.maplibregl={Marker:class{constructor({element}){this.el=element;markers.push(this);}setLngLat(coords){this.coords=coords;return this;}setPopup(popup){this.popup=popup;return this;}addTo(){document.body.appendChild(this.el);return this;}remove(){this.removed=true;this.el.remove();}getElement(){return this.el;}},Popup:class{setHTML(html){this.html=html;return this;}}};
 global.fetch=jest.fn().mockResolvedValue(response(data()));
 jest.isolateModules(()=>{require('../modules/traffic-lights.js');Overlay=require('../app/map-overlay-orchestration.js');});Traffic=window.TrafficLights;
 Overlay.bind({getMap:()=>global.map,mapOverlayToggles:()=>OT,toggleUI:()=>TU,osmMapIcons:()=>OSM,getMapLibreHelpers:()=>({createMarker:(lat,lon,options)=>{const marker={lat,lon,options,addTo(){areaMarkers.push(this);return this;},remove(){this.removed=true;}};return marker;}}),call:{saveAllSettings:()=>{}}});
});
afterEach(()=>{Traffic.clearAllTrafficLights();global.fetch=oldFetch;delete global.map;delete global.maplibregl;delete window.TrafficLights;jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
test('selected route uses lng/lat API order, neutral locations and explicit partial/no-live-state copy',async()=>{
 await Traffic.plotTrafficLightsOnRoute(route);
 expect(JSON.parse(global.fetch.mock.calls[0][1].body).route.coordinates).toEqual([[-1.2,53.5],[-1.18,53.5]]);
 expect(markers[0].coords).toEqual([-1.19,53.5]);expect(markers[0].popup.html).toContain('Unknown');
 expect(document.getElementById('routeTrafficLightStatus').textContent).toContain('partial or unverified');
 expect(document.getElementById('routeTrafficLightStatus').textContent).toContain('Live signal state is unavailable');
 expect(jest.getTimerCount()).toBe(0);
});
test('newer route wins even when an aborted older transport still resolves',async()=>{
 const older=deferred(),newer=deferred();global.fetch.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
 const a=Traffic.plotTrafficLightsOnRoute(route),b=Traffic.plotTrafficLightsOnRoute([[54,-2],[54.01,-2.01]]);
 expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
 newer.resolve(response(data([light('new')])));await b;older.resolve(response(data([light('old')])));await a;
 expect(markers).toHaveLength(1);expect(markers[0].el.dataset.lightId).toBe('new');
});
test.each(['toggle','clear'])('%s invalidates in-flight markers and intervals',async action=>{
 const pending=deferred();global.fetch.mockReturnValue(pending.promise);const request=Traffic.plotTrafficLightsOnRoute(route);
 action==='toggle'?Traffic.toggleTrafficLights():Traffic.clearAllTrafficLights();pending.resolve(response(data()));await request;
 expect(markers).toHaveLength(0);expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);expect(jest.getTimerCount()).toBe(0);
});
test.each([null,{success:false},data([], {status:'UNKNOWN',response_state:'UNAVAILABLE'}),data([], {status:'PARTIAL',response_state:'VALID_EMPTY'})])('failure and mapped-empty states stay distinct: %j',async value=>{
 global.fetch.mockResolvedValue(response(value));await Traffic.plotTrafficLightsOnRoute(route);
 const text=document.getElementById('routeTrafficLightStatus').textContent;
 expect(text).toMatch(/unavailable|No mapped/);expect(text).toMatch(/does not mean|does not establish/);expect(markers).toHaveLength(0);
 if(value?.coverage?.response_state==='VALID_EMPTY')expect(text).toContain('No mapped');else expect(text).toContain('unavailable');
});
test('transport rejection clears previous route markers and does not claim no signals',async()=>{
 await Traffic.plotTrafficLightsOnRoute(route);global.fetch.mockRejectedValue(Error('offline'));await Traffic.plotTrafficLightsOnRoute(route);
 expect(markers[0].removed).toBe(true);expect(document.getElementById('routeTrafficLightStatus').textContent).toContain('Coverage is unknown');
});
test('bad coordinates and duplicate IDs cannot mount markers; OSM phases/countdowns are never inferred',async()=>{
 global.fetch.mockResolvedValue(response(data([light(),light(),{...light('bad'),lat:NaN},{...light('fake'),state:'green',duration:45,lastChanged:new Date().toISOString()}])));
 await Traffic.plotTrafficLightsOnRoute(route);expect(markers).toHaveLength(2);
 expect(markers[1].popup.html).toContain('Unknown');expect(markers[1].popup.html).not.toContain('Duration:');expect(markers[1].el.querySelector('.countdown')).toBeNull();
});
test('public marker helper escapes provider names and retains numeric update/remove compatibility',()=>{
 Traffic.addTrafficLight({...light(),name:'<img src=x onerror=alert(1)>',state:'red',duration:20,lastChanged:new Date().toISOString()});
 expect(markers[0].popup.html).toContain('&lt;img');expect(markers[0].popup.html).not.toContain('<img');
 Traffic.updateTrafficLight('one',{duration:25});expect(markers[0].el.querySelector('.countdown').textContent).toBe('25s');
 Traffic.removeTrafficLight('one');expect(markers[0].removed).toBe(true);
});
test('oversize acquisition copy does not imply empty coverage',()=>{
 expect(Traffic.describeCoverage(data([],{status:'PARTIAL',reason:'area_too_large'}),0)).toContain('area is too large');
});
test('viewport result cannot reappear after toggle-off or after an older bounds request settles',async()=>{
 const a=deferred(),b=deferred();global.fetch.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 const first=refreshArea();bounds={getNorth:()=>53.52,getSouth:()=>53.50,getEast:()=>-1.17,getWest:()=>-1.19};
 const second=refreshArea();b.resolve(response({success:true,traffic_lights:[{lat:53.51,lon:-1.18}],coverage:{status:'PARTIAL'}}));await second;
 a.resolve(response({success:true,traffic_lights:[{lat:53.5,lon:-1.19}]}));await first;
 expect(areaMarkers).toHaveLength(1);expect(areaMarkers[0].lat).toBe(53.51);
 const late=deferred();global.fetch.mockReturnValue(late.promise);const pending=refreshArea();Overlay.toggleShowOsmTrafficLights();
 late.resolve(response({success:true,traffic_lights:[{lat:53.51,lon:-1.18}]}));await pending;
 expect(areaMarkers).toHaveLength(1);expect(areaMarkers[0].removed).toBe(true);expect(document.getElementById('osmTrafficLightDataStatus').textContent).toContain('off');
});
test('viewport empty, unavailable and zoomed-out states retain coverage messaging',async()=>{
 global.fetch.mockResolvedValue(response({success:true,traffic_lights:[],coverage:{status:'PARTIAL',response_state:'VALID_EMPTY'}}));await refreshArea();expect(document.getElementById('osmTrafficLightDataStatus').textContent).toContain('No mapped');
 global.fetch.mockRejectedValue(Error('offline'));await refreshArea();expect(document.getElementById('osmTrafficLightDataStatus').textContent).toContain('unavailable');
 map.getZoom=()=>5;await refreshArea();expect(document.getElementById('osmTrafficLightDataStatus').textContent).toContain('Zoom in');
});

test('manual marker updates expire countdowns and preserve explicit state icon compatibility',()=>{
 Traffic.addTrafficLight({...light(),duration:20,lastChanged:new Date().toISOString()});
 Traffic.updateTrafficLight('one',{duration:1,lastChanged:new Date(Date.now()-5000).toISOString()});
 expect(markers[0].el.querySelector('.countdown')).toBeNull();
 expect(()=>Traffic.updateTrafficLight('missing',{})).not.toThrow();
 for(const colour of ['red','yellow','green'])expect(Traffic.createIconSVG(colour)).toContain('<svg');
});
test('nearby helper uses distance only for an explicitly supplied state; OSM requests remain neutral',()=>{
 Traffic.addTrafficLight({...light(),state:'red'});Traffic.checkNearbyTrafficLights(53.5,-1.19);
 expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Approaching red light'));
 Traffic.toggleTrafficLights();const count=console.log.mock.calls.length;Traffic.checkNearbyTrafficLights(53.5,-1.19);expect(console.log).toHaveBeenCalledTimes(count);
});
test('re-enabling requests the active route, and an absent map or empty route mounts nothing',async()=>{
 global.routePolyline=route;
 try{
  Traffic.toggleTrafficLights();expect(Traffic.isEnabled()).toBe(false);
  Traffic.toggleTrafficLights();for(let i=0;i<10;i++)await Promise.resolve();
  expect(Traffic.isEnabled()).toBe(true);expect(markers).toHaveLength(1);
  await Traffic.plotTrafficLightsOnRoute([]);expect(markers[0].removed).toBe(true);
  const count=global.fetch.mock.calls.length;global.map=null;await Traffic.plotTrafficLightsOnRoute(route);expect(global.fetch).toHaveBeenCalledTimes(count);
 }finally{delete global.routePolyline;}
});
test('panning without a new request suppresses the older viewport response',async()=>{
 const pending=deferred();global.fetch.mockReturnValue(pending.promise);const request=refreshArea();
 bounds={getNorth:()=>54.1,getSouth:()=>54,getEast:()=>-2,getWest:()=>-2.1};
 pending.resolve(response({success:true,traffic_lights:[{lat:53.5,lon:-1.19}]}));await request;
 expect(areaMarkers).toHaveLength(0);
});

test('viewport response is ignored after its owner runtime is unbound',async()=>{
 const pending=deferred();global.fetch.mockReturnValue(pending.promise);const request=refreshArea();
 Overlay.bind(null);pending.resolve(response({success:true,traffic_lights:[{lat:53.5,lon:-1.19}]}));
 await expect(request).resolves.toBeUndefined();expect(areaMarkers).toHaveLength(0);
});
