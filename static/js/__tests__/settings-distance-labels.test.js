const Tabs=require('../app/tab-navigation-orchestration');
const fs=require('fs'),path=require('path');
const Units=require('../modules/navigation/units');
const Pref=require('../app/units-preferences-orchestration');
const Settings=require('../app/settings-orchestration');
const Snapshot=require('../modules/navigation/settings-snapshot');
const Speed=require('../modules/navigation/speed-gps');
const Widget=require('../modules/navigation/speed-limit-widget');
const Voice=require('../modules/navigation/voice-announcements');
const Parking=require('../modules/navigation/multimodal-parking');
const markup='<div id="settingsTab"'+fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8').split('<div id="settingsTab"')[1].split('<!-- TRIP HISTORY TAB')[0];
const ids=['voiceTurnDistance1','voiceTurnDistance2','voiceTurnDistance3','voiceHazardDistance','cameraAlertDistance','parkingMaxWalkingDistance'];
const el=id=>document.getElementById(id),selected=id=>el(id).selectedOptions[0].textContent;
let oldFetch;
beforeEach(()=>{document.body.innerHTML=markup;localStorage.clear();oldFetch=global.fetch;Pref.setDistanceUnitValue('km');Pref.bind({units:()=>Units,speedGps:()=>Speed,speedLimitWidget:()=>Widget,getCurrentSpeedLimitMph:()=>null,getLastDetectedRoadType:()=> 'residential',getLastSpeedLimitRegion:()=> 'uk',getCurrentGpsSpeedMph:()=>0,call:{getCurrentRoadType:()=> 'residential',updateSpeedWidget:()=>{},saveAllSettings:()=>{},showStatus:()=>{}}});jest.spyOn(console,'log').mockImplementation(()=>{});});
afterEach(()=>{global.fetch=oldFetch;localStorage.clear();jest.restoreAllMocks();});
test('all six option lists expose canonical metres while retaining minutes or metre values',()=>{
 for(const id of ids)for(const option of el(id).options){expect(option.dataset.distanceMeters).toBe(id==='parkingMaxWalkingDistance'?({'5':'400','10':'800','15':'1200'}[option.value]):option.value);}
 expect(el('parkingMaxWalkingDistance').value).toBe('10');expect(el('voiceTurnDistance1').value).toBe('500');expect(el('cameraAlertDistance').value).toBe('500');
});
test('shared refresh converts short labels to feet or metres, including approximate parking distance',()=>{
 Pref.setDistanceUnitValue('mi');Pref.updateAllDistanceDisplays();
 expect(selected('voiceTurnDistance1')).toBe('1640 ft');expect(selected('voiceTurnDistance2')).toBe('656 ft');expect(selected('voiceTurnDistance3')).toBe('328 ft');expect(selected('voiceHazardDistance')).toBe('1640 ft');expect(selected('cameraAlertDistance')).toBe('1640 ft');expect(selected('parkingMaxWalkingDistance')).toBe('10 minutes (about 2625 ft)');
 Pref.setDistanceUnitValue('km');Pref.updateAllDistanceDisplays();expect(selected('voiceTurnDistance1')).toBe('500 m');expect(selected('parkingMaxWalkingDistance')).toBe('10 minutes (about 800 m)');expect(el('parkingMaxWalkingDistance').options[2].textContent).toBe('15 minutes (about 1.2 km)');
});
test('refresh is presentation-only: preserve selection, nodes, thresholds, listeners and stored preferences',()=>{
 el('voiceTurnDistance1').value='800';el('parkingMaxWalkingDistance').value='15';el('cameraAlertDistance').value='300';localStorage.setItem('pref_cameraAlertDistance','300');
 const options=ids.flatMap(id=>[...el(id).options]),values=options.map(o=>[o.value,o.selected,o.dataset.distanceMeters]);let changes=0;for(const id of ids)el(id).addEventListener('change',()=>changes++);
 const before=JSON.stringify({...localStorage});global.fetch=()=>{throw Error('Unexpected network');};
 for(const unit of ['mi','km','mi']){Pref.setDistanceUnitValue(unit);Pref.updateAllDistanceDisplays();}
 expect(options.map(o=>[o.value,o.selected,o.dataset.distanceMeters])).toEqual(values);expect(options.every(o=>o.isConnected)).toBe(true);expect(changes).toBe(0);expect(JSON.stringify({...localStorage})).toBe(before);
 expect(Voice.buildVoicePreferencesCollectPlan({turnDistance1:el('voiceTurnDistance1').value}).turnDistance1).toBe(800);expect(Parking.buildParkingPreferencesCollectPlan({maxWalkingDistance:el('parkingMaxWalkingDistance').value}).maxWalkingDistance).toBe('15');expect(Number(el('cameraAlertDistance').value)).toBe(300);
});
test('restoring a profile updates labels in collapsed settings groups without acquisition or saving thresholds',()=>{
 Settings.bind({settingsSnapshot:()=>Snapshot,getRouteInProgress:()=>false,setDistanceUnit:Pref.setDistanceUnitValue,setCurrencyUnit:Pref.setCurrencyUnitValue,setSpeedUnit:Pref.setSpeedUnitValue,setTemperatureUnit:Pref.setTemperatureUnitValue,call:{refreshUnitDisplays:()=>Pref.refreshUnitDisplays()}});
 global.fetch=()=>{throw Error('Unexpected network');};localStorage.setItem('voyagr_all_settings',JSON.stringify({unit_distance:'mi'}));expect(Settings.loadAllSettings()).toBe(true);expect(selected('voiceTurnDistance1')).toBe('1640 ft');expect(el('settingsVoiceAlerts').open).toBe(false);expect(el('voiceTurnDistance1').value).toBe('500');
 localStorage.setItem('voyagr_all_settings',JSON.stringify({unit_distance:'km'}));expect(Settings.loadAllSettings()).toBe(true);expect(selected('parkingMaxWalkingDistance')).toBe('10 minutes (about 800 m)');
});
test('unit selector uses the existing persistence path and immediately refreshes option labels',()=>{
 const requests=[];global.fetch=(url,options)=>{requests.push([url,JSON.parse(options.body)]);return Promise.resolve({ok:true});};el('distanceUnit').value='mi';Function('updateDistanceUnit',el('distanceUnit').getAttribute('onchange'))(()=>Pref.updateDistanceUnit());expect(localStorage.getItem('unit_distance')).toBe('mi');expect(selected('cameraAlertDistance')).toBe('1640 ft');expect(requests).toHaveLength(1);expect(requests[0][0]).toBe('/api/app-settings');expect(el('cameraAlertDistance').value).toBe('500');
});

test('first Settings entry refreshes option labels for the default miles preference without writing preferences',()=>{
 Pref.setDistanceUnitValue('mi');global.fetch=()=>{throw Error('Unexpected network');};
 Tabs.bind({units:()=>Units,getDistanceUnit:Pref.getDistanceUnitValue,getCurrencyUnit:()=> 'GBP',getSpeedUnit:()=> 'mph',getTemperatureUnit:()=> 'celsius',call:{applyDomSelectsFromPlan:items=>items.forEach(({id,value})=>{const control=el(id);if(control)control.value=value;}),updateAllDistanceDisplays:()=>Pref.updateAllDistanceDisplays()}});
 expect(localStorage.length).toBe(0);Tabs.loadUnitPreferences();expect(el('distanceUnit').value).toBe('mi');expect(selected('voiceTurnDistance1')).toBe('1640 ft');expect(selected('parkingMaxWalkingDistance')).toBe('10 minutes (about 2625 ft)');expect(localStorage.length).toBe(0);
});
