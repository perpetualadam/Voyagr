/**
 * @file Pure PWA add-to-home-screen banner HTML and styles (no DOM).
 * @module modules/ui/pwa-install
 */
(function (root) {
    'use strict';

    var PWA_BANNER_ID = 'voyagr-add-homescreen-banner';

    /**
     * @returns {string}
     */
    function getPwaInstallBannerStyleCssText() {
        return [
            'position:fixed',
            'bottom:0',
            'left:0',
            'right:0',
            'z-index:99999',
            'background:#1a237e',
            'color:#fff',
            'padding:12px 14px',
            'display:flex',
            'flex-wrap:wrap',
            'align-items:center',
            'justify-content:space-between',
            'gap:10px',
            'font-size:14px',
            'box-shadow:0 -4px 16px rgba(0,0,0,0.25)',
        ].join(';');
    }

    /**
     * @returns {string}
     */
    function getPwaDismissButtonStyleCssText() {
        return 'padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.5);background:transparent;color:#fff;cursor:pointer;font-size:13px;';
    }

    /**
     * @returns {string}
     */
    function getPwaPrimaryButtonStyleCssText() {
        return 'padding:8px 14px;border-radius:8px;border:none;background:#7c4dff;color:#fff;cursor:pointer;font-weight:600;font-size:13px;';
    }

    /**
     * @param {'ios'|'install'|'generic'} mode
     * @returns {string}
     */
    function buildPwaInstallMessageHtml(mode) {
        if (mode === 'ios') {
            return (
                '<strong>Add Voyagr to your home screen</strong><br>' +
                '<span style="opacity:0.92;font-size:12px;">Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>'
            );
        }
        if (mode === 'install') {
            return (
                '<strong>Install Voyagr</strong>' +
                '<span style="opacity:0.92;font-size:12px;display:block;margin-top:4px;">Add this app to your home screen for quick access.</span>'
            );
        }
        return (
            '<strong>Add Voyagr to your home screen</strong>' +
            '<span style="opacity:0.92;font-size:12px;display:block;margin-top:4px;">Use your browser menu: Install app or Add to Home Screen.</span>'
        );
    }

    var api = {
        PWA_BANNER_ID: PWA_BANNER_ID,
        getPwaInstallBannerStyleCssText: getPwaInstallBannerStyleCssText,
        getPwaDismissButtonStyleCssText: getPwaDismissButtonStyleCssText,
        getPwaPrimaryButtonStyleCssText: getPwaPrimaryButtonStyleCssText,
        buildPwaInstallMessageHtml: buildPwaInstallMessageHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPwaInstall = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
