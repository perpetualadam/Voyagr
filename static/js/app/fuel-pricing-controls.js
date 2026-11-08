/** Fuel-price controls change future requests only; never reprice an open journey. */
(function (root) {
    'use strict';
    function sync() {
        var panel = document.getElementById('fuelPricingControls');
        if (!panel || !root.VoyagrRoutePrefs) return;
        var settings = root.VoyagrRoutePrefs.getFuelPricingSettings(localStorage);
        document.getElementById('fuelPriceMode').value = settings.mode;
        document.getElementById('fuelCategory').value = settings.category;
        document.getElementById('manualFuelPrice').value = settings.manualPrice == null ? '' : settings.manualPrice;
        document.getElementById('manualFuelPriceGroup').hidden = settings.mode !== 'manual';
    }
    function save() {
        var mode = document.getElementById('fuelPriceMode').value;
        var category = document.getElementById('fuelCategory').value;
        var input = document.getElementById('manualFuelPrice');
        var raw = input.value.trim(), price = raw ? Number(raw) : NaN;
        var valid = Number.isFinite(price) && price >= 0 && price <= 100;
        input.setCustomValidity(mode === 'manual' && !valid ? 'Enter a valid price in pounds per litre.' : '');
        var previous = root.VoyagrRoutePrefs.getFuelPricingSettings(localStorage);
        var settings = {mode: mode, category: category, manualPrice: valid ? price : previous.manualPrice};
        if (mode === 'manual' && !valid) {
            document.getElementById('manualFuelPriceGroup').hidden = false;
            input.reportValidity();
            return;
        }
        try {
            localStorage.setItem('fuelPricing', JSON.stringify(settings));
            if (typeof root.saveAllSettings === 'function') root.saveAllSettings();
            document.getElementById('fuelPricingHelp').textContent = 'Saved for your next calculation. Automatic uses a dated UK average when available; otherwise a configured estimate. This is not a local pump quote.';
        } catch (_e) {
            document.getElementById('fuelPricingHelp').textContent = 'Could not save fuel pricing. Your previous choice is retained.';
        }
        sync();
    }
    function quoteText(quote) {
        if (!quote || typeof quote !== 'object') return 'Fuel-price source unavailable for this saved estimate.';
        if (quote.source === 'NOT_APPLICABLE') return 'Fuel pricing does not apply to this travel mode. Electric costs use the electricity tariff.';
        var rawPrice = quote.price_gbp_per_l;
        var price = typeof rawPrice === 'number' || typeof rawPrice === 'string' && rawPrice.trim() ? Number(rawPrice) : NaN;
        if (quote.currency !== 'GBP' || quote.price_unit !== 'GBP/L' || !Number.isFinite(price) || price < 0) return 'Fuel-price source unavailable for this estimate.';
        var rate = '£' + price.toFixed(4) + '/L';
        if (quote.source === 'DESNZ_WEEKLY' && /^\d{4}-\d{2}-\d{2}$/.test(quote.observation_date)) return 'UK weekly ' + (quote.category === 'diesel' ? 'diesel' : 'petrol') + ' average: ' + rate + ' · observed ' + quote.observation_date + '. Not a local pump quote.';
        if (quote.source === 'MANUAL') return 'Manual fuel price: ' + rate + '. Estimate saved with this journey.';
        if (quote.source !== 'CONFIGURED_FALLBACK') return 'Fuel-price source unavailable for this estimate.';
        return 'Configured fuel estimate: ' + rate + '. ' + (quote.fallback_reason === 'CATEGORY_REQUIRED' ? 'Choose petrol or diesel to use automatic pricing.' : 'A current weekly average was unavailable.');
    }
    function showQuote(route) {
        var node = document.getElementById('previewFuelPricingNotice');
        if (node) node.textContent = quoteText(route && route.fuel_pricing);
    }
    root.VoyagrFuelPricingControls = {sync: sync, showQuote: showQuote, quoteText: quoteText};
    if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () {
        sync();
        var panel = document.getElementById('fuelPricingControls');
        if (panel) panel.addEventListener('change', save);
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.VoyagrFuelPricingControls;
})(typeof globalThis !== 'undefined' ? globalThis : this);
