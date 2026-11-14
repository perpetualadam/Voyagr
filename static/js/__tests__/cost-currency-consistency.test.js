// Persistence boundary is device-only; conversion assertions below remain unchanged.
beforeEach(()=>{global.VoyagrLocalData={preferenceRequest:jest.fn(options=>global.fetch('/device-preferences',options))};});
afterEach(()=>{delete global.VoyagrLocalData;});
const Units=require('../modules/navigation/units.js');
const Pref=require('../app/units-preferences-orchestration.js');
const Snapshot=require('../modules/navigation/settings-snapshot.js');
const Selection=require('../modules/navigation/route-selection.js');
let previousFetch,save,status;
beforeEach(()=>{
    previousFetch=global.fetch;global.fetch=jest.fn().mockResolvedValue({ok:true});save=jest.fn();status=jest.fn();
    Pref.setCurrencyUnitValue('GBP');
    Pref.bind({units:()=>Units,call:{saveAllSettings:save,showStatus:status}});
    document.body.innerHTML='<select id="currencyUnit"><option value="GBP">GBP</option><option value="USD">USD</option><option value="EUR">EUR</option></select><span id="fuelCost" data-value="12.40">£12.40</span><span id="tollCost" data-value="3.00">£3.00</span><span id="cazCost" data-value="10.00">£10.00</span>';
});
afterEach(()=>{global.fetch=previousFetch;Pref.setCurrencyUnitValue('GBP');localStorage.clear();});
function change(currency){document.getElementById('currencyUnit').value=currency;Pref.updateCurrencyUnit();}
test.each(['USD','EUR'])('preferred %s does not relabel unconverted GBP totals',currency=>{
    const before=[...document.querySelectorAll('[data-value]')].map(el=>el.dataset.value);
    change(currency);
    expect(document.getElementById('fuelCost').textContent).toBe('£12.40');
    expect(document.getElementById('tollCost').textContent).toBe('£3.00');
    expect(document.getElementById('cazCost').textContent).toBe('£10.00');
    expect([...document.querySelectorAll('[data-value]')].map(el=>el.dataset.value)).toEqual(before);
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('conversion is unavailable'),'warning');
    expect(Pref.getCurrencyUnitValue()).toBe(currency);expect(localStorage.getItem('unit_currency')).toBe(currency);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).currency_unit).toBe(currency);
    expect(save).toHaveBeenCalledTimes(1);
});
test('GBP round-trip retains source amounts and never requests rates or recalculates',()=>{
    change('USD');change('EUR');change('GBP');
    expect(Pref.getCurrencySymbol()).toBe('£');expect(document.getElementById('fuelCost').dataset.value).toBe('12.40');
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Cost estimates are in GBP'),'success');
    expect(global.fetch.mock.calls.map(([url])=>url)).toEqual(['/device-preferences','/device-preferences','/device-preferences']);
});
test('a restored currency preference stays a preference, not conversion authority',()=>{
    const saved={unit_currency:'USD',unit_distance:'mi'};
    const restore=Snapshot.buildSettingsRestorePlan(saved);
    Pref.setCurrencyUnitValue(restore.runtime.currencyUnit);Pref.updateAllCostDisplays();
    expect(Pref.getCurrencyUnitValue()).toBe('USD');expect(Pref.getCurrencySymbol()).toBe('£');
    expect(document.getElementById('fuelCost').textContent).toBe('£12.40');
    expect(saved).toEqual({unit_currency:'USD',unit_distance:'mi'});expect(global.fetch).not.toHaveBeenCalled();
});
test('cost presentation is explicit while ISO symbol utility remains available',()=>{
    expect(Units.getCurrencySymbol('USD')).toBe('$');expect(Units.getCurrencySymbol('EUR')).toBe('€');
    expect(Units.getCostCurrencyPresentation('usd')).toMatchObject({requestedCurrency:'USD',sourceCurrency:'GBP',displayCurrency:'GBP',conversionApplied:false,conversionStatus:'UNAVAILABLE',symbol:'£'});
    expect(Units.getCostCurrencyPresentation('GBP').conversionStatus).toBe('NOT_REQUIRED');
    expect(Units.getCostCurrencyPresentation('unknown').requestedCurrency).toBe('GBP');
});
test('invalid select value cannot overwrite a saved preference',()=>{
    change('USD');global.fetch.mockClear();save.mockClear();change('invalid');
    expect(Pref.getCurrencyUnitValue()).toBe('USD');expect(localStorage.getItem('unit_currency')).toBe('USD');
    expect(global.fetch).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
test.each(['USD','EUR'])('route summary, comparison and share keep source currency with preference %s',currency=>{
    Pref.setCurrencyUnitValue(currency);
    const route={name:'Test route',distance_km:10,duration_minutes:20,fuel_cost:12.4,toll_cost:3,caz_cost:10,hazard_count:0};
    const original=JSON.stringify(route);
    const fmt={currencySymbol:Pref.getCurrencySymbol(),distanceText:'6.21',distUnit:'mi',startLabel:'A',endLabel:'B',routeColor:'#765432'};
    const values=Selection.buildTripInfoDisplayValues(route,fmt);
    expect(values.fuelCostText).toBe('£12.40');expect(values.tollCostText).toBe('£3.00');
    const card=Selection.buildRouteComparisonCardHtml(route,0,fmt);
    expect(card).toContain('£25.40');expect(card).not.toMatch(/\$|€/);
    const share=require('../modules/navigation/route-sharing.js').buildShareWhatsAppMessage(route,fmt);
    expect(share).toContain('Cost: £25.40');expect(share).not.toMatch(/\$|€/);
    expect(JSON.stringify(route)).toBe(original);
});
