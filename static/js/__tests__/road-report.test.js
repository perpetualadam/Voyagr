/**
 * Tests for modules/navigation/road-report.js
 */
const RR = require('../modules/navigation/road-report.js');

describe('road-report module', () => {
    test('buildOpenRoadReportModalExecutePlan clears notes and shows modal', () => {
        const plan = RR.buildOpenRoadReportModalExecutePlan();
        expect(plan.shouldOpen).toBe(true);
        expect(plan.modalId).toBe(RR.ROAD_REPORT_MODAL_ID);
        expect(plan.clearNotes).toBe(true);
        expect(plan.modalDisplay).toBe('block');
    });

    test('buildCloseRoadReportModalExecutePlan hides modal', () => {
        const plan = RR.buildCloseRoadReportModalExecutePlan();
        expect(plan.shouldClose).toBe(true);
        expect(plan.modalDisplay).toBe('none');
    });

    test('buildSubmitRoadReportCollectPlan requires finite GPS fix', () => {
        expect(RR.buildSubmitRoadReportCollectPlan({ lat: null, lon: 1 }).hasGpsFix).toBe(false);
        expect(RR.buildSubmitRoadReportCollectPlan({ lat: 51.5, lon: -0.1 }).hasGpsFix).toBe(true);
    });

    test('buildSubmitRoadReportFetchPlan sets accident severity high', () => {
        const plan = RR.buildSubmitRoadReportFetchPlan({
            lat: 51.5,
            lon: -0.1,
            hazardType: 'accident',
            description: 'queue',
        });
        expect(plan.url).toBe(RR.ROAD_REPORT_API_PATH);
        expect(plan.body.severity).toBe('high');
        expect(plan.body.hazard_type).toBe('accident');
        expect(plan.closeModalOnSuccess).toBe(true);
    });
});
