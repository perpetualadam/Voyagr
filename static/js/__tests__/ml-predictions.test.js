/**
 * Tests for modules/navigation/ml-predictions.js
 */
const ML = require('../modules/navigation/ml-predictions.js');

describe('ml-predictions module', () => {
    test('buildMlPredictionItemHtml includes label and details', () => {
        const html = ML.buildMlPredictionItemHtml({
            label: 'Morning commute',
            details: 'Home → Office',
        });
        expect(html).toContain('ml-prediction-label');
        expect(html).toContain('Morning commute');
        expect(html).toContain('ml-prediction-details');
        expect(html).toContain('Home → Office');
    });

    test('buildMlPredictionItemHtml tolerates missing fields', () => {
        const html = ML.buildMlPredictionItemHtml();
        expect(html).toContain('ml-prediction-label');
        expect(html).toContain('ml-prediction-details');
    });
});
