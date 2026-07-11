/**
 * @file Pure route calculation progress bar HTML and styles (no DOM).
 * @module modules/navigation/route-progress
 */
(function (root) {
    'use strict';

    var ROUTE_PROGRESS_CONTAINER_ID = 'routeProgressContainer';
    var ROUTE_PROGRESS_BAR_ID = 'routeProgressBar';
    var ROUTE_PROGRESS_TEXT_ID = 'routeProgressText';
    var ROUTE_PROGRESS_ANIMATION_STYLE_ID = 'progressAnimationStyle';
    var ROUTE_PROGRESS_DEFAULT_TEXT = '📍 Calculating route...';

    /**
     * @returns {string}
     */
    function getRouteProgressContainerStyleCssText() {
        return [
            'position: fixed;',
            'top: 0;',
            'left: 0;',
            'right: 0;',
            'z-index: 9999;',
            'background: rgba(102, 126, 234, 0.1);',
            'padding: 0;',
        ].join('');
    }

    /**
     * @param {string} [progressText]
     * @returns {string}
     */
    function buildRouteProgressBarInnerHtml(progressText) {
        var text = progressText || ROUTE_PROGRESS_DEFAULT_TEXT;
        return (
            '<div id="' + ROUTE_PROGRESS_BAR_ID + '" style="' +
                'height: 4px;' +
                'background: linear-gradient(90deg, #667eea, #764ba2, #667eea);' +
                'background-size: 200% 100%;' +
                'animation: progressGradient 1.5s ease-in-out infinite;' +
                'width: 100%;' +
            '"></div>' +
            '<div style="' +
                'text-align: center;' +
                'padding: 8px;' +
                'font-size: 13px;' +
                'color: #667eea;' +
                'font-weight: 500;' +
            '">' +
                '<span id="' + ROUTE_PROGRESS_TEXT_ID + '">' + text + '</span>' +
            '</div>'
        );
    }

    /**
     * @returns {string}
     */
    function getRouteProgressAnimationKeyframes() {
        return (
            '@keyframes progressGradient {' +
                '0% { background-position: 0% 50%; }' +
                '50% { background-position: 100% 50%; }' +
                '100% { background-position: 0% 50%; }' +
            '}'
        );
    }

    var api = {
        ROUTE_PROGRESS_CONTAINER_ID: ROUTE_PROGRESS_CONTAINER_ID,
        ROUTE_PROGRESS_BAR_ID: ROUTE_PROGRESS_BAR_ID,
        ROUTE_PROGRESS_TEXT_ID: ROUTE_PROGRESS_TEXT_ID,
        ROUTE_PROGRESS_ANIMATION_STYLE_ID: ROUTE_PROGRESS_ANIMATION_STYLE_ID,
        ROUTE_PROGRESS_DEFAULT_TEXT: ROUTE_PROGRESS_DEFAULT_TEXT,
        getRouteProgressContainerStyleCssText: getRouteProgressContainerStyleCssText,
        buildRouteProgressBarInnerHtml: buildRouteProgressBarInnerHtml,
        getRouteProgressAnimationKeyframes: getRouteProgressAnimationKeyframes,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
