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

    test('hasMlPredictionsToShow and route input helpers', () => {
        expect(ML.hasMlPredictionsToShow({ success: true, predictions: [{ label: 'A' }] })).toBe(true);
        expect(ML.hasMlPredictionsToShow({ success: true, predictions: [] })).toBe(false);
        expect(ML.getMlPredictionRouteInputs({
            start_address: 'A St',
            end_address: 'B Rd',
        })).toEqual({ start: 'A St', end: 'B Rd' });
        expect(ML.getMlPredictionsEnabledStatusMessage(true)).toContain('enabled');
        expect(ML.getMlPredictionsEnabledStatusMessage(false)).toContain('disabled');
    });

    test('buildLoadMlPredictionsDomRenderPlan maps API payload to list items', () => {
        const render = ML.buildLoadMlPredictionsDomRenderPlan({
            success: true,
            predictions: [{ label: 'Commute', details: 'A → B', start_address: '1 A', end_address: '2 B' }],
        });
        expect(render.shouldRender).toBe(true);
        expect(render.items).toHaveLength(1);
        expect(render.items[0].html).toContain('Commute');
        expect(render.items[0].routeInputs).toEqual({ start: '1 A', end: '2 B' });
        expect(ML.buildLoadMlPredictionsDomRenderPlan({ success: true, predictions: [] }).shouldRender)
            .toBe(false);
    });

    test('buildToggleMlPredictionsExecutePlan persists toggle and side effects', () => {
        const collected = ML.buildToggleMlPredictionsCollectPlan({ currentEnabled: false });
        expect(collected.enabled).toBe(true);

        const execute = ML.buildToggleMlPredictionsExecutePlan({ enabled: true });
        expect(execute.storageKey).toBe(ML.ML_PREDICTIONS_STORAGE_KEY);
        expect(execute.loadPredictions).toBe(true);
        expect(execute.persistApiBody).toEqual({ ml_predictions_enabled: 1 });

        const off = ML.buildToggleMlPredictionsExecutePlan({ enabled: false });
        expect(off.hideSection).toBe(true);
        expect(off.persistApiBody).toEqual({ ml_predictions_enabled: 0 });
    });
});
