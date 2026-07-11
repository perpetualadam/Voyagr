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

    test('shouldShowFavoritesSection hides when unauthorized or empty', () => {
        expect(FAV.shouldShowFavoritesSection(true, 3)).toBe(false);
        expect(FAV.shouldShowFavoritesSection(false, 0)).toBe(false);
        expect(FAV.shouldShowFavoritesSection(false, 2)).toBe(true);
    });

    test('buildFavoriteGridItemSpec includes container and button specs', () => {
        const spec = FAV.buildFavoriteGridItemSpec(
            { name: 'Home', category: 'home' },
            { escapeHtml }
        );
        expect(spec.container.className).toBe('favorite-item');
        expect(spec.mainButton.className).toBe('favorite-btn');
        expect(spec.mainButton.html).toContain('Home');
        expect(spec.editButton.html).toBe('✏️');
        expect(spec.deleteButton.html).toBe('🗑️');
    });

    test('status message helpers', () => {
        expect(FAV.getFavoriteSelectStatusMessage('Work')).toContain('Work');
        expect(FAV.getFavoriteUpdatedStatusMessage('Work')).toContain('Updated');
        expect(FAV.getFavoriteRemovedStatusMessage('Work')).toContain('Removed');
    });
});
