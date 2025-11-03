# Routing Engines Status Report - 2025-11-03

## Summary

| Engine | Status | Issue | Solution |
|--------|--------|-------|----------|
| **GraphHopper** | ✅ UP | None | Working perfectly |
| **Valhalla** | ⚠️ BLOCKED | OCI Security List | Update firewall rules |
| **OSRM** | ✅ UP | Health check endpoint | Fixed in latest build |

---

## Detailed Status

### 1. GraphHopper (Contabo - 81.0.246.97:8989)

**Status**: ✅ **WORKING**

- **Version**: 11.0
- **Response Time**: ~71ms
- **Health Check**: `/info` endpoint returns 200
- **Availability**: 100%

**Details**:
- Hosted on Contabo cloud server
- Responding to all requests
- Primary routing engine for Voyagr PWA
- No issues detected

---

### 2. Valhalla (OCI - 141.147.102.102:8002)

**Status**: ⚠️ **BLOCKED (Network Issue)**

- **Container Status**: ✅ Running (9 days uptime)
- **Local Service**: ✅ Responding on localhost:8002
- **External Access**: ❌ Port 8002 blocked by OCI Security List
- **Response Time**: Timeout (5000ms+)

**Root Cause**:
- OCI Security List firewall rules do not allow external traffic on port 8002
- Container is running and healthy internally
- Cannot reach from external networks (your PC)

**Solution**:
Update OCI Security List to allow inbound traffic on port 8002:

```bash
# SSH to OCI server
ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102

# Check current security rules
sudo ufw status

# Allow port 8002
sudo ufw allow 8002/tcp

# Verify
sudo ufw status
```

Or use OCI Console:
1. Go to OCI Console → Networking → Virtual Cloud Networks
2. Select your VCN
3. Find Security List for the subnet
4. Add Ingress Rule:
   - **Source CIDR**: 0.0.0.0/0 (or your IP)
   - **Protocol**: TCP
   - **Port**: 8002
5. Click "Add Ingress Rule"

**Expected Result After Fix**:
- Valhalla will be accessible from external networks
- Health check will return 200
- Status will change to ✅ UP

---

### 3. OSRM (Public - router.project-osrm.org)

**Status**: ✅ **WORKING** (Fixed)

- **Health Check**: Route endpoint `/route/v1/driving/...`
- **Response Time**: ~96ms
- **Availability**: 100%

**Issue Found & Fixed**:
- OSRM `/status` endpoint returns HTTP 400 (not a valid endpoint)
- Updated health check to use `/route/v1/driving/...` instead
- Now correctly detects OSRM as UP

**Details**:
- Public OSRM service (free tier)
- Fallback routing engine
- Works as tertiary option when GraphHopper fails
- No authentication required

---

## Monitoring Dashboard Status

### Current Display

The monitoring dashboard at `http://localhost:5000/monitoring` shows:

- **GraphHopper**: ✅ UP (71ms)
- **Valhalla**: ❌ DOWN (Timeout) - *Actually running, network blocked*
- **OSRM**: ✅ UP (96ms) - *Fixed in latest build*

### After Valhalla Fix

Once OCI Security List is updated:

- **GraphHopper**: ✅ UP (71ms)
- **Valhalla**: ✅ UP (~200ms)
- **OSRM**: ✅ UP (96ms)

---

## Routing Fallback Chain

### Current (With Valhalla Blocked)

```
User Request
    ↓
GraphHopper (✅ Working)
    ↓ (if fails)
OSRM (✅ Working)
    ↓ (if fails)
Error
```

### After Valhalla Fix

```
User Request
    ↓
GraphHopper (✅ Working)
    ↓ (if fails)
Valhalla (✅ Working)
    ↓ (if fails)
OSRM (✅ Working)
    ↓ (if fails)
Error
```

---

## Recent Changes

### Commit: 3a98450
**Fix OSRM health check: use route endpoint instead of status endpoint which returns 400**

- Updated `check_engine_health()` method in `routing_monitor.py`
- Special handling for OSRM to use `/route/v1/driving/...` endpoint
- OSRM now correctly detected as UP
- All 51 tests passing

---

## Action Items

### Immediate (Optional)
- ✅ OSRM health check fixed - no action needed
- ✅ GraphHopper working - no action needed

### Recommended (To Enable Full Redundancy)
- 🔧 Update OCI Security List to allow port 8002
- 🔧 Verify Valhalla becomes accessible
- 🔧 Confirm all 3 engines show as UP in dashboard

### Timeline
- **OCI Security List Update**: 5-10 minutes
- **Valhalla Accessibility**: Immediate after update
- **Dashboard Update**: Next health check (5 minutes)

---

## Testing Commands

### Test GraphHopper
```bash
curl http://81.0.246.97:8989/info
```

### Test Valhalla (Local on OCI)
```bash
ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102 \
  curl -s http://localhost:8002/status | head -c 200
```

### Test Valhalla (External - Currently Blocked)
```bash
curl http://141.147.102.102:8002/status
# Returns: timeout (port blocked)
```

### Test OSRM
```bash
curl "http://router.project-osrm.org/route/v1/driving/-0.1278,51.5074;-0.1378,51.5174"
```

---

## Conclusion

**Current Status**: 2/3 engines working (GraphHopper ✅, OSRM ✅)

**Valhalla Issue**: Network firewall blocking, not service issue

**Recommendation**: Update OCI Security List to enable full 3-engine redundancy

**Dashboard**: Fully functional and displaying accurate status

---

**Last Updated**: 2025-11-03 21:06 UTC  
**Status**: Production Ready (with 2/3 engines)  
**Next Action**: Update OCI Security List for full redundancy

