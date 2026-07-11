/**
 * @file Pure offline/resume navigation banner HTML (no DOM, no network).
 * @module modules/navigation/offline-navigation
 */
(function (root) {
    'use strict';

    var OFFLINE_BANNER_ID = 'offlineBanner';
    var RESUME_NAV_BANNER_ID = 'resumeNavBanner';

    /**
     * Inline style for the fixed offline connectivity banner.
     * @returns {string}
     */
    function getOfflineBannerStyleCssText() {
        return [
            'position:fixed;top:0;left:0;right:0;z-index:99999;',
            'background:linear-gradient(135deg,#ff6b6b,#ee5a24);color:#fff;',
            'padding:10px 16px;text-align:center;font-size:14px;font-weight:600;',
            'font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
            'box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;',
            'justify-content:center;gap:8px;transition:transform 0.3s ease;',
        ].join('');
    }

    /**
     * @returns {string}
     */
    function buildOfflineBannerInnerHtml() {
        return '<span>📡</span><span>You\'re offline — GPS & cached map tiles still work</span>';
    }

    /**
     * @returns {string}
     */
    function getResumeNavigationBannerStyleCssText() {
        return [
            'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99998;',
            'background:#fff;border-radius:16px;padding:16px 20px;',
            'box-shadow:0 4px 20px rgba(0,0,0,0.25);max-width:340px;width:90%;',
            'font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
            'display:flex;flex-direction:column;gap:10px;',
        ].join('');
    }

    /**
     * @param {number} stepCount
     * @returns {string}
     */
    function buildResumeNavigationBannerHtml(stepCount) {
        stepCount = stepCount || 0;
        return (
            '<div style="font-weight:600;font-size:15px">Resume navigation?</div>' +
            '<div style="font-size:13px;color:#666">A previous route was found (' + stepCount + ' steps).</div>' +
            '<div style="display:flex;gap:8px">' +
                '<button id="resumeNavYes" style="flex:1;padding:10px;border:none;border-radius:10px;' +
                    'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-weight:600;' +
                    'font-size:14px;cursor:pointer">Resume</button>' +
                '<button id="resumeNavNo" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:10px;' +
                    'background:#fff;color:#333;font-weight:600;font-size:14px;cursor:pointer">Dismiss</button>' +
            '</div>'
        );
    }

    var api = {
        OFFLINE_BANNER_ID: OFFLINE_BANNER_ID,
        RESUME_NAV_BANNER_ID: RESUME_NAV_BANNER_ID,
        getOfflineBannerStyleCssText: getOfflineBannerStyleCssText,
        buildOfflineBannerInnerHtml: buildOfflineBannerInnerHtml,
        getResumeNavigationBannerStyleCssText: getResumeNavigationBannerStyleCssText,
        buildResumeNavigationBannerHtml: buildResumeNavigationBannerHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrOfflineNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
