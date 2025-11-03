# Valhalla Quick Fix - Enable External Access

## Problem

Valhalla is running on OCI but cannot be accessed from external networks (your PC).

**Symptoms**:
- Dashboard shows Valhalla as ❌ DOWN
- Timeout when trying to connect to `http://141.147.102.102:8002`
- SSH to OCI shows container is running and responding locally

**Root Cause**: OCI Security List firewall blocks port 8002

---

## Quick Fix (5 minutes)

### Option 1: Using SSH (Recommended)

```bash
# 1. SSH to OCI server
ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102

# 2. Allow port 8002 in firewall
sudo ufw allow 8002/tcp

# 3. Verify it's open
sudo ufw status

# 4. Exit SSH
exit
```

### Option 2: Using OCI Console (Web UI)

1. Go to https://cloud.oracle.com
2. Sign in to your OCI account
3. Navigate to **Networking** → **Virtual Cloud Networks**
4. Select your VCN (Virtual Cloud Network)
5. Click on the **Security List** for your subnet
6. Click **Add Ingress Rule**
7. Fill in:
   - **Source CIDR**: `0.0.0.0/0` (allow from anywhere)
   - **Protocol**: `TCP`
   - **Destination Port Range**: `8002`
8. Click **Add Ingress Rule**
9. Wait 1-2 minutes for changes to apply

---

## Verification

### Test 1: Check if port is open
```bash
# From your PC
curl http://141.147.102.102:8002/status
```

**Expected Response**:
```json
{"version":"3.5.1","tileset_last_modified":1761414889,...}
```

### Test 2: Check dashboard
1. Refresh http://localhost:5000/monitoring
2. Look for Valhalla status
3. Should show ✅ UP instead of ❌ DOWN

### Test 3: Check health check logs
```bash
# The monitoring system will automatically detect the change
# Next health check in ~5 minutes
# Or manually trigger: http://localhost:5000/api/monitoring/health-check
```

---

## Expected Results After Fix

### Dashboard Status
```
GraphHopper: ✅ UP (71ms)
Valhalla:    ✅ UP (200ms)  ← Changed from ❌ DOWN
OSRM:        ✅ UP (96ms)
```

### Routing Redundancy
```
User Request
    ↓
GraphHopper (Primary)
    ↓ (if fails)
Valhalla (Secondary)
    ↓ (if fails)
OSRM (Tertiary)
```

---

## Troubleshooting

### Still timing out after fix?

1. **Wait 2-3 minutes** for OCI to apply the security rule
2. **Verify SSH access** still works:
   ```bash
   ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102 echo "Connected"
   ```

3. **Check if container is running**:
   ```bash
   ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102 docker ps | grep valhalla
   ```

4. **Check firewall status on OCI**:
   ```bash
   ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102 sudo ufw status
   ```

### Port 8002 still shows as closed?

1. Check OCI Security List (not just UFW):
   - Go to OCI Console
   - Verify Ingress Rule for port 8002 exists
   - Check if rule is in correct Security List

2. Restart Valhalla container:
   ```bash
   ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102 docker restart valhalla
   ```

3. Check container logs:
   ```bash
   ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102 docker logs valhalla | tail -20
   ```

---

## Security Considerations

### Current Setting: `0.0.0.0/0`
- Allows access from **any IP address**
- Good for development/testing
- Not recommended for production

### Production Setting: Restrict to your IP
Replace `0.0.0.0/0` with your IP:
```
YOUR_IP/32
```

Example: `203.0.113.42/32` (replace with your actual IP)

---

## Monitoring After Fix

The dashboard will automatically:
1. Detect Valhalla is now accessible
2. Update status to ✅ UP
3. Start tracking response times
4. Include in routing fallback chain

No manual restart needed!

---

## Files Updated

- `routing_monitor.py`: Fixed OSRM health check (commit 3a98450)
- `ROUTING_ENGINES_STATUS_REPORT.md`: Detailed status report
- `VALHALLA_QUICK_FIX.md`: This file

---

## Next Steps

1. ✅ Apply the firewall rule (5 minutes)
2. ✅ Verify Valhalla is accessible (1 minute)
3. ✅ Refresh dashboard (automatic in 5 minutes)
4. ✅ Confirm all 3 engines show as UP

---

**Status**: Ready to fix  
**Time Required**: 5-10 minutes  
**Difficulty**: Easy  
**Impact**: Full routing redundancy enabled

