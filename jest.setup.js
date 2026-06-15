/**
 * Jest Setup File
 * Configures test environment and global mocks
 */

// Tests import the real, app-wired modules directly (single source of truth).
// The unwired parallel module trees (api/storage/services/features/routing/core)
// were pruned; only modules the running app loads are kept and tested.

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
global.sessionStorage = sessionStorageMock;

// Mock fetch
global.fetch = jest.fn();

// jsdom does not expose structuredClone; provide the real Node implementation when
// available (Node 17+), otherwise a JSON-based fallback. fake-indexeddb needs it.
if (typeof global.structuredClone !== 'function') {
    try {
        const { structuredClone: nodeStructuredClone } = require('node:util');
        global.structuredClone = nodeStructuredClone || ((v) => JSON.parse(JSON.stringify(v)));
    } catch (_) {
        global.structuredClone = (v) => JSON.parse(JSON.stringify(v));
    }
}

// Mock console methods to reduce noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock navigator.geolocation
const mockGeolocation = {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
};
Object.defineProperty(global.navigator, 'geolocation', {
    value: mockGeolocation,
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
    constructor() { }
    disconnect() { }
    observe() { }
    takeRecords() {
        return [];
    }
    unobserve() { }
};

// Suppress console output during tests
beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    jest.clearAllMocks();
});

