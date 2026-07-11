/**
 * Tests for modules/navigation/recent-destinations.js
 */
const Recent = require('../modules/navigation/recent-destinations.js');

describe('recent-destinations module', () => {
    const KEY = 'testRecentDest';

    beforeEach(() => {
        localStorage.clear();
    });

    test('loadRecentDestinations returns [] when storage is empty', () => {
        expect(Recent.loadRecentDestinations(KEY)).toEqual([]);
    });

    test('recordRecentDestination persists and dedupes by label+coords', () => {
        Recent.recordRecentDestination('Home', 51.5, -0.1, 'search', KEY, 5);
        Recent.recordRecentDestination('Work', 51.6, -0.2, 'route', KEY, 5);
        Recent.recordRecentDestination('Home', 51.5, -0.1, 'search', KEY, 5);

        const list = Recent.loadRecentDestinations(KEY);
        expect(list).toHaveLength(2);
        expect(list[0].label).toBe('Home');
        expect(list[1].label).toBe('Work');
    });

    test('recordRecentDestination caps list length', () => {
        for (let i = 0; i < 8; i++) {
            Recent.recordRecentDestination('Place ' + i, 51 + i * 0.01, -0.1, 'search', KEY, 3);
        }
        expect(Recent.loadRecentDestinations(KEY)).toHaveLength(3);
    });

    test('ignores invalid coordinates or empty label', () => {
        Recent.recordRecentDestination('', 51.5, -0.1, 'search', KEY, 5);
        Recent.recordRecentDestination('Bad', NaN, -0.1, 'search', KEY, 5);
        expect(Recent.loadRecentDestinations(KEY)).toEqual([]);
    });
});
