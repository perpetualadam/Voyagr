/** Exercise real location selection: private values must reach the UI, never the console. */
const owner = require('../app/geocoding-orchestration');

afterEach(() => jest.restoreAllMocks());

test.each(['start', 'end', 'drivingArrival'])('%s selection preserves exact destination without logging it', field => {
    document.body.innerHTML = `<input id="${field}"><div id="autocompleteStart"></div><div id="autocompleteEnd"></div>`;
    const logs = ['log', 'warn', 'error'].map(level => jest.spyOn(console, level).mockImplementation(() => {}));
    const recent = jest.fn();
    owner.bind({call: {recordRecentDestination: recent, showStatus: jest.fn()}});
    owner.selectAutocompleteResult(field, 53.51234567, -1.12345678, 'Private house sentinel');
    const input = document.getElementById(field);
    expect(input.value).toBe('Private house sentinel');
    expect(input.dataset.lat).toBe('53.51234567');
    expect(input.dataset.lon).toBe('-1.12345678');
    if (field !== 'drivingArrival') expect(recent).toHaveBeenCalledWith('Private house sentinel', 53.51234567, -1.12345678, 'search');
    const output = JSON.stringify(logs.flatMap(log => log.mock.calls));
    expect(output).not.toContain('Private house sentinel');
    expect(output).not.toContain('53.51234567');
    expect(output).not.toContain('-1.12345678');
});

test('malformed cached location data does not escape through exception logging', () => {
    const privateValue = 'Private-address-sentinel';
    localStorage.setItem('voyagr_geocoding_cache', privateValue);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    owner.initGeocodeCache();
    expect(JSON.stringify(log.mock.calls)).not.toContain(privateValue);
    localStorage.removeItem('voyagr_geocoding_cache');
});

test('geocoding fetch and cache preserve results without logging query or coordinates', async () => {
    const GL = require('../modules/navigation/geocoding-locations');
    localStorage.clear();
    owner.initGeocodeCache();
    owner.bind({geocodingLocations: () => GL});
    const logs = ['log', 'warn', 'error'].map(level => jest.spyOn(console, level).mockImplementation(() => {}));
    const result = {lat: '53.51234567', lon: '-1.12345678', display_name: 'Private destination sentinel'};
    const previousFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => [result]});
    try {
        const first = await owner.geocodeAddress('Private destination sentinel');
        const cached = await owner.geocodeAddress('Private destination sentinel');
        expect(first.lat).toBe(53.51234567);
        expect(first.cached).toBe(false);
        expect(cached).toEqual({...first, cached: true});
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch.mock.calls[0][0]).toContain('Private%20destination%20sentinel');
        const output = JSON.stringify(logs.flatMap(log => log.mock.calls));
        for (const value of ['Private destination sentinel', '53.51234567', '-1.12345678']) expect(output).not.toContain(value);
    } finally {
        global.fetch = previousFetch;
        localStorage.clear();
    }
});
