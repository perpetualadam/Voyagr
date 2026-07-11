/**
 * @file Pure favorites list item HTML builders (no DOM, no network).
 * @module modules/navigation/favorites
 */
(function (root) {
    'use strict';

    var FAVORITE_ITEM_CONTAINER_STYLE =
        'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';
    var FAVORITE_BTN_STYLE = 'flex: 1; text-align: left;';
    var FAVORITE_EDIT_BTN_STYLE =
        'width: 36px; height: 36px; border: none; border-radius: 50%; background: #667eea; color: white; cursor: pointer; font-size: 16px;';
    var FAVORITE_DELETE_BTN_STYLE =
        'width: 36px; height: 36px; border: none; border-radius: 50%; background: #F44336; color: white; cursor: pointer; font-size: 16px;';

    /**
     * @param {Object} fav
     * @param {Object} opts
     * @returns {string}
     */
    function buildFavoriteMainButtonHtml(fav, opts) {
        fav = fav || {};
        opts = opts || {};
        var escape = opts.escapeHtml || function (s) { return String(s); };
        return (
            '<span class="favorite-btn-name">' + escape(fav.name) + '</span>' +
            '<span class="favorite-btn-category">' + escape(fav.category) + '</span>'
        );
    }

    /**
     * @returns {string}
     */
    function buildFavoriteEditButtonHtml() {
        return '✏️';
    }

    /**
     * @returns {string}
     */
    function buildFavoriteDeleteButtonHtml() {
        return '🗑️';
    }

    var api = {
        FAVORITE_ITEM_CONTAINER_STYLE: FAVORITE_ITEM_CONTAINER_STYLE,
        FAVORITE_BTN_STYLE: FAVORITE_BTN_STYLE,
        FAVORITE_EDIT_BTN_STYLE: FAVORITE_EDIT_BTN_STYLE,
        FAVORITE_DELETE_BTN_STYLE: FAVORITE_DELETE_BTN_STYLE,
        buildFavoriteMainButtonHtml: buildFavoriteMainButtonHtml,
        buildFavoriteEditButtonHtml: buildFavoriteEditButtonHtml,
        buildFavoriteDeleteButtonHtml: buildFavoriteDeleteButtonHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrFavorites = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
