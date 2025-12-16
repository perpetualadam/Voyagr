# Custom Router - Production Deployment Checklist

## Pre-Deployment

- [x] Graph loads successfully (26.5M nodes, 52.6M edges)
- [x] Database indexes created and optimized
- [x] Router service implemented and tested
- [x] Route caching implemented
- [x] Connection pooling implemented
- [x] Performance monitoring implemented
- [x] Integration with voyagr_web.py complete
- [x] All documentation created

## Startup Verification

- [ ] App starts without errors
- [ ] `init_custom_router()` called at startup
- [ ] Graph loads (~14 minutes)
- [ ] Router service ready
- [ ] No memory errors
- [ ] No database connection errors

## Functional Testing

- [ ] Route calculation works
- [ ] Multiple routes calculate correctly
- [ ] Cached routes return quickly
- [ ] K-shortest paths work
- [ ] Error handling works
- [ ] Fallback chain works (Custom → GraphHopper → Valhalla → OSRM)

## Performance Testing

- [ ] First route: ~2 seconds
- [ ] Subsequent routes: ~2 seconds
- [ ] Cached routes: <1ms
- [ ] Cache hit rate: >50%
- [ ] No memory leaks
- [ ] Database queries fast

## Monitoring

- [ ] Performance stats accessible
- [ ] Cache hit rate tracked
- [ ] Error rate tracked
- [ ] Response times tracked
- [ ] Memory usage monitored
- [ ] Uptime tracked

## Production Readiness

- [ ] 16+ GB RAM available
- [ ] 2+ GB disk space available
- [ ] Multi-core CPU available
- [ ] Network connectivity stable
- [ ] Database backups configured
- [ ] Error logging configured
- [ ] Performance logging configured

## Documentation

- [x] Quick start guide created
- [x] Optimization guide created
- [x] Production readiness guide created
- [x] Before/after comparison created
- [x] API documentation updated
- [x] Deployment guide created

## Deployment Steps

1. **Backup Database**
   ```bash
   cp data/uk_router.db data/uk_router.db.backup
   ```

2. **Add Database Indexes** (if not done)
   ```bash
   python add_database_indexes.py
   ```

3. **Start Application**
   ```bash
   python voyagr_web.py
   ```

4. **Wait for Graph Load**
   - Monitor logs for "FULLY LOADED" message
   - Takes ~14 minutes

5. **Verify Router Ready**
   - Check `/api/route/custom` endpoint
   - Should return routes successfully

6. **Monitor Performance**
   - Check cache hit rate
   - Monitor memory usage
   - Track response times

## Rollback Plan

If issues occur:

1. **Stop Application**
   ```bash
   # Kill the process
   ```

2. **Restore Database** (if needed)
   ```bash
   cp data/uk_router.db.backup data/uk_router.db
   ```

3. **Check Logs**
   - Look for error messages
   - Check memory usage
   - Check database connectivity

4. **Restart Application**
   ```bash
   python voyagr_web.py
   ```

## Post-Deployment

- [ ] Monitor for 24 hours
- [ ] Check error logs
- [ ] Verify cache hit rate
- [ ] Monitor memory usage
- [ ] Check response times
- [ ] Verify fallback chain works
- [ ] Document any issues

## Success Criteria

✅ App starts without errors  
✅ Graph loads successfully  
✅ Routes calculate correctly  
✅ Cache hit rate > 50%  
✅ Response times < 2 seconds  
✅ Memory usage stable  
✅ No errors in logs  
✅ Fallback chain works  

---

## Support

### Quick Diagnostics

```python
from custom_router_service import get_router_service

service = get_router_service()
stats = service.get_stats()
print(stats)
```

### Clear Cache (if memory is high)

```python
service.route_cache.clear()
```

### Check Performance

```python
stats = service.get_stats()
print(f"Cache hit rate: {stats['cache']['hit_rate']:.1f}%")
print(f"Memory: {stats['nodes']:,} nodes, {stats['edges']:,} edges")
```

---

## Contact

For issues or questions, refer to:
- `ROUTER_SERVICE_QUICK_START.md` - Quick reference
- `CUSTOM_ROUTER_OPTIMIZATION_GUIDE.md` - Detailed guide
- `CUSTOM_ROUTER_PRODUCTION_READY.md` - Production checklist


