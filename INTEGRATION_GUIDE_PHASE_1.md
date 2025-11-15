# Phase 1 Integration Guide - Request Optimization

## Quick Start

### 1. Install Dependencies
```bash
npm install --save-dev jest babel-jest @babel/preset-env
npm install --save-dev @testing-library/jest-dom
```

### 2. Run Tests
```bash
npm test                    # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

### 3. Integrate APIClient into voyagr-app.js

Add at the top of `static/js/voyagr-app.js`:
```javascript
// Initialize optimized API client
const api = new APIClient({
    enableDedup: true,
    enableCache: true,
    enableBatch: true,
    deduplicationWindow: 5000,
    cache: {
        defaultTTL: 300000,  // 5 minutes
        maxSize: 1000
    },
    batch: {
        batchTimeout: 100,
        maxBatchSize: 10
    }
});
```

### 4. Replace Fetch Calls

**Before**:
```javascript
fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
})
.then(r => r.json())
.then(result => { /* handle */ });
```

**After**:
```javascript
api.post('/api/route', data)
    .then(result => { /* handle */ });
```

### 5. Monitor Performance

Add to your monitoring dashboard:
```javascript
// Get optimization statistics
const stats = api.getStats();
console.log('API Stats:', stats.api);
console.log('Cache Hit Rate:', stats.cache.hitRate);
console.log('Deduplication Rate:', stats.deduplicator.deduplicationRate);
console.log('Batch Efficiency:', stats.batcher.efficiency);
```

## Backend Integration

### Batch Endpoint Added ✅

**Endpoint**: `POST /api/batch`

**Request**:
```json
{
    "requests": [
        {"id": "req1", "endpoint": "/api/route", "data": {...}},
        {"id": "req2", "endpoint": "/api/weather", "data": {...}}
    ]
}
```

**Response**:
```json
{
    "success": true,
    "responses": [
        {"id": "req1", "success": true, "data": {...}},
        {"id": "req2", "success": true, "data": {...}}
    ]
}
```

## Performance Expectations

| Metric | Before | After | Improvement |
|--------|--------|-------|------------|
| API Calls | 100 | 50 | 50% ↓ |
| Page Load | 3s | 2.1s | 30% ↓ |
| Cache Hit Rate | 0% | 45% | +45% |
| Dedup Rate | 0% | 25% | +25% |

## Troubleshooting

### Tests Not Running
```bash
# Clear Jest cache
npx jest --clearCache
npm test
```

### Cache Not Working
```javascript
// Check cache stats
console.log(api.cache.getStats());

// Clear cache if needed
api.cache.clear();
```

### Deduplication Not Working
```javascript
// Check dedup stats
console.log(api.deduplicator.getStats());

// Verify requests are identical
const key = api.deduplicator.generateKey(url, options);
console.log('Request key:', key);
```

## Next Steps

1. ✅ Phase 1: Request Optimization (COMPLETE)
2. ⏳ Phase 2: ES6 Modules Conversion
3. ⏳ Phase 3: Comprehensive Unit Tests
4. ⏳ Phase 4: E2E Tests

## Support

For issues or questions:
1. Check test files for usage examples
2. Review OPTIMIZATION_IMPLEMENTATION_GUIDE.md
3. Check console logs for debug information

