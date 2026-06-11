/**
 * Jest Configuration for Voyagr PWA
 */

module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/static/js'],
    testMatch: ['**/__tests__/**/*.test.js'],
    collectCoverageFrom: [
        'static/js/**/*.js',
        '!static/js/__tests__/**',
        '!static/js/voyagr-app.js',
        '!static/js/voyagr-core.js',
        '!static/js/app.js'
    ],
    // Coverage is collected across the whole front-end (minus the monolith scripts),
    // so the global numbers are a regression FLOOR rather than an aspiration. The
    // well-tested, behaviour-first modules get high per-file locks so their quality
    // cannot silently regress. As more of the suite is converted to real tests, raise
    // the global floor and add more per-file locks.
    coverageThreshold: {
        global: {
            branches: 25,
            functions: 33,
            lines: 25,
            statements: 25
        },
        'static/js/modules/api/deduplicator.js': {
            statements: 100, branches: 88, functions: 100, lines: 100
        },
        'static/js/modules/api/cache.js': {
            statements: 95, branches: 78, functions: 100, lines: 98
        },
        'static/js/modules/api/batcher.js': {
            statements: 84, branches: 68, functions: 75, lines: 90
        },
        'static/js/modules/api/client.js': {
            statements: 82, branches: 68, functions: 95, lines: 82
        },
        'static/js/modules/map/weather-layer.js': {
            statements: 100, branches: 80, functions: 100, lines: 100
        },
        'static/js/modules/navigation/camera-pitch.js': {
            statements: 100, branches: 80, functions: 100, lines: 100
        },
        'static/js/modules/ui/toggle-ui.js': {
            statements: 95, branches: 70, functions: 100, lines: 100
        }
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/static/js/$1'
    },
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testTimeout: 10000,
    verbose: true,
    bail: false,
    maxWorkers: '50%',
    transform: {
        '^.+\\.js$': 'babel-jest'
    }
};

