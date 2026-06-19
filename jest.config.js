/**
 * Jest Configuration for Voyagr PWA
 */

module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/static/js'],
    testMatch: ['**/__tests__/**/*.test.js'],
    // Coverage is scoped to the files the running app actually loads AND that have
    // behaviour tests. The large unwired parallel module trees were pruned, so there
    // is no longer a phantom codebase inflating/deflating the numbers. Wired-but-untested
    // files (ar-navigation.js, traffic-lights.js) are intentionally excluded here until
    // they get real tests; add them (and a per-file lock) when they do.
    collectCoverageFrom: [
        'static/js/modules/map/weather-layer.js',
        'static/js/modules/navigation/camera-pitch.js',
        'static/js/modules/navigation/turn-instructions.js',
        'static/js/modules/navigation/voice-announcements.js',
        'static/js/modules/navigation/lane-guidance.js',
        'static/js/modules/navigation/reroute-decision.js',
        'static/js/modules/navigation/speed-gps.js',
        'static/js/modules/ui/toggle-ui.js',
        'static/js/modules/services/google-plus-codes-service.js',
        'static/js/maplibre-helpers.js'
    ],
    // Global floor sits just below the current real numbers (maplibre-helpers.js is a
    // large grab-bag whose road-label slice is the only part under test, which pulls the
    // function ratio down). Raise these as maplibre-helpers and the wired-but-untested
    // modules get real tests.
    coverageThreshold: {
        global: {
            branches: 24,
            functions: 20,
            lines: 24,
            statements: 24
        },
        'static/js/modules/map/weather-layer.js': {
            statements: 100, branches: 80, functions: 100, lines: 100
        },
        'static/js/modules/navigation/camera-pitch.js': {
            statements: 100, branches: 80, functions: 100, lines: 100
        },
        'static/js/modules/navigation/turn-instructions.js': {
            statements: 100, branches: 90, functions: 100, lines: 100
        },
        'static/js/modules/navigation/voice-announcements.js': {
            statements: 100, branches: 85, functions: 100, lines: 100
        },
        // statements <100 only because of the defensive `totalLanes < 1` guard mirrored
        // from the monolith, which no road class can actually trigger.
        'static/js/modules/navigation/lane-guidance.js': {
            statements: 95, branches: 85, functions: 100, lines: 100
        },
        'static/js/modules/navigation/reroute-decision.js': {
            statements: 100, branches: 90, functions: 100, lines: 100
        },
        'static/js/modules/navigation/speed-gps.js': {
            statements: 95, branches: 85, functions: 100, lines: 95
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

