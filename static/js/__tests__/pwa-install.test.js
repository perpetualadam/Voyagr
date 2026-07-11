/**
 * Tests for modules/ui/pwa-install.js
 */
const PWA = require('../modules/ui/pwa-install.js');

describe('pwa-install module', () => {
    test('buildPwaInstallMessageHtml varies by mode', () => {
        expect(PWA.buildPwaInstallMessageHtml('ios')).toContain('Share');
        expect(PWA.buildPwaInstallMessageHtml('install')).toContain('Install Voyagr');
        expect(PWA.buildPwaInstallMessageHtml('generic')).toContain('browser menu');
    });

    test('banner and button style helpers return css text', () => {
        expect(PWA.getPwaInstallBannerStyleCssText()).toContain('position:fixed');
        expect(PWA.getPwaDismissButtonStyleCssText()).toContain('transparent');
        expect(PWA.getPwaPrimaryButtonStyleCssText()).toContain('#7c4dff');
    });
});
