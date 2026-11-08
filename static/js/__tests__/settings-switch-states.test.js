const fs=require('fs'),path=require('path');
const Toggle=require('../modules/ui/toggle-ui');
const Route=require('../app/route-avoidance-orchestration');
const Prefs=require('../modules/navigation/route-prefs');
const Hazards=require('../modules/navigation/hazard-alerts');
const HazardController=require('../app/hazard-preferences-orchestration');
const MapControls=require('../modules/map/map-controls');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const markup='<div id="settingsTab"'+template.split('<div id="settingsTab"')[1].split('<!-- TRIP HISTORY TAB')[0];
const oldFetch=global.fetch;
beforeEach(()=>{localStorage.clear();document.body.innerHTML=markup;});
afterEach(()=>{global.fetch=oldFetch;delete window.TrafficLights;jest.restoreAllMocks();});
function consistent(button,on){expect(button.classList.contains('active')).toBe(on);expect(button.getAttribute('aria-checked')).toBe(String(on));}
test('every Settings pill has a stable accessible name and an initial switch state matching its class',()=>{
 const buttons=[...document.querySelectorAll('#settingsTab button.toggle-switch')];expect(buttons.length).toBeGreaterThan(25);
 for(const b of buttons){expect(b.getAttribute('role')).toBe('switch');expect(b.getAttribute('aria-label').trim()).not.toBe('');expect(b.hasAttribute('aria-pressed')).toBe(false);expect(b.type).toBe('button');consistent(b,b.classList.contains('active'));}
 expect(document.getElementById('themeDark').hasAttribute('aria-checked')).toBe(false);
});
test('shared updates synchronize switch state immediately and leave regular pressed buttons unchanged',()=>{
 const b=document.getElementById('smartZoomToggle'),name=b.getAttribute('aria-label');
 Toggle.applyToggleButton(b,true);consistent(b,true);Toggle.applyLabeledToggleButton(b,false);consistent(b,false);expect(b.getAttribute('aria-label')).toBe(name);
 const pressed=document.createElement('button');pressed.setAttribute('aria-pressed','false');Toggle.applyToggleButton(pressed,true);expect(pressed.getAttribute('aria-pressed')).toBe('true');expect(pressed.hasAttribute('aria-checked')).toBe(false);
 const plain=document.createElement('button');Toggle.applyToggleButton(plain,true);expect(plain.hasAttribute('aria-checked')).toBe(false);expect(plain.hasAttribute('role')).toBe(false);
});
test('route preference actions and restoration retain persistence and update accessible state in collapsed groups',()=>{
 Route.bind({routePrefs:()=>Prefs,toggleUI:()=>Toggle,call:{saveAllSettings:()=>{},showStatus:()=>{}}});jest.spyOn(console,'log').mockImplementation(()=>{});
 const b=document.getElementById('avoidCameras');Route.togglePreference('cameras');consistent(b,true);expect(localStorage.getItem('pref_cameras')).toBe('true');Route.togglePreference('cameras');consistent(b,false);expect(localStorage.getItem('pref_cameras')).toBe('false');
 localStorage.setItem('pref_avoid_tollRoads','true');Route.loadAvoidancePreferences();consistent(document.getElementById('avoidTollRoads'),true);
 localStorage.setItem('pref_avoid_tollRoads','false');Route.loadAvoidancePreferences();consistent(document.getElementById('avoidTollRoads'),false);
});
test('API preference changes expose only the last confirmed state while pending or rejected',async()=>{
 HazardController.bind({hazardAlerts:()=>Hazards,toggleUI:()=>Toggle,call:{showStatus:()=>{},saveAllSettings:()=>{}}});
 const b=document.querySelector('[data-hazard-type="camera_speed"]');let resolve;const pending=new Promise(r=>{resolve=r;});
 global.fetch=async(_url,opts)=>({json:()=>opts?pending:Promise.resolve({success:true,preferences:[{hazard_type:'camera_speed',enabled:false}]})});
 const update=HazardController.toggleHazardPreferenceApi('camera_speed');await Promise.resolve();await Promise.resolve();consistent(b,false);resolve({success:true});await update;consistent(b,true);
 global.fetch=async(_url,opts)=>({json:async()=>opts?{success:false,error:'Rejected'}:{success:true,preferences:[{hazard_type:'camera_speed',enabled:true}]}});
 await HazardController.toggleHazardPreferenceApi('camera_speed');consistent(b,true);
});
test('API-loaded and fallback preferences keep visual and accessible states together',async()=>{
 HazardController.bind({hazardAlerts:()=>Hazards,toggleUI:()=>Toggle});global.fetch=async()=>({json:async()=>({success:true,preferences:[{hazard_type:'camera_speed',enabled:false},{hazard_type:'camera_red_light',enabled:true}]})});
 await HazardController.loadHazardCameraTogglesFromApi();consistent(document.querySelector('[data-hazard-type="camera_speed"]'),false);consistent(document.querySelector('[data-hazard-type="camera_red_light"]'),true);
 jest.spyOn(console,'warn').mockImplementation(()=>{});global.fetch=async()=>{throw Error('Offline');};await HazardController.loadHazardCameraTogglesFromApi();consistent(document.querySelector('[data-hazard-type="camera_speed"]'),true);
});
test('legacy traffic-light path restores saved off state and keeps both toggling directions in sync',()=>{
 localStorage.setItem('trafficLightsEnabled','false');jest.spyOn(console,'log').mockImplementation(()=>{});
 jest.isolateModules(()=>require('../modules/traffic-lights'));document.dispatchEvent(new Event('DOMContentLoaded'));
 const b=document.getElementById('trafficLightsToggle');consistent(b,false);expect(window.TrafficLights.isEnabled()).toBe(false);
 window.TrafficLights.toggleTrafficLights();consistent(b,true);expect(localStorage.getItem('trafficLightsEnabled')).toBe('true');window.TrafficLights.toggleTrafficLights();consistent(b,false);
});
test('AR direct status updates expose the same state as their existing visual owner',()=>{
 const b=document.getElementById('arModeBtn');MapControls.applyARModeButtonState(b,'active');consistent(b,true);MapControls.applyARModeButtonState(b,'inactive');consistent(b,false);
});
