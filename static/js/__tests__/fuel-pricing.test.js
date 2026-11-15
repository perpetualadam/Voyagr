const fs = require('fs');
const path = require('path');
const prefs = require('../modules/navigation/route-prefs');
const snapshots = require('../modules/navigation/settings-snapshot');
const sharing = require('../modules/navigation/route-sharing');
const controls = require('../app/fuel-pricing-controls');
const profiles = require('../app/profile-store-orchestration');
const template = fs.readFileSync(path.join(__dirname, '../../../templates/index.html'), 'utf8');

describe('fuel price selection and saved provenance', () => {
    beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
    test('automatic omits the fixed price, requires an explicit category and preserves EV tariff', () => {
        expect(prefs.getRouteCostParams('petrol_diesel', localStorage)).toEqual({fuel_efficiency:6.5, energy_efficiency:18.5, electricity_price:.32, fuel_price_mode:'automatic', fuel_category:''});
        localStorage.setItem('fuelPricing', JSON.stringify({mode:'automatic', category:'diesel', manualPrice:1.5}));
        localStorage.setItem('fuelPrice', '1.5');
        const body = prefs.getRouteCostParams('electric', localStorage);
        expect(body).not.toHaveProperty('fuel_price');
        expect(body.fuel_category).toBe('diesel');
        expect(body.electricity_price).toBe(.32);
    });
    test('legacy saved price remains manual until explicitly opting into automatic', () => {
        localStorage.setItem('fuelPrice', '1.99');
        expect(prefs.getRouteCostParams('petrol_diesel', localStorage)).toMatchObject({fuel_price:1.99, fuel_price_mode:'manual'});
        delete global.VoyagrLocalData;
        localStorage.setItem('fuelPricing', JSON.stringify({mode:'automatic', category:'petrol', manualPrice:1.99}));
        expect(prefs.getRouteCostParams('petrol_diesel', localStorage)).not.toHaveProperty('fuel_price');
        expect(localStorage.getItem('fuelPrice')).toBe('1.99');
    });
    test.each(['NaN', 'Infinity', '-1', 'abc', '', '1000'])('invalid legacy manual price %s is not turned into a default', value => {
        localStorage.setItem('fuelPrice', value);
        expect(prefs.getRouteCostParams('petrol_diesel', localStorage)).toMatchObject({fuel_price:null, fuel_price_mode:'manual'});
        delete global.VoyagrLocalData;
    });
    test('settings serialize and restore the selection and preserved manual price', () => {
        const selection = {mode:'automatic', category:'diesel', manualPrice:1.88};
        const input = snapshots.buildSettingsSnapshotInputPlan({fuelPricing:selection}, {});
        const snapshot = snapshots.buildSettingsSnapshot(input);
        expect(JSON.parse(snapshots.buildSettingsRestorePlan(snapshot).localStorage.fuelPricing)).toEqual(selection);
        expect(snapshots.buildSettingsRestorePlan({fuelPricing:{mode:'evil', category:'diesel', manualPrice:1}}).localStorage).not.toHaveProperty('fuelPricing');
    });
    test('saved route carries its original quote through restore after settings change', () => {
        const quote = {source:'DESNZ_WEEKLY', observation_date:'2026-11-02', price_gbp_per_l:'1.7278'};
        const route = {fuel_cost:12.34, fuel_pricing:quote};
        const saved = sharing.buildSaveCurrentRoutePlan({lastCalculatedRoute:route, routeName:'Original', now:1}).savedRoute;
        localStorage.setItem('fuelPricing', JSON.stringify({mode:'manual', category:'diesel', manualPrice:2}));
        quote.price_gbp_per_l = '9';
        const restored = sharing.buildUseSavedRoutePlan(1, [saved]);
        expect(restored.lastCalculatedRoutePatch.fuel_pricing.price_gbp_per_l).toBe('1.7278');
        expect(restored.lastCalculatedRoutePatch.fuel_cost).toBe(12.34);
        expect(restored.lastCalculatedRoutePatch.navigation_resume_requires_fresh_gps).toBe(true);
    });
    test('controls preserve manual price on auto switch and never trigger route/GPS fetches', () => {
        document.body.innerHTML = template.match(/<details id="fuelPricingControls"[\s\S]*?<\/details>/)[0];
        const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => { throw Error('No fetch'); });
        global.saveAllSettings = jest.fn();
        localStorage.setItem('fuelPrice', '1.89');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        expect(document.getElementById('manualFuelPrice').value).toBe('1.89');
        const mode = document.getElementById('fuelPriceMode');
        mode.value = 'automatic'; mode.dispatchEvent(new Event('change', {bubbles:true}));
        expect(JSON.parse(localStorage.getItem('fuelPricing'))).toEqual({mode:'automatic', category:'', manualPrice:1.89});
        expect(document.getElementById('manualFuelPriceGroup').hidden).toBe(true);
        mode.value = 'manual'; mode.dispatchEvent(new Event('change', {bubbles:true}));
        expect(prefs.getRouteCostParams('petrol_diesel', localStorage).fuel_price).toBe(1.89);
        expect(fetch).not.toHaveBeenCalled();
        fetch.mockRestore(); delete global.saveAllSettings;
    });
    test('preview distinguishes observed average, fallback, manual and missing historic source safely', () => {
        document.body.innerHTML = '<p id="previewFuelPricingNotice"></p>';
        controls.showQuote({fuel_pricing:{source:'DESNZ_WEEKLY', category:'petrol', currency:'GBP', price_unit:'GBP/L', price_gbp_per_l:'1.7278', observation_date:'2026-11-02'}});
        expect(document.body.textContent).toContain('observed 2026-11-02');
        expect(document.body.textContent).toContain('£1.7278/L');
        expect(document.body.textContent).toContain('Not a local pump quote');
        controls.showQuote({fuel_pricing:{source:'CONFIGURED_FALLBACK', fallback_reason:'CATEGORY_REQUIRED', currency:'GBP', price_unit:'GBP/L', price_gbp_per_l:1.6}});
        expect(document.body.textContent).toContain('Choose petrol or diesel');
        expect(controls.quoteText({source:'MANUAL', currency:'GBP', price_unit:'GBP/L', price_gbp_per_l:1.2})).toContain('Manual fuel price');
        controls.showQuote({}); expect(document.body.textContent).toContain('source unavailable');
        expect(controls.quoteText({price_gbp_per_l:'<img src=x onerror=alert(1)>'})).toContain('source unavailable');
        expect(document.querySelector('img')).toBeNull();
    });
    test('switching profiles isolates selections and preserves owner-scoped manual price', async () => {
        global.VoyagrRoutePrefs = prefs;
        profiles.bind({getSupabaseClient:()=>null, call:{loadAllSettings:()=>{}, applySettingsToUI:()=>{}, loadSavedRoutes:()=>{}}});
        let owner='guest';const snapshots={guest:{fuelPricing:{mode:'manual',category:'',manualPrice:1.77}}};
        global.VoyagrLocalData={capture:()=>({owner}),switchOwner:id=>{owner=id;return {owner:id};},current:c=>c.owner===owner,ready:async()=>{},read:async()=>snapshots[owner]||{},update:async(_category,fn,c)=>{snapshots[c.owner]=fn(snapshots[c.owner]);},report:jest.fn()};
        await profiles.switchActiveProfile('sb:another');
        expect(prefs.getFuelPricingSettings(localStorage)).toEqual({mode:'automatic', category:'', manualPrice:null});
        await profiles.switchActiveProfile('guest');
        expect(prefs.getRouteCostParams('petrol_diesel', localStorage)).toMatchObject({fuel_price:1.77, fuel_price_mode:'manual'});
        delete global.VoyagrLocalData;
    });
});
