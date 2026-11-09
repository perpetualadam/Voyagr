const fs=require('node:fs'),path=require('node:path');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const nav='<div id="navigationTab">'+template.split('<div id="navigationTab">')[1].split('<!-- UNIFIED SETTINGS TAB')[0];
let owner,handles,flyTo,parking,gps,warn,invalidate;
beforeEach(()=>{
 jest.resetModules();localStorage.clear();document.body.innerHTML=nav;
 owner=require('../app/form-clear-orchestration');
 handles=Array.from({length:3},()=>({remove:jest.fn()}));flyTo=jest.fn();parking=jest.fn();gps=jest.fn();warn=jest.fn();invalidate=jest.fn();
 window.VoyagrLocationOrchestration={invalidateEndpointRequests:invalidate};
 window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>false};
 window.VoyagrAutoGpsOrchestration={getAutoGpsEnabled:()=>true};
 owner.bind({getStartMarker:()=>handles[0],getEndMarker:()=>handles[1],getRouteLayer:()=>handles[2],getMap:()=>({flyTo}),getZoomAnimationDurationMs:()=>0,setLastZoomLevel:jest.fn(),call:{clearParkingSelection:parking,updateAutoGpsLocation:gps,showStatus:warn}});
 for(const id of ['start','end','viaPointAddress','stopAddress'])document.getElementById(id).value='Old planning entry';
 Object.assign(document.getElementById('start').dataset,{lat:'53',lon:'-1',displayName:'Sheffield'});
 document.getElementById('status').className='status show';
});
afterEach(()=>{delete window.VoyagrLocationOrchestration;delete window.VoyagrNavigationLifecycleOrchestration;delete window.VoyagrAutoGpsOrchestration;});
test('current production markup has no legacy result node, yet cleanup and automatic GPS refresh complete',()=>{
 expect(document.getElementById('result')).toBeNull();
 localStorage.setItem('unit_distance','mi');localStorage.setItem('favorites','saved places');const before={...localStorage};
 expect(()=>owner.clearForm()).not.toThrow();
 for(const id of ['start','end','viaPointAddress','stopAddress'])expect(document.getElementById(id).value).toBe('');
 expect(document.getElementById('start').dataset.lat).toBeUndefined();expect(invalidate).toHaveBeenCalledTimes(1);
 for(const handle of handles)expect(handle.remove).toHaveBeenCalledTimes(1);
 expect(parking).toHaveBeenCalledTimes(1);expect(flyTo).toHaveBeenCalledWith({center:[-.1278,51.5074],zoom:13,duration:0});expect(gps).toHaveBeenCalledTimes(1);expect({...localStorage}).toEqual(before);
});
test('legacy result markup still hides, and manual-start mode does not request GPS',()=>{
 const result=document.createElement('div');result.id='result';result.className='show';document.body.append(result);
 window.VoyagrAutoGpsOrchestration.getAutoGpsEnabled=()=>false;owner.clearForm();expect(result.classList.contains('show')).toBe(false);expect(gps).not.toHaveBeenCalled();
});
test('an active journey refuses field/map/parking clearing and does not acquire GPS',()=>{
 window.VoyagrNavigationLifecycleOrchestration.getRouteInProgress=()=>true;
 const before=document.body.innerHTML;expect(owner.clearForm()).toBe(false);expect(document.body.innerHTML).toBe(before);
 for(const id of ['start','end','viaPointAddress','stopAddress'])expect(document.getElementById(id).value).toBe('Old planning entry');
 for(const handle of handles)expect(handle.remove).not.toHaveBeenCalled();expect(flyTo).not.toHaveBeenCalled();expect(parking).not.toHaveBeenCalled();expect(gps).not.toHaveBeenCalled();expect(warn).toHaveBeenCalledWith('End the current journey before clearing its map.','warning');
});
