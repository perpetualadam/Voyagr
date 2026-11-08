const U=require('../modules/navigation/units.js');
const Pref=require('../app/units-preferences-orchestration.js');
const RS=require('../modules/navigation/route-selection.js');
const RP=require('../modules/navigation/route-prefs.js');
const Snapshot=require('../modules/navigation/settings-snapshot.js');
let oldFetch,status;
const route={route_id:1,distance_km:100,duration_minutes:90,total_cost:20,cost_per_km:0.2};
beforeEach(()=>{
    oldFetch=global.fetch;global.fetch=jest.fn().mockResolvedValue({ok:true});status=jest.fn();
    Pref.setDistanceUnitValue('km');Pref.setCurrencyUnitValue('GBP');Pref.setTemperatureUnitValue('celsius');
    Pref.bind({units:()=>U,call:{saveAllSettings:jest.fn(),showStatus:status}});
    document.body.innerHTML='<select id="distanceUnit"><option>km</option><option>mi</option></select><select id="temperatureUnit"><option>celsius</option><option>fahrenheit</option></select><div id="report"></div>';
});
afterEach(()=>{global.fetch=oldFetch;localStorage.clear();Pref.setDistanceUnitValue('mi');Pref.setTemperatureUnitValue('celsius');});
function distance(unit){document.getElementById('distanceUnit').value=unit;Pref.updateDistanceUnit();}
test.each([[0.2,'£0.20','£0.32'],[1,'£1.00','£1.61'],[0,'£0.00','£0.00']])('rate %s converts per kilometre to per mile, not the inverse', (rate,km,mile)=>{
    expect(U.formatCostPerDistance(rate,'km','£')).toBe(km);expect(U.formatCostPerDistance(rate,'mi','£')).toBe(mile);
});
test.each([null,undefined,'',true,{},NaN,Infinity,-1])('invalid rate %s is unknown',value=>{
    expect(U.formatCostPerDistance(value,'mi','£')).toBe('—');
});
test('actual comparison table starts in miles and refreshes metric/imperial in place without altering costs',()=>{
    Pref.setDistanceUnitValue('mi');
    const original=JSON.stringify(route);
    document.getElementById('report').innerHTML=RS.buildRouteComparisonTableHtml([route],{distUnit:'mi',distanceText:'62.14',currencySymbol:Pref.getCurrencySymbol()});
    const rate=document.querySelector('[data-cost-per-km]'),header=document.querySelector('[data-cost-distance-unit]');
    expect(header.textContent).toBe('Cost/mi');expect(rate.textContent).toBe('£0.32');
    expect(document.querySelector('strong').textContent).toContain('Route 1');
    distance('km');expect(header.textContent).toBe('Cost/km');expect(rate.textContent).toBe('£0.20');
    distance('mi');expect(header.textContent).toBe('Cost/mi');expect(rate.textContent).toBe('£0.32');
    expect(rate.isConnected).toBe(true);expect(rate.dataset.costPerKm).toBe('0.2');
    expect(JSON.stringify(route)).toBe(original);expect(document.querySelector('tbody').textContent).toContain('£20.00');
    expect(global.fetch.mock.calls.every(([url])=>url==='/api/app-settings')).toBe(true);
});
test('unknown cost rate stays unknown on either side of a distance change',()=>{
    document.getElementById('report').innerHTML=RS.buildRouteComparisonTableHtml([{...route,cost_per_km:null}],{distUnit:'km',distanceText:'100.00',currencySymbol:'£'});
    const cell=document.querySelector('tbody tr').lastElementChild;expect(cell.textContent).toBe('—');
    distance('mi');expect(cell.textContent).toBe('—');
});
test('fuel conversion explicitly identifies US gallons while preserving canonical cost inputs',()=>{
    localStorage.setItem('fuelEfficiency','6.5');localStorage.setItem('fuelPrice','1.60');localStorage.setItem('energyEfficiency','18.5');localStorage.setItem('electricityPrice','0.32');
    const before=RP.getRouteCostParams('petrol_diesel',localStorage);
    expect(Pref.getFuelEfficiencyInUnits(before.fuel_efficiency)).toBe('6.5');expect(Pref.getFuelEfficiencyLabel()).toBe('L/100km');
    distance('mi');expect(Pref.getFuelEfficiencyInUnits(before.fuel_efficiency)).toBe('36.2');expect(Pref.getFuelEfficiencyLabel()).toBe('MPG (US)');
    expect(RP.getRouteCostParams('petrol_diesel',localStorage)).toEqual(before);
    expect(RP.getRouteCostParams('electric',localStorage).energy_efficiency).toBe(18.5);
});
test.each([0,-1,null,'',true,NaN,Infinity,1e-308])('invalid or overflowing fuel economy %s cannot display zero/infinite MPG',value=>{
    expect(U.getFuelEfficiencyInUnits(value,'mi')).toBe('—');
});
test.each([[0,'32.0'],[-40,'-40.0'],[100,'212.0']])('temperature %s Celsius converts to Fahrenheit %s', (c,f)=>{
    expect(U.convertTemperature(c,'fahrenheit')).toBe(f);expect(U.convertTemperature(c,'celsius')).toBe(Number(c).toFixed(1));
});
test.each([null,undefined,'',true,{},NaN,Infinity,1e308])('missing/invalid or overflowing temperature %s is unknown, not freezing',value=>{
    expect(U.convertTemperature(value,'fahrenheit')).toBe('—');
});
test('temperature setting round-trip persists without weather tile/provider calls or cost changes',()=>{
    const before=JSON.stringify(route);
    document.getElementById('temperatureUnit').value='fahrenheit';Pref.updateTemperatureUnit();
    expect(localStorage.getItem('unit_temperature')).toBe('fahrenheit');expect(Pref.convertTemperature(0)).toBe('32.0');
    const restore=Snapshot.buildSettingsRestorePlan({unit_temperature:'celsius'});Pref.setTemperatureUnitValue(restore.runtime.temperatureUnit);
    expect(Pref.convertTemperature(0)).toBe('0.0');expect(JSON.stringify(route)).toBe(before);
    expect(global.fetch.mock.calls.map(([url])=>url)).toEqual(['/api/app-settings']);
});
