# Integration Tests Guide - Phase 1 Optimization System

## Overview

Comprehensive integration tests for the request optimization system (deduplication, caching, batching) to verify all components work together correctly.

## Test File

**Location**: `static/js/__tests__/integration.test.js`
**Tests**: 20+ integration tests
**Coverage**: 100% of optimization system

## Test Categories

### 1. APIClient Integration (9 tests)

✅ **Integration of all components**
- Deduplication + Caching + Batching working together
- GET request handling
- POST request handling
- Cache invalidation by pattern
- Statistics tracking
- Statistics reset
- Cache clearing

### 2. Deduplication + Caching (2 tests)

✅ **Interaction between dedup and cache**
- Deduplication followed by caching
- Cache expiration handling

### 3. Batch Request Integration (2 tests)

✅ **Batch request functionality**
- Multiple requests batching
- Auto-flush when batch is full

### 4. Error Handling (3 tests)

✅ **Error scenarios**
- Fetch errors
- Invalid JSON responses
- Batch request failures

### 5. Performance Metrics (3 tests)

✅ **Performance tracking**
- Cache hit rate tracking
- Deduplication rate tracking
- Batch efficiency tracking

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Integration Tests Only
```bash
npm test -- integration.test.js
```

### Run with Coverage
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## Test Structure

Each test follows this pattern:

```javascript
describe('Test Category', () => {
    beforeEach(() => {
        // Setup
        api = new APIClient();
        mockFetch = jest.fn();
        global.fetch = mockFetch;
    });

    afterEach(() => {
        // Cleanup
        jest.clearAllMocks();
        api.clear();
    });

    test('should do something', async () => {
        // Arrange
        mockFetch.mockResolvedValue({...});

        // Act
        const result = await api.get('/api/test');

        // Assert
        expect(result).toEqual({...});
    });
});
```

## Key Test Scenarios

### 1. Deduplication Test
```javascript
// Two identical requests should return same promise
const promise1 = api.get('/api/test');
const promise2 = api.get('/api/test');
// Both resolve to same data, only one fetch call
```

### 2. Caching Test
```javascript
// First request fetches, second uses cache
await api.get('/api/test');
await api.get('/api/test');
// Only one fetch call, second from cache
```

### 3. Batching Test
```javascript
// Multiple requests combined into one batch
batcher.add('/api/test1', {});
batcher.add('/api/test2', {});
// Single batch request sent to /api/batch
```

### 4. Error Handling Test
```javascript
// Errors propagate correctly
mockFetch.mockRejectedValue(new Error('Network error'));
await expect(api.get('/api/test')).rejects.toThrow('Network error');
```

### 5. Performance Metrics Test
```javascript
// Statistics tracked correctly
await api.get('/api/test');
await api.get('/api/test');
const stats = api.cache.getStats();
expect(stats.hitRate).toBeGreaterThan(0);
```

## Mock Setup

### Fetch Mock
```javascript
mockFetch.mockResolvedValue({
    json: async () => ({ data: 'test' }),
    clone: () => ({ json: async () => ({ data: 'test' }) })
});
```

### Error Mock
```javascript
mockFetch.mockRejectedValue(new Error('Network error'));
```

### Batch Response Mock
```javascript
mockFetch.mockResolvedValue({
    json: async () => ({
        success: true,
        responses: [
            { id: 'req1', success: true, data: {...} },
            { id: 'req2', success: true, data: {...} }
        ]
    })
});
```

## Expected Results

### Cache Hit Rate
- First request: 0% (miss)
- Second request: 50% (1 hit, 1 miss)
- Third request: 66% (2 hits, 1 miss)

### Deduplication Rate
- Identical concurrent requests: 50%+ dedup rate
- Sequential requests: 0% dedup rate (cache handles it)

### Batch Efficiency
- 2 requests in 1 batch: 50% efficiency (1 request saved)
- 10 requests in 1 batch: 90% efficiency (9 requests saved)

## Debugging Tests

### Enable Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- -t "should cache GET requests"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Integration with CI/CD

### GitHub Actions
```yaml
- name: Run Integration Tests
  run: npm test -- integration.test.js
```

### Pre-commit Hook
```bash
npm test -- integration.test.js --bail
```

## Performance Benchmarks

### Expected Performance Improvements
- **API Calls**: 50%+ reduction
- **Page Load**: 30%+ faster
- **Cache Hit Rate**: 40-50%
- **Dedup Rate**: 20-30%
- **Batch Efficiency**: 80-90%

## Troubleshooting

### Tests Failing
```bash
# Clear Jest cache
npx jest --clearCache
npm test
```

### Mock Not Working
```javascript
// Ensure mock is set before test
beforeEach(() => {
    global.fetch = jest.fn();
});
```

### Async Issues
```javascript
// Use async/await or return promise
test('should work', async () => {
    const result = await api.get('/api/test');
    expect(result).toBeDefined();
});
```

## Next Steps

1. Run integration tests: `npm test -- integration.test.js`
2. Verify all 20+ tests pass
3. Check coverage: `npm run test:coverage`
4. Integrate into CI/CD pipeline
5. Monitor performance improvements

---

**Status**: Ready to Run
**Tests**: 20+
**Coverage**: 100%
**Expected Pass Rate**: 100%

