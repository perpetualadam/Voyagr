/**
 * Tests for modules/navigation/route-sharing.js
 */
const RS = require('../modules/navigation/route-sharing.js');

describe('route-sharing module', () => {
    test('buildShareableRoutePayload includes geometry by default', () => {
        const payload = RS.buildShareableRoutePayload(
            { distance_km: 12, time: '20 min', fuel_cost: 5, toll_cost: 1, caz_cost: 0.5, geometry: 'abc' },
            'A',
            'B'
        );
        expect(payload.start).toBe('A');
        expect(payload.end).toBe('B');
        expect(payload.distance).toBe(12);
        expect(payload.geometry).toBe('abc');
    });

    test('buildShareableRoutePayload omits geometry when includeGeometry is false', () => {
        const payload = RS.buildShareableRoutePayload(
            { geometry: 'abc' },
            'A',
            'B',
            false
        );
        expect(payload.geometry).toBeUndefined();
    });

    test('encodeRoutePayload and buildShareUrl produce shareable URL', () => {
        const encoded = RS.encodeRoutePayload({ start: 'A', end: 'B' });
        const url = RS.buildShareUrl('https://voyagr.test', encoded);
        expect(url).toMatch(/^https:\/\/voyagr\.test\?route=/);
        expect(encoded.length).toBeGreaterThan(0);
    });

    test('buildRouteShareSummaryValues sums costs and formats labels', () => {
        const summary = RS.buildRouteShareSummaryValues(
            { time: '25 min', fuel_cost: 10, toll_cost: 2, caz_cost: 1 },
            {
                startLabel: 'Home',
                endLabel: 'Work',
                distanceText: '15.2',
                distUnit: 'mi',
                currencySymbol: '£',
            }
        );
        expect(summary.startLabel).toBe('Home');
        expect(summary.durationText).toBe('25 min');
        expect(summary.totalCostText).toBe('£13.00');
        expect(summary.totalCost).toBe(13);
    });

    test('buildShareWhatsAppMessage and email helpers format social share text', () => {
        const route = { time: '20 min', fuel_cost: 5, toll_cost: 1, caz_cost: 0.5, distance_km: 10 };
        const fmt = {
            startLabel: 'A',
            endLabel: 'B',
            distanceText: '6.2',
            distUnit: 'mi',
            currencySymbol: '£',
        };
        expect(RS.buildShareWhatsAppMessage(route, fmt)).toContain('Route from A to B');
        expect(RS.buildShareEmailSubject('A', 'B')).toBe('Route: A to B');
        expect(RS.buildShareEmailBody(route, fmt)).toContain('Estimated Cost: £6.50');
    });

    test('decodeRoutePayload round-trips encoded payloads', () => {
        const payload = { start: 'A', end: 'B', distance: 10, time: '20 min' };
        const encoded = RS.encodeRoutePayload(payload);
        expect(RS.decodeRoutePayload(encoded)).toEqual(payload);
        expect(RS.decodeRoutePayload('not-valid')).toBeNull();
    });

    test('extractRouteParamFromSearch and stripRouteParamFromUrl handle share links', () => {
        const encoded = RS.encodeRoutePayload({ start: 'A', end: 'B' });
        const search = '?route=' + encoded + '&foo=1';
        expect(RS.extractRouteParamFromSearch(search)).toBe(encoded);
        expect(RS.stripRouteParamFromUrl('https://voyagr.test/path' + search + '#x'))
            .toBe('/path?foo=1#x');
    });

    test('buildLastCalculatedRouteFromSharedPayload maps share fields', () => {
        const route = RS.buildLastCalculatedRouteFromSharedPayload({
            start: 'A',
            end: 'B',
            distance: 12,
            time: '25 min',
            fuel_cost: 5,
            geometry: 'abc',
        });
        expect(route.distance_km).toBe(12);
        expect(route.duration_minutes).toBe(25);
        expect(route.geometry).toBe('abc');
        expect(RS.parseSharedRouteDurationMinutes('18 min')).toBe(18);
    });

    test('buildSavedRoutesListHtml renders rows or empty state', () => {
        expect(RS.buildSavedRoutesListHtml([], {})).toContain('No saved routes yet');
        const html = RS.buildSavedRoutesListHtml(
            [{ id: 1, name: 'Commute', start: 'A', end: 'B', distance_km: 10, duration_minutes: '20 min', fuel_cost: 5, toll_cost: 1, caz_cost: 0 }],
            { currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.21'] }
        );
        expect(html).toContain('Commute');
        expect(html).toContain('useSavedRoute(1)');
        expect(RS.computeSavedRouteTotalCost({ fuel_cost: 5, toll_cost: 1, caz_cost: 0.5 })).toBe(6.5);
    });

    test('buildSaveCurrentRoutePlan validates inputs and builds payload', () => {
        expect(RS.buildSaveCurrentRoutePlan({}).ok).toBe(false);
        const plan = RS.buildSaveCurrentRoutePlan({
            lastCalculatedRoute: { distance_km: 10, time: '20 min', geometry: 'abc' },
            routeName: 'Commute',
            startLabel: 'A',
            endLabel: 'B',
            now: 1000,
        });
        expect(plan.ok).toBe(true);
        expect(plan.savedRoute.name).toBe('Commute');
        expect(RS.buildSaveCurrentRouteExecutePlan(plan).shouldSave).toBe(true);
    });

    test('buildUseSavedRoutePlan includes destination for recalculate', () => {
        const plan = RS.buildUseSavedRoutePlan(1, [{
            id: 1,
            name: 'Commute',
            start: 'A',
            end: 'B',
            distance_km: 10,
            duration_minutes: 20,
            fuel_cost: 5,
            toll_cost: 0,
            caz_cost: 0,
            geometry: 'abc',
        }]);
        expect(plan.ok).toBe(true);
        expect(plan.lastCalculatedRoutePatch.destination).toBe('B');
        expect(plan.lastCalculatedRoutePatch.destinationName).toBe('B');
    });

    test('buildDeleteSavedRouteExecutePlan filters route list', () => {
        const execute = RS.buildDeleteSavedRouteExecutePlan(
            RS.buildDeleteSavedRoutePlan(2),
            [{ id: 1 }, { id: 2 }, { id: 3 }]
        );
        expect(execute.nextRoutes).toHaveLength(2);
        expect(execute.nextRoutes.map((r) => r.id)).toEqual([1, 3]);
    });

    test('saved route entry orchestration plans bundle execute plans', () => {
        const saveEntry = RS.buildSaveCurrentRouteEntryOrchestrationPlan({
            lastCalculatedRoute: { distance_km: 10, time: '20 min', geometry: 'abc' },
            routeName: 'Commute',
            startLabel: 'A',
            endLabel: 'B',
            now: 1000,
        });
        expect(saveEntry.execute.shouldSave).toBe(true);
        expect(saveEntry.execute.savedRoute.name).toBe('Commute');

        const loadEntry = RS.buildLoadSavedRoutesEntryOrchestrationPlan(
            [{ id: 1, name: 'Commute', start: 'A', end: 'B', distance_km: 10, duration_minutes: '20 min', fuel_cost: 5, toll_cost: 0, caz_cost: 0 }],
            { currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.21'] }
        );
        expect(loadEntry.execute.shouldRender).toBe(true);
        expect(loadEntry.execute.listHtml).toContain('Commute');

        const useEntry = RS.buildUseSavedRouteEntryOrchestrationPlan(1, [{
            id: 1, name: 'Commute', start: 'A', end: 'B',
            distance_km: 10, duration_minutes: 20, fuel_cost: 5, toll_cost: 0, caz_cost: 0, geometry: 'abc',
        }]);
        expect(useEntry.plan.ok).toBe(true);
        expect(useEntry.plan.switchTab).toBe('navigation');

        const deleteEntry = RS.buildDeleteSavedRouteEntryOrchestrationPlan(2, [{ id: 1 }, { id: 2 }]);
        expect(deleteEntry.deletePlan.confirmMessage).toContain('Delete');
        expect(deleteEntry.execute.nextRoutes).toHaveLength(1);
    });

    test('buildQrCodeImageUrl encodes share link and style sets dimensions', () => {
        const url = RS.buildQrCodeImageUrl('https://voyagr.test?route=abc', 200);
        expect(url).toContain('api.qrserver.com');
        expect(url).toContain('200x200');
        expect(url).toContain(encodeURIComponent('https://voyagr.test?route=abc'));
        expect(RS.getQrCodeImageStyleCssText()).toBe('width: 200px; height: 200px;');
        expect(RS.getQrCodeImageStyleCssText(128)).toBe('width: 128px; height: 128px;');
    });

    test('buildEncodedShareLinkPlan and share execute plans', () => {
        const link = RS.buildEncodedShareLinkPlan({
            route: { distance_km: 10, time: '20 min', geometry: 'abc' },
            startLabel: 'A',
            endLabel: 'B',
            origin: 'https://voyagr.test',
            includeGeometry: true,
        });
        expect(link.ok).toBe(true);
        expect(link.shareLink).toContain('https://voyagr.test');
        expect(RS.buildShareLinkGenerateExecutePlan(link).shouldGenerate).toBe(true);
        expect(RS.buildQrCodeGenerateExecutePlan(link).shouldGenerate).toBe(true);
        expect(RS.buildShareViaWhatsAppPlan(null, {}).ok).toBe(false);
    });

    test('buildEncodedShareLinkOrchestrationPlan bundles input and plan', () => {
        const input = RS.buildEncodedShareLinkInputPlan({
            route: { distance_km: 10, time: '20 min', geometry: 'abc' },
            startLabel: 'A',
            endLabel: 'B',
            origin: 'https://voyagr.test',
            includeGeometry: false,
        });
        const orch = RS.buildEncodedShareLinkOrchestrationPlan(input);
        expect(orch.input).toBe(input);
        expect(orch.plan.ok).toBe(true);
        expect(orch.plan.shareLink).toContain('https://voyagr.test');
        expect(RS.buildEncodedShareLinkOrchestrationPlan({ route: null }).plan.ok).toBe(false);
    });

    test('buildPrepareRouteSharingOrchestrationPlan and share entry orchestration', () => {
        const orch = RS.buildPrepareRouteSharingOrchestrationPlan({
            route: { distance_km: 10, time: '20 min', fuel_cost: 4, toll_cost: 1, caz_cost: 0 },
            startLabel: 'A',
            endLabel: 'B',
            distanceText: '6.2',
            distUnit: 'mi',
            currencySymbol: '£',
        });
        expect(orch.apply.shouldApply).toBe(true);
        expect(orch.apply.elementPatches.shareStart).toContain('A');

        const blocked = RS.buildPrepareRouteSharingOrchestrationPlan({ route: null });
        expect(blocked.apply.shouldApply).toBe(false);

        const link = RS.buildEncodedShareLinkPlan({
            route: { distance_km: 10, time: '20 min', geometry: 'abc' },
            startLabel: 'A',
            endLabel: 'B',
            origin: 'https://voyagr.test',
        });
        const share = RS.buildGenerateShareLinkEntryOrchestrationPlan(link);
        expect(share.execute.shouldGenerate).toBe(true);
        const qr = RS.buildGenerateQrCodeEntryOrchestrationPlan(link);
        expect(qr.execute.qrImageUrl).toContain('api.qrserver.com');
    });

    test('buildLastCalculatedRouteFromSharedPayload includes destination for recalculate', () => {
        const route = RS.buildLastCalculatedRouteFromSharedPayload({
            start: 'A',
            end: 'B',
            distance: 10,
            time: '20 min',
            geometry: 'abc',
        });
        expect(route.destination).toBe('B');
        expect(route.destinationName).toBe('B');
        expect(route.duration_minutes).toBe(20);
    });

    test('buildLoadSharedRouteFromUrl plans decode URL payload and apply route', () => {
        const encoded = RS.encodeRoutePayload({
            start: 'Home',
            end: 'Work',
            distance: 12,
            time: '18 min',
            geometry: 'poly',
        });
        const search = '?route=' + encodeURIComponent(encoded);
        const orch = RS.buildLoadSharedRouteFromUrlOrchestrationPlan(search);
        expect(orch.shouldLoad).toBe(true);
        expect(orch.payload.start).toBe('Home');

        const execute = RS.buildLoadSharedRouteFromUrlExecutePlan(
            orch,
            'https://voyagr.test' + search
        );
        expect(execute.shouldApply).toBe(true);
        expect(execute.lastCalculatedRoute.destination).toBe('Work');
        expect(execute.showRoutePreview).toBe(true);
        expect(execute.cleanUrl).not.toContain('route=');

        expect(RS.buildLoadSharedRouteFromUrlOrchestrationPlan('').shouldLoad).toBe(false);

        const entry = RS.buildLoadSharedRouteFromUrlEntryOrchestrationPlan(
            search,
            'https://voyagr.test/?route=' + encoded
        );
        expect(entry.shouldLoad).toBe(true);
        expect(entry.execute.shouldApply).toBe(true);
        expect(entry.execute.startLabel).toBe('Home');
    });

    test('buildCopyShareLinkExecutePlan targets share link input', () => {
        const execute = RS.buildCopyShareLinkExecutePlan();
        expect(execute.shouldCopy).toBe(true);
        expect(execute.shareLinkInputId).toBe('shareLink');
        expect(execute.successStatusType).toBe('success');
    });

    test('buildCopyShareLinkEntryOrchestrationPlan wraps copy execute plan', () => {
        const entry = RS.buildCopyShareLinkEntryOrchestrationPlan();
        expect(entry.execute.shouldCopy).toBe(true);
        expect(entry.execute.shareLinkInputId).toBe('shareLink');
    });

    test('buildDownloadQrCodeExecutePlan requires generated image URL', () => {
        expect(RS.buildDownloadQrCodeExecutePlan(null).shouldDownload).toBe(false);
        const execute = RS.buildDownloadQrCodeExecutePlan('https://example.com/qr.png');
        expect(execute.shouldDownload).toBe(true);
        expect(execute.downloadFileName).toBe('route-qr-code.png');
    });

    test('buildDownloadQrCodeEntryOrchestrationPlan passes QR image URL through', () => {
        expect(RS.buildDownloadQrCodeEntryOrchestrationPlan(null).execute.shouldDownload).toBe(false);
        const entry = RS.buildDownloadQrCodeEntryOrchestrationPlan('https://example.com/qr.png');
        expect(entry.execute.shouldDownload).toBe(true);
        expect(entry.execute.imageUrl).toBe('https://example.com/qr.png');
    });

    test('buildShareViaWhatsAppExecutePlan and email execute plan open share URLs', () => {
        const wa = RS.buildShareViaWhatsAppExecutePlan({
            ok: true,
            message: 'Route details',
            statusMessage: 'Opening WhatsApp...',
            whatsAppUrlPrefix: 'https://wa.me/?text=',
        });
        expect(wa.shouldShare).toBe(true);
        expect(wa.openUrl).toContain(encodeURIComponent('Route details'));

        const email = RS.buildShareViaEmailExecutePlan({
            ok: true,
            subject: 'My route',
            body: 'Details here',
            statusMessage: 'Opening email client...',
            mailtoPrefix: 'mailto:?subject=',
        });
        expect(email.shouldShare).toBe(true);
        expect(email.mailtoUrl).toContain(encodeURIComponent('My route'));
        expect(RS.buildShareViaWhatsAppExecutePlan({ ok: false }).shouldShare).toBe(false);
    });

    test('buildShareViaWhatsAppEntryOrchestrationPlan rejects missing route', () => {
        const entry = RS.buildShareViaWhatsAppEntryOrchestrationPlan(null, {});
        expect(entry.execute.shouldShare).toBe(false);
        expect(entry.execute.errorStatusMessage).toBe('No route calculated yet');
    });

    test('buildShareViaEmailEntryOrchestrationPlan builds mailto execute plan', () => {
        const route = { distance_km: 5, time: '10 min', cost: 2 };
        const fmt = {
            startLabel: 'A',
            endLabel: 'B',
            distanceText: '5 km',
            distUnit: 'km',
            currencySymbol: '£',
        };
        const entry = RS.buildShareViaEmailEntryOrchestrationPlan(route, fmt);
        expect(entry.execute.shouldShare).toBe(true);
        expect(entry.execute.mailtoUrl).toContain('mailto:?subject=');
    });

    test('buildGenerateQrCodeDomExecutePlan mounts QR image metadata', () => {
        const link = RS.buildEncodedShareLinkPlan({
            route: { distance_km: 10, time: '20 min', geometry: 'abc' },
            startLabel: 'A',
            endLabel: 'B',
            origin: 'https://voyagr.test',
            includeGeometry: false,
        });
        const execute = RS.buildGenerateQrCodeDomExecutePlan(link);
        expect(execute.shouldGenerate).toBe(true);
        expect(execute.qrImageUrl).toContain('api.qrserver.com');
        expect(execute.imageAlt).toBe('Route QR Code');
    });

    test('buildGenerateShareLinkDomExecutePlan toggles link and QR containers', () => {
        const link = RS.buildEncodedShareLinkPlan({
            route: { distance_km: 10, time: '20 min' },
            startLabel: 'A',
            endLabel: 'B',
            origin: 'https://voyagr.test',
        });
        const execute = RS.buildGenerateShareLinkDomExecutePlan(link);
        expect(execute.shouldGenerate).toBe(true);
        expect(execute.showContainerDisplay).toBe('block');
        expect(execute.hideContainerDisplay).toBe('none');
        expect(execute.shareLinkInputId).toBe('shareLink');
    });
});
