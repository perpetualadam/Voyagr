/**
 * Tests for modules/navigation/units.js
 * Asserts pure unit-conversion math (no DOM/globals).
 */
const U = require('../modules/navigation/units.js');

describe('units module surface', () => {
    const fns = ['convertDistance', 'getDistanceUnit', 'convertTemperature',
        'getTemperatureUnit', 'getFuelEfficiencyInUnits', 'getFuelEfficiencyLabel',
        'distanceUnitStatusLabel', 'speedUnitStatusLabel', 'temperatureUnitStatusLabel',
        'formatRemainingDistanceText', 'formatPoiDistanceMeters'];
    test('exposes all expected functions', () => {
        fns.forEach(fn => expect(typeof U[fn]).toBe('function'));
    });
});

describe('convertDistance', () => {
    test('km unit returns fixed-2 km string', () => {
        expect(U.convertDistance(10.5, 'km')).toBe('10.50');
    });
    test('mi unit converts and returns fixed-2 miles string', () => {
        const result = parseFloat(U.convertDistance(1.609344, 'mi'));
        expect(result).toBeCloseTo(1.00, 1);
    });
});

describe('getDistanceUnit', () => {
    test('mi → "mi"', () => expect(U.getDistanceUnit('mi')).toBe('mi'));
    test('km → "km"', () => expect(U.getDistanceUnit('km')).toBe('km'));
    test('unknown → "km"', () => expect(U.getDistanceUnit('unknown')).toBe('km'));
});

describe('convertTemperature', () => {
    test('celsius returns same as string', () => {
        expect(U.convertTemperature(100, 'celsius')).toBe('100.0');
    });
    test('fahrenheit converts 0°C → 32°F', () => {
        expect(U.convertTemperature(0, 'fahrenheit')).toBe('32.0');
    });
    test('fahrenheit converts 100°C → 212°F', () => {
        expect(U.convertTemperature(100, 'fahrenheit')).toBe('212.0');
    });
});

describe('getTemperatureUnit', () => {
    test('fahrenheit → °F', () => expect(U.getTemperatureUnit('fahrenheit')).toBe('°F'));
    test('celsius → °C', () => expect(U.getTemperatureUnit('celsius')).toBe('°C'));
});

describe('getFuelEfficiencyInUnits', () => {
    test('km mode returns L/100km unchanged', () => {
        expect(U.getFuelEfficiencyInUnits(6.5, 'km')).toBe('6.5');
    });
    test('mi mode converts to MPG', () => {
        // 6 L/100km ≈ 235.214/6 ≈ 39.2 MPG
        const mpg = parseFloat(U.getFuelEfficiencyInUnits(6, 'mi'));
        expect(mpg).toBeCloseTo(39.2, 0);
    });
});

describe('getFuelEfficiencyLabel', () => {
    test('mi → MPG', () => expect(U.getFuelEfficiencyLabel('mi')).toBe('MPG'));
    test('km → L/100km', () => expect(U.getFuelEfficiencyLabel('km')).toBe('L/100km'));
});

describe('getCurrencySymbol', () => {
    test('GBP → £', () => expect(U.getCurrencySymbol('GBP')).toBe('£'));
    test('USD → $', () => expect(U.getCurrencySymbol('USD')).toBe('$'));
    test('EUR → €', () => expect(U.getCurrencySymbol('EUR')).toBe('€'));
    test('unknown → £ fallback', () => expect(U.getCurrencySymbol('XYZ')).toBe('£'));
    test('null/empty → £ fallback', () => expect(U.getCurrencySymbol(null)).toBe('£'));
    test('lowercase works', () => expect(U.getCurrencySymbol('usd')).toBe('$'));
});

describe('adjustCostForUnits', () => {
    test('pass-through — returns cost unchanged', () => {
        expect(U.adjustCostForUnits(3.14)).toBe(3.14);
        expect(U.adjustCostForUnits(0)).toBe(0);
    });
});

describe('unit status labels', () => {
    test('distanceUnitStatusLabel', () => {
        expect(U.distanceUnitStatusLabel('mi')).toBe('miles');
        expect(U.distanceUnitStatusLabel('km')).toBe('kilometers');
    });
    test('speedUnitStatusLabel', () => {
        expect(U.speedUnitStatusLabel('mph')).toBe('mph');
        expect(U.speedUnitStatusLabel('kmh')).toBe('km/h');
    });
    test('temperatureUnitStatusLabel', () => {
        expect(U.temperatureUnitStatusLabel('fahrenheit')).toBe('Fahrenheit');
        expect(U.temperatureUnitStatusLabel('celsius')).toBe('Celsius');
    });
});

describe('formatRemainingDistanceText', () => {
    test('metric long distance shows km', () => {
        expect(U.formatRemainingDistanceText(2500, 'km')).toBe('2.5 km');
    });

    test('metric short distance shows metres', () => {
        expect(U.formatRemainingDistanceText(80, 'km')).toBe('80 m');
    });

    test('imperial long distance shows miles', () => {
        expect(U.formatRemainingDistanceText(3218.68, 'mi')).toBe('2.0 mi');
    });

    test('imperial short distance shows feet', () => {
        expect(U.formatRemainingDistanceText(50, 'mi')).toBe('164 ft');
    });
});

describe('formatPoiDistanceMeters', () => {
    test('metric formats metres and kilometres', () => {
        expect(U.formatPoiDistanceMeters(450, 'km')).toBe('450 m');
        expect(U.formatPoiDistanceMeters(1500, 'km')).toBe('1.5 km');
    });

    test('imperial formats feet and miles', () => {
        expect(U.formatPoiDistanceMeters(400, 'mi')).toMatch(/ft$/);
        expect(U.formatPoiDistanceMeters(2000, 'mi')).toMatch(/mi$/);
    });
});
