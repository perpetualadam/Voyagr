/**
 * Tests for modules/navigation/poi-search.js
 */
const POI = require('../modules/navigation/poi-search.js');

describe('poi-search module', () => {
    test('getPoiTypeIcon and formatPoiTypeTitle', () => {
        expect(POI.getPoiTypeIcon('fuel')).toBe('⛽');
        expect(POI.formatPoiTypeTitle('groceries')).toBe('Groceries');
        expect(POI.formatPoiTypeTitle('parking')).toBe('Parking');
    });

    test('buildPoiResultItemHtml includes navigate button', () => {
        const html = POI.buildPoiResultItemHtml(
            { name: "Joe's Cafe", lat: 51.5, lon: -0.1, distance_m: 400, address: '1 High St' },
            { icon: '🍽️', distanceText: '400 m', userLat: 51.51, userLon: -0.11 }
        );
        expect(html).toContain("Joe's Cafe");
        expect(html).toContain('selectPOI');
        expect(html).toContain('Navigate Here');
    });

    test('buildPoiResultsModalHtml wraps result list with close control', () => {
        const html = POI.buildPoiResultsModalHtml(
            [{ name: 'Shell', lat: 1, lon: 2, distance_m: 500 }],
            'fuel',
            { userLat: 1.1, userLon: 2.1, distanceTexts: ['500 m'] }
        );
        expect(html).toContain('poiModal');
        expect(html).toContain('closePOIModal');
        expect(html).toContain('Nearby Fuel');
    });

    test('map marker helpers use burger icon for food and build popup', () => {
        expect(POI.getPoiMapMarkerIcon('food')).toBe('🍔');
        expect(POI.getPoiTypeIcon('food')).toBe('🍽️');
        expect(POI.getPoiMapMarkerStyleCssText()).toContain('font-size: 24px');
        const popup = POI.buildPoiMapMarkerPopupHtml({
            name: 'Cafe',
            address: '1 High St',
            distance_m: 1500,
            phone: '01234',
        });
        expect(popup).toContain('Cafe');
        expect(popup).toContain('1.5 km away');
        expect(popup).toContain('tel:01234');
    });

    test('along-route search helpers', () => {
        expect(POI.canSearchAlongRoute(2)).toBe(true);
        expect(POI.canSearchAlongRoute(1)).toBe(false);
        expect(POI.toggleAlongRouteCategoriesDisplay('none')).toBe('block');
        expect(POI.buildAlongRouteSearchBody([[51, 0]], 'fuel').type).toBe('fuel');
        expect(POI.getAlongRouteNoRouteMessage()).toContain('Calculate');
        expect(POI.getAlongRouteResultsMessage('fuel', 3)).toContain('3');
    });
});
