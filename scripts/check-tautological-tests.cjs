/**
 * @file Guard against tautological tests.
 *
 * A "tautological" test is one that does not exercise the real application code: it
 * re-implements logic inline, or mocks an object with jest.fn()s and then asserts that
 * its own mocks were called. Such tests pass no matter how the real code behaves, giving
 * false confidence.
 *
 * This checker scans the JS test suite and flags two high-signal anti-patterns:
 *
 *   1. NO_REAL_IMPORT  - the test file never imports/requires any real module from
 *                        outside the __tests__ tree, so it can only be testing inline
 *                        code or mocks.
 *   2. SELF_MOCK_ASSERT - the file installs a global/local object literal full of
 *                        jest.fn()s and then asserts `expect(thatObject.method)
 *                        .toHaveBeenCalled...`, i.e. it asserts on its own mocks.
 *
 * Run directly for CI:   node scripts/check-tautological-tests.cjs
 * Or import findTautologicalTests() from a Jest meta-test.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TESTS_ROOT = path.resolve(__dirname, '..', 'static', 'js', '__tests__');

// Files intentionally exempt (e.g. the meta-test itself, pure fixtures). Paths are
// relative to TESTS_ROOT, using forward slashes.
const ALLOWLIST = new Set([
    'meta/no-tautological-tests.test.js',
]);

/** Recursively collect *.test.js files under a directory. */
function collectTestFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectTestFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            out.push(full);
        }
    }
    return out;
}

/** Extract every import/require specifier string from source text. */
function extractSpecifiers(src) {
    const specs = [];
    const importRe = /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
    const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = importRe.exec(src)) !== null) specs.push(m[1]);
    while ((m = requireRe.exec(src)) !== null) specs.push(m[1]);
    return specs;
}

/**
 * Does this file import at least one real module from outside the __tests__ tree?
 * Relative specifiers are resolved against the file's directory; a specifier that
 * resolves to a path still inside __tests__ is treated as a test helper, not real code.
 */
function importsRealModule(file, specs) {
    const fileDir = path.dirname(file);
    for (const spec of specs) {
        if (!spec.startsWith('.')) continue; // skip bare/node specifiers
        const resolved = path.resolve(fileDir, spec);
        const rel = path.relative(TESTS_ROOT, resolved);
        // Outside __tests__ entirely -> real app module.
        if (rel.startsWith('..')) return true;
    }
    return false;
}

/**
 * Detect the self-mock-and-assert anti-pattern: an object literal containing jest.fn()
 * assigned to an identifier (often via `global.X = {...}`), where that identifier is then
 * the subject of `expect(X.method).toHaveBeenCalled...`.
 */
function hasSelfMockAssertion(src) {
    const mockedNames = new Set();

    // const NAME = { ... jest.fn() ... }
    const constObjRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{[\s\S]*?\}/g;
    let m;
    while ((m = constObjRe.exec(src)) !== null) {
        const body = m[0];
        if (/jest\.fn\s*\(/.test(body)) mockedNames.add(m[1]);
    }

    // global.NAME = { ... jest.fn() ... }  (or window.NAME = ...)
    const globalObjRe = /(?:global|globalThis|window)\.([A-Za-z_$][\w$]*)\s*=\s*\{[\s\S]*?\}/g;
    while ((m = globalObjRe.exec(src)) !== null) {
        const body = m[0];
        if (/jest\.fn\s*\(/.test(body)) mockedNames.add(m[1]);
    }

    if (mockedNames.size === 0) return null;

    // expect(NAME.something)...toHaveBeenCalled
    for (const name of mockedNames) {
        const assertRe = new RegExp(
            `expect\\(\\s*${name}(?:\\.[\\w$]+)+[\\s\\S]*?\\)\\s*(?:\\.[\\w$]+)*\\.toHaveBeenCalled`
        );
        if (assertRe.test(src)) return name;
    }
    return null;
}

/**
 * Scan the test suite and return an array of { file, reasons[] } for any file that
 * trips a tautology heuristic. Empty array means the suite is clean.
 */
function findTautologicalTests(root = TESTS_ROOT) {
    const results = [];
    const files = collectTestFiles(root);

    for (const file of files) {
        const relForAllow = path.relative(root, file).split(path.sep).join('/');
        if (ALLOWLIST.has(relForAllow)) continue;

        const src = fs.readFileSync(file, 'utf8');
        const specs = extractSpecifiers(src);
        const reasons = [];

        if (!importsRealModule(file, specs)) {
            reasons.push('NO_REAL_IMPORT: does not import any real module from outside __tests__');
        }
        const selfMock = hasSelfMockAssertion(src);
        if (selfMock) {
            reasons.push(`SELF_MOCK_ASSERT: asserts toHaveBeenCalled on its own mock "${selfMock}"`);
        }

        if (reasons.length) results.push({ file, reasons });
    }

    return results;
}

module.exports = { findTautologicalTests, TESTS_ROOT, ALLOWLIST };

// CLI entry point.
if (require.main === module) {
    const offenders = findTautologicalTests();
    if (offenders.length === 0) {
        console.log('[check-tautological-tests] OK - no tautological test files detected.');
        process.exit(0);
    }
    console.error('[check-tautological-tests] Found tautological test file(s):\n');
    for (const { file, reasons } of offenders) {
        console.error(`  ${path.relative(process.cwd(), file)}`);
        for (const r of reasons) console.error(`    - ${r}`);
    }
    console.error(
        '\nTests must import and assert against the real application modules. ' +
        'If a file is a legitimate exception, add it to ALLOWLIST in ' +
        'scripts/check-tautological-tests.cjs with a justification.'
    );
    process.exit(1);
}
