/**
 * Tests for modules/util/html.js
 */
const Html = require('../modules/util/html.js');

describe('escapeHtml', () => {
    test('escapes HTML metacharacters', () => {
        expect(Html.escapeHtml('<script>"\'&</script>')).toBe(
            '&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;'
        );
    });

    test('null and undefined become empty string', () => {
        expect(Html.escapeHtml(null)).toBe('');
        expect(Html.escapeHtml(undefined)).toBe('');
    });

    test('coerces numbers', () => {
        expect(Html.escapeHtml(42)).toBe('42');
    });
});
