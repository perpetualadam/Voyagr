/**
 * Tests for modules/navigation/search-autocomplete.js
 */
const SA = require('../modules/navigation/search-autocomplete.js');
const { escapeHtml } = require('../modules/util/html.js');

describe('search-autocomplete module', () => {
    test('getLocationIcon maps known types', () => {
        expect(SA.getLocationIcon({ type: 'house' })).toBe('🏠');
        expect(SA.getLocationIcon({ type: 'postcode' })).toBe('📫');
        expect(SA.getLocationIcon({ type: 'fuel' })).toBe('⛽');
        expect(SA.getLocationIcon({ category: 'hospital' })).toBe('🏥');
        expect(SA.getLocationIcon({ class: 'shop', type: 'supermarket' })).toBe('🛍️');
        expect(SA.getLocationIcon({ type: 'poi', class: 'office' })).toBe('🏢');
        expect(SA.getLocationIcon({ class: 'amenity', type: 'fuel' })).toBe('⛽');
        expect(SA.getLocationIcon({ type: 'hotel' })).toBe('🏨');
        expect(SA.getLocationIcon({ class: 'tourism', type: 'hotel' })).toBe('🏨');
        expect(SA.getLocationIcon({ class: 'tourism', type: 'museum' })).toBe('🏛️');
        expect(SA.getLocationIcon({ class: 'tourism', type: 'attraction' })).toBe('📍');
        expect(SA.getLocationIcon({ class: 'tourism', type: 'viewpoint' })).toBe('📍');
        expect(SA.getLocationIcon({ class: 'tourism', type: 'zoo' })).toBe('📍');
        expect(SA.getLocationIcon({ class: 'tourism', type: 'camp_site' })).toBe('📍');
        expect(SA.getLocationIcon({})).toBe('📍');
    });

    test('buildAutocompleteNoResultsHtml uses default message', () => {
        const html = SA.buildAutocompleteNoResultsHtml();
        expect(html).toContain('autocomplete-no-results');
        expect(html).toContain('Type at least 2 letters');
    });

    test('buildRecentDestinationItemHtml escapes label and shows route kind', () => {
        const html = SA.buildRecentDestinationItemHtml(
            { label: '<script>', kind: 'route' },
            { escapeHtml }
        );
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('Used in a route');
        expect(html).toContain('🕐');
    });

    test('buildServerSearchHistoryItemHtml returns coords when present', () => {
        const built = SA.buildServerSearchHistoryItemHtml(
            { query: 'London', result_name: 'London, UK', lat: '51.5', lon: '-0.1' },
            { escapeHtml: (s) => s }
        );
        expect(built.hasCoords).toBe(true);
        expect(built.lat).toBeCloseTo(51.5);
        expect(built.lon).toBeCloseTo(-0.1);
        expect(built.html).toContain('London');
        expect(built.html).toContain('London, UK');
    });

    test('buildServerSearchHistoryItemHtml omits address when coords missing', () => {
        const built = SA.buildServerSearchHistoryItemHtml(
            { query: 'Paris', result_name: 'Paris, France' },
            { escapeHtml: (s) => s }
        );
        expect(built.hasCoords).toBe(false);
        expect(built.html).not.toContain('Paris, France');
    });

    test('buildGeocodeAutocompleteItemHtml includes icon, name, and address', () => {
        const html = SA.buildGeocodeAutocompleteItemHtml('🏠', '10 High St', 'High St, Town');
        expect(html).toContain('🏠');
        expect(html).toContain('10 High St');
        expect(html).toContain('High St, Town');
    });

    test('buildAutocompleteLoadingHtml and status message constants', () => {
        expect(SA.buildAutocompleteLoadingHtml(SA.AUTOCOMPLETE_SEARCHING_TEXT)).toContain('autocomplete-loading');
        expect(SA.AUTOCOMPLETE_SEARCH_FAILED_MESSAGE).toContain('Search failed');
    });

    test('resolveGeocodeResultDisplayName prefixes house number and truncates address', () => {
        expect(SA.resolveGeocodeResultDisplayName({
            name: 'High Street',
            address: { house_number: '10', road: 'High Street' },
        })).toBe('10 High Street');
        expect(SA.resolveGeocodeResultDisplayName({
            type: 'postcode',
            address: { postcode: 'SW1A 1AA' },
            display_name: 'SW1A 1AA, Westminster, United Kingdom',
        })).toBe('SW1A 1AA');
        expect(SA.resolveGeocodeResultDisplayName({
            name: 'Tesco Express',
            class: 'shop',
            type: 'supermarket',
            address: { house_number: '12', road: 'Briggate' },
            display_name: 'Tesco Express, 12 Briggate, Leeds',
        })).toBe('Tesco Express');
        const longName = 'x'.repeat(80);
        expect(SA.resolveGeocodeResultShortAddress({ display_name: longName }, 60)).toBe('x'.repeat(60) + '...');
    });
});
