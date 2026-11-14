// Persistence boundary is device-only; conversion assertions below remain unchanged.
beforeEach(()=>{global.VoyagrLocalData={preferenceRequest:jest.fn(options=>global.fetch('/device-preferences',options))};});
afterEach(()=>{delete global.VoyagrLocalData;});
const Units=require('../modules/navigation/units.js');
const Pref=require('../app/units-preferences-orchestration.js');
const Settings=require('../app/settings-orchestration.js');
const Snapshot=require('../modules/navigation/settings-snapshot.js');
const SG=require('../modules/navigation/speed-gps.js');
const SL=require('../modules/navigation/speed-limit-widget.js');
const RS=require('../modules/navigation/route-selection.js');
const Sharing=require('../modules/navigation/route-sharing.js');
const History=require('../modules/navigation/trip-history.js');
let oldFetch,refresh,widget;
const metric={unit_distance:'km',unit_currency:'GBP',unit_speed:'kmh',unit_temperature:'celsius'};
const imperial={unit_distance:'mi',unit_currency:'USD',unit_speed:'mph',unit_temperature:'fahrenheit'};
const route={id:1,name:'Unchanged',route_id:1,distance_km:16.09344,duration_minutes:20,fuel_cost:10,toll_cost:2,caz_cost:0,total_cost:12,cost_per_km:1,hazard_count:0};
function restore(value){localStorage.setItem('voyagr_all_settings',JSON.stringify(value));return Settings.loadAllSettings();}
function fmt(){return {distanceText:Pref.convertDistance(route.distance_km),distUnit:Pref.getDistanceUnit(),currencySymbol:Pref.getCurrencySymbol(),routeColor:'#765432'};}
beforeEach(()=>{
    localStorage.clear();oldFetch=global.fetch;global.fetch=jest.fn();widget=jest.fn();
    Pref.setDistanceUnitValue('km');Pref.setCurrencyUnitValue('GBP');Pref.setSpeedUnitValue('kmh');Pref.setTemperatureUnitValue('celsius');
    document.body.innerHTML='<select id="distanceUnit"><option>km</option><option>mi</option></select><select id="currencyUnit"><option>GBP</option><option>USD</option><option>EUR</option></select><select id="speedUnit"><option>kmh</option><option>mph</option></select><select id="temperatureUnit"><option>celsius</option><option>fahrenheit</option></select><div id="totalDistance" data-distance-meters="16093.44" data-distance-style="route">16.09 km</div><div id="avgSpeed" data-speed-kmh="100">100.0 km/h</div><input id="end" value="Original destination">';
    Pref.bind({units:()=>Units,speedGps:()=>SG,speedLimitWidget:()=>SL,getCurrentSpeedLimitMph:()=>null,getLastDetectedRoadType:()=> 'residential',getLastSpeedLimitRegion:()=> 'uk',getCurrentGpsSpeedMph:()=>30,call:{getCurrentRoadType:()=> 'residential',updateSpeedWidget:widget,saveAllSettings:jest.fn(),showStatus:jest.fn()}});
    refresh=jest.fn(()=>Pref.refreshUnitDisplays());
    Settings.bind({settingsSnapshot:()=>Snapshot,getRouteInProgress:()=>false,setCurrentVehicleType:jest.fn(),setCurrentRoutingMode:jest.fn(),setDistanceUnit:Pref.setDistanceUnitValue,setCurrencyUnit:Pref.setCurrencyUnitValue,setSpeedUnit:Pref.setSpeedUnitValue,setTemperatureUnit:Pref.setTemperatureUnitValue,call:{refreshUnitDisplays:refresh}});
    jest.spyOn(console,'log').mockImplementation(()=>{});
});
afterEach(()=>{global.fetch=oldFetch;localStorage.clear();Pref.setDistanceUnitValue('mi');Pref.setCurrencyUnitValue('GBP');Pref.setSpeedUnitValue('mph');Pref.setTemperatureUnitValue('celsius');jest.restoreAllMocks();});
test('restoration refreshes all labels once after the unit fields are applied, without saving or acquisition',()=>{
    expect(restore(imperial)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.getElementById('totalDistance').textContent).toBe('10.00 mi');
    expect(document.getElementById('avgSpeed').textContent).toBe('62.1 mph');
    for(const [id,value] of [['distanceUnit','mi'],['currencyUnit','USD'],['speedUnit','mph'],['temperatureUnit','fahrenheit']])expect(document.getElementById(id).value).toBe(value);
    expect(widget).toHaveBeenLastCalledWith(30,null);
    expect(global.fetch).not.toHaveBeenCalled();expect(document.getElementById('end').value).toBe('Original destination');
    expect(localStorage.getItem('unit_distance')).toBe('mi');expect(Pref.getCurrencySymbol()).toBe('£');
});
test('already-mounted comparison/table/preview/saved/history/frequent rows refresh in place',()=>{
    const value=fmt();
    document.body.insertAdjacentHTML('beforeend',RS.buildRouteComparisonCardHtml(route,0,value));
    const table=document.createElement('table');table.innerHTML='<tbody>'+RS.buildRouteComparisonTableRowHtml(route,0,value)+'</tbody>';document.body.append(table);
    document.body.insertAdjacentHTML('beforeend',RS.buildPreviewAlternativeRouteCardHtml(route,0,value));
    document.body.insertAdjacentHTML('beforeend',Sharing.buildSavedRouteRowHtml(route,value));
    document.body.insertAdjacentHTML('beforeend',History.buildTripHistoryRowHtml({...route,start_address:'A',end_address:'B'},{startAddr:'A',endAddr:'B',dateStr:'Today',distance:value.distanceText,distUnit:'km',symbol:'£',totalCost:'12.00'}));
    document.body.insertAdjacentHTML('beforeend',History.buildFrequentRouteRowHtml({start:'A',end:'B',count:3,avg_distance:route.distance_km,avg_cost:12},0,value));
    const nodes=[...document.querySelectorAll('[data-distance-meters]')],canonical=nodes.map(node=>node.dataset.distanceMeters),original=JSON.stringify(route);
    expect(nodes).toHaveLength(7);
    expect(restore(imperial)).toBe(true);
    nodes.forEach(node=>expect(node.textContent).toBe('10.00 mi'));
    expect(restore(metric)).toBe(true);
    nodes.forEach(node=>{expect(node.isConnected).toBe(true);expect(node.textContent).toBe('16.09 km');});
    expect(nodes.map(node=>node.dataset.distanceMeters)).toEqual(canonical);expect(JSON.stringify(route)).toBe(original);
    expect(document.querySelector('button[onclick^="useRoute"]').getAttribute('onclick')).toContain('useRoute(0)');
    expect(global.fetch).not.toHaveBeenCalled();
});
test('invalid restored unit values preserve valid current preferences and storage',()=>{
    restore(metric);refresh.mockClear();
    expect(restore({unit_distance:'miles',unit_speed:'warp',unit_temperature:true,unit_currency:'XYZ'})).toBe(true);
    expect(Pref.getDistanceUnitValue()).toBe('km');expect(Pref.getSpeedUnitValue()).toBe('kmh');
    expect(localStorage.getItem('unit_currency')).toBe('GBP');expect(refresh).not.toHaveBeenCalled();
});
test.each(['km/h','kph'])('legacy speed preference %s restores to the supported selector value',alias=>{
    restore({unit_speed:alias});expect(Pref.getSpeedUnitValue()).toBe('kmh');expect(document.getElementById('speedUnit').value).toBe('kmh');
    expect(localStorage.getItem('unit_speed')).toBe('kmh');
});
test('display refresh cannot infer a posted speed limit from road class',()=>{
    const plan=SL.buildUpdateAllSpeedDisplaysExecutePlan({apiSpeedLimitMph:null,valhallaSpeedLimitMph:null,roadType:'motorway',region:'uk',gpsSpeedMph:40,speedUnit:'mph'});
    expect(plan.shownLimitMph).toBeNull();expect(plan.gpsSpeedMph).toBe(40);
});
test('a real local profile switch invokes restoration and updates existing labels',async()=>{
    const Profile=require('../app/profile-store-orchestration.js');
    localStorage.setItem('voyagr_all_settings',JSON.stringify(metric));
    localStorage.setItem('voyagr_profiles_v1',JSON.stringify({guest:{voyagr_all_settings:JSON.stringify(metric),savedRoutes:'[]'},metricTest:{voyagr_all_settings:JSON.stringify(imperial),savedRoutes:'[]'}}));
    Profile.bind({getSupabaseClient:()=>null,call:{loadAllSettings:()=>Settings.loadAllSettings(),applySettingsToUI:()=>{},loadSavedRoutes:()=>{}}});
    global.VoyagrLocalData={capture:()=>({owner:'guest',epoch:1}),switchOwner:()=>({owner:'sb:metricTest',epoch:2}),current:()=>true,ready:async()=>{},read:async()=>imperial,report:jest.fn()};
    await Profile.switchActiveProfile('sb:metricTest');
    expect(document.getElementById('totalDistance').textContent).toBe('10.00 mi');expect(Pref.getTemperatureUnitValue()).toBe('fahrenheit');
    expect(global.fetch).not.toHaveBeenCalled();
});
test('analytics owner retains canonical distance/speed for later restoration',()=>{
    const Analytics=require('../app/trip-history-orchestration.js');
    Analytics.bind({tripHistory:()=>History,getSpeedUnit:Pref.getSpeedUnitValue,call:{getCurrencySymbol:Pref.getCurrencySymbol,convertDistance:Pref.convertDistance,getSpeedUnitLabel:Pref.getSpeedUnit,getDistanceUnit:Pref.getDistanceUnit,escapeHtml:String}});
    const data={total_distance_km:16.09344,avg_speed:100,frequent_routes:[]};const original=JSON.stringify(data);
    Analytics.displayAnalytics(data);
    expect(document.getElementById('totalDistance').dataset.distanceMeters).toBe('16093.44');
    expect(document.getElementById('avgSpeed').dataset.speedKmh).toBe('100');
    restore(imperial);expect(document.getElementById('avgSpeed').textContent).toBe('62.1 mph');
    expect(JSON.stringify(data)).toBe(original);
    Analytics.displayAnalytics({frequent_routes:[]});
    expect(document.getElementById('avgSpeed').hasAttribute('data-speed-kmh')).toBe(false);
});
test('invalid standalone stored units fall back to supported startup values',()=>{
    localStorage.setItem('unit_distance','bad');localStorage.setItem('unit_speed','warp');localStorage.setItem('unit_temperature','Kelvin');localStorage.setItem('unit_currency','??');
    const previous=global.VoyagrUnitsPreferencesOrchestration;let fresh;
    try{
        jest.isolateModules(()=>{fresh=require('../app/units-preferences-orchestration.js');});
        expect([fresh.getDistanceUnitValue(),fresh.getSpeedUnitValue(),fresh.getTemperatureUnitValue(),fresh.getCurrencyUnitValue()]).toEqual(['mi','mph','celsius','GBP']);
    }finally{global.VoyagrUnitsPreferencesOrchestration=previous;}
});
test.each([true,false])('unit controls dispatch one change with inline handler=%s',inline=>{
    const fs=require('fs'),path=require('path');
    const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
    const setupSource=source.slice(source.indexOf('function setupEventListeners()'),source.indexOf('// Initialize app when DOM is ready'));
    const handler=jest.fn();const controls=['distanceUnit','currencyUnit','speedUnit','temperatureUnit'];
    controls.forEach(id=>{const el=document.getElementById(id);if(inline){el.setAttribute('onchange','handler()');el.onchange=handler;}});
    const setup=Function('document','console','updateDistanceUnit','updateCurrencyUnit','updateSpeedUnit','updateTemperatureUnit',setupSource+';return setupEventListeners;')(document,console,handler,handler,handler,handler);
    setup();controls.forEach(id=>document.getElementById(id).dispatchEvent(new Event('change')));
    expect(handler).toHaveBeenCalledTimes(4);
});
