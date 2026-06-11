/**
 * @file Meta-test: the JS test suite must exercise real code, not re-implemented logic.
 *
 * Enforces scripts/check-tautological-tests.cjs as part of `npm test` / CI so the suite
 * cannot silently regress back to self-confirming tests (mocking an object and asserting
 * its own mocks, or never importing any real module).
 */

const { findTautologicalTests } = require('../../../../scripts/check-tautological-tests.cjs');

describe('test suite quality guard', () => {
    test('no tautological test files', () => {
        const offenders = findTautologicalTests();
        if (offenders.length) {
            const report = offenders
                .map(o => `  ${o.file}\n${o.reasons.map(r => `    - ${r}`).join('\n')}`)
                .join('\n');
            throw new Error(
                `Tautological test file(s) detected. Tests must import and assert against ` +
                `the real application modules:\n${report}`
            );
        }
        expect(offenders).toHaveLength(0);
    });
});
