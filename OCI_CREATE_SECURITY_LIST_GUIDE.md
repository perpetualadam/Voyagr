# OCI Create Security List - Step by Step Guide

## You're in the Right Place!

You found the **Create Security List** dialog. This is where we'll add the ingress rule for Valhalla port 8002.

---

## Step 1: Name the Security List

In the **Name** field, enter:
```
valhalla-security-list
```

**Compartment**: Keep as `anamnesisekklesia (root)` ✅

---

## Step 2: Add Ingress Rule for Port 8002

### Click: **+ Another Ingress Rule**

This will add a new ingress rule row. Fill in:

| Field | Value |
|-------|-------|
| **Stateless** | ☐ (unchecked) |
| **Protocol** | TCP |
| **Source Type** | CIDR |
| **Source CIDR** | 0.0.0.0/0 |
| **Destination Port Range** | 8002 |
| **Description** | Allow Valhalla routing engine access |

### Visual Layout:
```
Stateless: ☐
Protocol: TCP
Source Type: CIDR
Source CIDR: 0.0.0.0/0
Destination Port Range: 8002
Description: Allow Valhalla routing engine access
```

---

## Step 3: Add Default Egress Rule (Optional but Recommended)

### Click: **+ Another Egress Rule**

Fill in:

| Field | Value |
|-------|-------|
| **Stateless** | ☐ (unchecked) |
| **Protocol** | All Protocols |
| **Destination Type** | CIDR |
| **Destination CIDR** | 0.0.0.0/0 |
| **Description** | Allow all outbound traffic |

This allows the container to make outbound requests.

---

## Step 4: Create the Security List

1. Scroll to the bottom
2. Click **Create Security List** button
3. Wait for confirmation (usually 10-30 seconds)

---

## Step 5: Associate Security List with Your Instance

After creating the security list, you need to associate it with your Valhalla instance:

1. Go to **Compute** → **Instances**
2. Click on your instance (the one with Valhalla)
3. Scroll down to **Attached VNICs**
4. Click on the VNIC
5. Scroll to **Security Lists**
6. Click **Edit**
7. **Add** the new `valhalla-security-list` to the list
8. Click **Update**

---

## Step 6: Verify

After 1-2 minutes, test from your PC:

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

## Complete Ingress Rule Configuration

Here's what your ingress rule should look like:

```
┌─────────────────────────────────────────────────────────┐
│ Ingress Rule                                            │
├─────────────────────────────────────────────────────────┤
│ Stateless:              ☐ (unchecked)                   │
│ Protocol:               TCP                             │
│ Source Type:            CIDR                            │
│ Source CIDR:            0.0.0.0/0                       │
│ Destination Port Range: 8002                            │
│ Description:            Allow Valhalla routing engine   │
│                         access                          │
└─────────────────────────────────────────────────────────┘
```

---

## Complete Egress Rule Configuration (Optional)

```
┌─────────────────────────────────────────────────────────┐
│ Egress Rule                                             │
├─────────────────────────────────────────────────────────┤
│ Stateless:              ☐ (unchecked)                   │
│ Protocol:               All Protocols                   │
│ Destination Type:       CIDR                            │
│ Destination CIDR:       0.0.0.0/0                       │
│ Description:            Allow all outbound traffic      │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "I don't see the fields to fill in"
- Make sure you clicked **+ Another Ingress Rule** first
- The fields should appear below

### "I created the security list but Valhalla is still not accessible"
- You need to **associate** the security list with your instance's VNIC
- See **Step 5** above

### "I'm not sure which instance is mine"
- Go to **Compute** → **Instances**
- Look for the instance with IP `141.147.102.102`
- Or look for the one with Valhalla running

---

## Summary

1. ✅ Name: `valhalla-security-list`
2. ✅ Add Ingress Rule: TCP port 8002 from 0.0.0.0/0
3. ✅ Add Egress Rule: All protocols to 0.0.0.0/0 (optional)
4. ✅ Create Security List
5. ✅ Associate with your instance's VNIC
6. ✅ Test: `curl http://141.147.102.102:8002/status`

---

**Time Required**: 5 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla will be accessible from external networks

