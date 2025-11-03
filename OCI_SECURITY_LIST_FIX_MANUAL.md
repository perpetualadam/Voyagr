# OCI Security List Fix - Manual Steps

## Problem
Valhalla is running and listening on port 8002, but the **OCI Security List** (cloud-level firewall) is blocking external access.

**Proof**:
- ✅ Valhalla container is running
- ✅ Port 8002 is listening (docker-proxy)
- ✅ Local access works (curl http://localhost:8002/status)
- ❌ External access blocked (timeout from your PC)

---

## Solution: Update OCI Security List

### Step 1: Go to OCI Console
1. Open https://cloud.oracle.com
2. Sign in with your OCI account
3. Click the **hamburger menu** (☰) in top-left

### Step 2: Navigate to Security List
1. Go to **Networking** → **Virtual Cloud Networks**
2. Click on your VCN (Virtual Cloud Network)
3. In the left sidebar, click **Security Lists**
4. Click on the **Default Security List** (or the one associated with your subnet)

### Step 3: Add Ingress Rule for Port 8002
1. Scroll down to **Ingress Rules** section
2. Click **Add Ingress Rule**
3. Fill in the following:

```
Stateless:              ☐ (unchecked)
Protocol:               TCP
Source CIDR:            0.0.0.0/0
Destination Port Range: 8002
Description:            Allow Valhalla routing engine access
```

4. Click **Add Ingress Rule**

### Step 4: Verify the Rule
1. The new rule should appear in the Ingress Rules list
2. It should show:
   - **Protocol**: TCP
   - **Source**: 0.0.0.0/0
   - **Destination Port**: 8002

---

## Expected Result

After adding the rule, port 8002 should be accessible within **1-2 minutes**.

### Test from your PC:
```bash
curl http://141.147.102.102:8002/status
```

**Expected response**:
```json
{
  "version": "3.5.1",
  "tileset_last_modified": 1761414889,
  "available_actions": ["status", "centroid", "expansion", ...],
  ...
}
```

---

## Current Network Status

### Instance Details
- **Public IP**: 141.147.102.102
- **Private IP**: 10.0.0.178
- **Port**: 8002
- **Service**: Valhalla (docker-proxy)
- **Status**: ✅ Running and listening

### Firewall Status
- **Host Firewall (UFW)**: ✅ Inactive (not blocking)
- **iptables**: ✅ Rule exists for port 8002
- **OCI Security List**: ❌ **NEEDS UPDATE** (blocking external traffic)

---

## Alternative: Using OCI CLI (If Available)

If you have OCI CLI installed locally:

```bash
# Get your compartment ID and security list ID first
# Then run:

oci network security-list update \
  --security-list-id <SECURITY_LIST_ID> \
  --ingress-security-rules '[
    {
      "isStateless": false,
      "protocol": "6",
      "source": "0.0.0.0/0",
      "tcpOptions": {
        "destinationPortRange": {
          "min": 8002,
          "max": 8002
        }
      },
      "description": "Allow Valhalla routing engine access"
    }
  ]' \
  --force
```

---

## Troubleshooting

### Still timing out after adding the rule?

1. **Wait 2-3 minutes** for OCI to apply the change
2. **Verify the rule was added**:
   - Go back to OCI Console
   - Check Security List → Ingress Rules
   - Confirm port 8002 rule is there
3. **Check if rule is in correct Security List**:
   - Your instance might be using a different Security List
   - Check the instance details to see which Security List is associated
4. **Try from a different network** (mobile hotspot) to rule out local firewall

### Rule added but still not working?

1. **Check if there's a Network Security Group (NSG)**:
   - Go to **Networking** → **Network Security Groups**
   - Check if your instance is in an NSG
   - If yes, add the same rule there too

2. **Restart the Valhalla container**:
   ```bash
   ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102
   docker restart valhalla
   ```

3. **Check OCI logs**:
   - Go to **Logging** → **Logs**
   - Look for any security-related errors

---

## Next Steps After Fix

Once port 8002 is accessible:

1. **Refresh the monitoring dashboard**:
   ```
   http://localhost:5000/monitoring
   ```

2. **Valhalla should show as ✅ UP**

3. **All 3 routing engines will be operational**:
   - GraphHopper: ✅ UP
   - Valhalla: ✅ UP
   - OSRM: ✅ UP

---

**Time Required**: 5 minutes  
**Difficulty**: Easy  
**Impact**: Full routing redundancy enabled

