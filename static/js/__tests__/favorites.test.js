/**
 * Tests for modules/navigation/favorites.js
 */
const FAV = require('../modules/navigation/favorites.js');
const { escapeHtml } = require('../modules/util/html.js');

describe('favorites module', () => {
    test('buildFavoriteMainButtonHtml escapes name and category', () => {
        const html = FAV.buildFavoriteMainButtonHtml(
            { name: '<Home>', category: 'home' },
            { escapeHtml }
        );
        expect(html).toContain('&lt;Home&gt;');
        expect(html).toContain('favorite-btn-name');
        expect(html).toContain('favorite-btn-category');
    });

    test('buildFavoriteEditButtonHtml and buildFavoriteDeleteButtonHtml return emoji', () => {
        expect(FAV.buildFavoriteEditButtonHtml()).toBe('✏️');
        expect(FAV.buildFavoriteDeleteButtonHtml()).toBe('🗑️');
    });
});
