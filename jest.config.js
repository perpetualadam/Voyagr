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
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80
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

