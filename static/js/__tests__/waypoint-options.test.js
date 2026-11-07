const fs=require('fs'),path=require('path');
const WP=require('../modules/navigation/waypoints.js'),DH=require('../modules/ui/dom-helpers.js');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const markup=template.slice(template.indexOf('<details id="waypointOptions"'),template.indexOf('<!-- Vehicle Type Selector -->'));
let Owner,rt,invalidated;
const summary=()=>document.getElementById('waypointOptionsSummary').textContent;
beforeEach(()=>{
 document.body.innerHTML=markup;
 jest.isolateModules(()=>{Owner=require('../app/waypoints-orchestration.js');});
 invalidated=jest.fn();global.VoyagrLocationOrchestration={invalidateEndpointRequests:invalidated};
 rt={waypoints:()=>WP,domHelpers:()=>DH,getMap:()=>null,getMapLibreHelpers:()=>({createMarker:()=>({addTo(){return this;},remove(){}})}),call:{showStatus:jest.fn(),getAutocompleteDropdown:()=>null,geocodeAddress:jest.fn(async()=>({lat:53,lon:-1,display_name:'Resolved place'}))}};
 Owner.bind(rt);
});
afterEach(()=>{delete global.VoyagrLocationOrchestration;});
test('native disclosure starts closed, keeps existing controls and exposes counts after add/remove/clear',()=>{
 expect(document.getElementById('waypointOptions').open).toBe(false);
 Owner.addViaPoint(53,-1,'Via');Owner.addStop(54,-2,'Stop',20);
 expect(summary()).toBe('1 stop · 1 via-point · 20 min stop time');
 Owner.removeViaPoint(0);expect(summary()).toBe('1 stop · 20 min stop time');
 Owner.clearAllWaypoints();expect(summary()).toBe('No via-points or stops');
 expect(document.getElementById('waypointOptions').open).toBe(false);
 expect(document.querySelector('[onclick="VoyagrJourneyModes.addGpsStop()"]')).not.toBeNull();
});
test('reordering preserves dwell times and coordinates, and a restored list refreshes its summary',()=>{
 Owner.addStop(53,-1,'A',15);Owner.addStop(54,-2,'B',30);Owner.moveWaypoint('stop',1,-1);
 expect(Owner.getStops().map(s=>[s.name,s.lat,s.lon,s.duration])).toEqual([['B',54,-2,30],['A',53,-1,15]]);
 expect(summary()).toBe('2 stops · 45 min stop time');
 Owner.getViaPoints().push({lat:55,lon:-3,name:'Restored'});Owner.updateWaypointsList();
 expect(summary()).toBe('2 stops · 1 via-point · 45 min stop time');expect(invalidated).toHaveBeenCalled();
});
test('map pick remains active when the disclosure closes and can be cancelled normally',()=>{
 Owner.toggleAddViaPoint();expect(summary()).toContain('Choosing a via-point on the map');
 document.getElementById('waypointOptions').open=false;Owner.syncWaypointSummary();expect(Owner.getAddingViaPoint()).toBe(true);
 Owner.toggleAddViaPoint();expect(Owner.getAddingViaPoint()).toBe(false);expect(summary()).toBe('No via-points or stops');
 Owner.toggleAddStop();expect(summary()).toContain('Choosing a stop on the map');
});
test.each(['via','stop'])('actual %s address-add path accepts a selected result and clears only its input',async kind=>{
 const input=document.getElementById(kind==='via'?'viaPointAddress':'stopAddress');input.value='Chosen';Object.assign(input.dataset,{lat:'53',lon:'-1',displayName:'Chosen',journeySource:'searched'});
 await Owner[kind==='via'?'addViaPointFromAddress':'addStopFromAddress']();
 const rows=Owner[kind==='via'?'getViaPoints':'getStops']();
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({lat:53,lon:-1,name:'Chosen',provenance:'searched'});
 expect(input.value).toBe('');expect(rt.call.geocodeAddress).not.toHaveBeenCalled();
 expect(summary()).toContain(kind==='via'?'1 via-point':'1 stop');
});
test('unresolved typed address uses existing geocoder and stop duration default',async()=>{
 document.getElementById('stopAddress').value='Typed place';await Owner.addStopFromAddress();
 expect(rt.call.geocodeAddress).toHaveBeenCalledWith('Typed place');expect(Owner.getStops()).toHaveLength(1);expect(Owner.getStops()[0].duration).toBe(15);
 expect(summary()).toBe('1 stop · 15 min stop time');
});
