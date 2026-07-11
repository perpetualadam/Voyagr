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

    /**
     * Whether the favorites section should be shown after loading.
     * @param {boolean} isUnauthorized
     * @param {number} favoritesCount
     * @returns {boolean}
     */
    function shouldShowFavoritesSection(isUnauthorized, favoritesCount) {
        return !isUnauthorized && favoritesCount > 0;
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    function getFavoriteSelectStatusMessage(name) {
        return '📍 Destination set to ' + name;
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    function getFavoriteUpdatedStatusMessage(name) {
        return '✅ Updated ' + name;
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    function getFavoriteRemovedStatusMessage(name) {
        return '🗑️ Removed ' + name;
    }

    /**
     * DOM-neutral spec for one favorites grid row (styles + inner HTML).
     * @param {Object} fav
     * @param {Object} opts
     * @returns {Object}
     */
    function buildFavoriteGridItemSpec(fav, opts) {
        fav = fav || {};
        opts = opts || {};
        return {
            container: {
                className: 'favorite-item',
                style: FAVORITE_ITEM_CONTAINER_STYLE,
            },
            mainButton: {
                className: 'favorite-btn',
                style: FAVORITE_BTN_STYLE,
                html: buildFavoriteMainButtonHtml(fav, opts),
            },
            editButton: {
                title: 'Edit',
                style: FAVORITE_EDIT_BTN_STYLE,
                html: buildFavoriteEditButtonHtml(),
            },
            deleteButton: {
                title: 'Delete',
                style: FAVORITE_DELETE_BTN_STYLE,
                html: buildFavoriteDeleteButtonHtml(),
            },
        };
    }

    /**
     * @param {string|null|undefined} token
     * @returns {Object}
     */
    function buildFavoriteAuthHeaders(token) {
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        return headers;
    }

    /**
     * @param {Object} fav
     * @param {string} newName
     * @param {string} newCategory
     * @returns {string}
     */
    function buildFavoriteUpdateBody(fav, newName, newCategory) {
        fav = fav || {};
        return JSON.stringify({
            id: fav.id,
            name: newName,
            address: fav.address,
            category: newCategory || fav.category,
        });
    }

    /**
     * @param {Object} fav
     * @returns {string}
     */
    function buildFavoriteDeleteBody(fav) {
        fav = fav || {};
        return JSON.stringify({ id: fav.id });
    }

    /**
     * @param {Object} params
     * @returns {string}
     */
    function buildFavoriteCreateBody(params) {
        params = params || {};
        return JSON.stringify({
            name: params.name,
            address: params.address,
            lat: params.lat,
            lon: params.lon,
            category: params.category || 'location',
        });
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    function getFavoriteDeleteConfirmMessage(name) {
        return 'Delete "' + name + '" from favorites?';
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    function getFavoriteAddedStatusMessage(name) {
        return 'Added ' + name + ' to favorites!';
    }

    /**
     * @param {string} error
     * @returns {string}
     */
    function getFavoriteApiErrorMessage(error) {
        return '❌ Error: ' + (error || 'Unknown error');
    }

    /**
     * @param {string} action
     * @returns {string}
     */
    function getFavoriteActionFailedMessage(action) {
        return '❌ Failed to ' + action + ' favorite';
    }

    var api = {
        FAVORITE_ITEM_CONTAINER_STYLE: FAVORITE_ITEM_CONTAINER_STYLE,
        FAVORITE_BTN_STYLE: FAVORITE_BTN_STYLE,
        FAVORITE_EDIT_BTN_STYLE: FAVORITE_EDIT_BTN_STYLE,
        FAVORITE_DELETE_BTN_STYLE: FAVORITE_DELETE_BTN_STYLE,
        buildFavoriteMainButtonHtml: buildFavoriteMainButtonHtml,
        buildFavoriteEditButtonHtml: buildFavoriteEditButtonHtml,
        buildFavoriteDeleteButtonHtml: buildFavoriteDeleteButtonHtml,
        shouldShowFavoritesSection: shouldShowFavoritesSection,
        getFavoriteSelectStatusMessage: getFavoriteSelectStatusMessage,
        getFavoriteUpdatedStatusMessage: getFavoriteUpdatedStatusMessage,
        getFavoriteRemovedStatusMessage: getFavoriteRemovedStatusMessage,
        buildFavoriteGridItemSpec: buildFavoriteGridItemSpec,
        buildFavoriteAuthHeaders: buildFavoriteAuthHeaders,
        buildFavoriteUpdateBody: buildFavoriteUpdateBody,
        buildFavoriteDeleteBody: buildFavoriteDeleteBody,
        buildFavoriteCreateBody: buildFavoriteCreateBody,
        getFavoriteDeleteConfirmMessage: getFavoriteDeleteConfirmMessage,
        getFavoriteAddedStatusMessage: getFavoriteAddedStatusMessage,
        getFavoriteApiErrorMessage: getFavoriteApiErrorMessage,
        getFavoriteActionFailedMessage: getFavoriteActionFailedMessage,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrFavorites = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
