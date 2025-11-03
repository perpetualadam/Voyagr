# Modify Default Security List (Simpler Approach)

## Problem
The OCI Console layout is different than expected. Instead of creating a new security list and attaching it, let's just **modify the existing Default Security List** to add port 8002.

This is actually **simpler** and doesn't require attaching anything!

---

## Step 1: Go to Virtual Cloud Networks

1. Click **☰ (hamburger menu)**
2. Go to **Networking** → **Virtual Cloud Networks**

---

## Step 2: Click Your VCN

Click on **valhalla-vcn** (or whatever your VCN is named)

---

## Step 3: Go to Security Lists

In the left sidebar, click **Security Lists**

You'll see:
```
Default Security List for valhalla-vcn
valhalla-security-list (if you created it)
```

---

## Step 4: Click Default Security List

Click on **Default Security List for valhalla-vcn**

---

## Step 5: Find Ingress Rules

On the security list details page, scroll down to find:
```
Ingress Rules
├── [existing rules...]
```

---

## Step 6: Add Ingress Rule

Look for a button that says:
- **Add Ingress Rules**
- **Add Ingress Rule**
- **+ Add Rule**
- Or a **pencil icon (✏️)** next to "Ingress Rules"

Click it.

---

## Step 7: Fill in the Rule

In the dialog that appears, fill in:

| Field | Value |
|-------|-------|
| **Stateless** | ☐ (unchecked) |
| **Protocol** | TCP |
| **Source Type** | CIDR |
| **Source CIDR** | 0.0.0.0/0 |
| **Destination Port Range** | 8002 |
| **Description** | Allow Valhalla routing engine |

---

## Step 8: Save

Click **Add Ingress Rule** or **Save** button

---

## Step 9: Wait 1-2 Minutes

OCI needs time to apply the changes.

---

## Step 10: Test

From your PC:
```bash
curl http://141.147.102.102:8002/status
```

**Expected**: JSON response with Valhalla version ✅

---

## If You Can't Find "Add Ingress Rules"

Try this:

1. On the security list page, look for an **Edit** button or **pencil icon (✏️)**
2. Click it
3. Scroll to **Ingress Rules** section
4. Look for **+ Add Ingress Rule** button
5. Click it
6. Fill in the fields (see Step 7)
7. Click **Save** or **Update**

---

## Visual Guide

### What You're Looking For

```
┌─────────────────────────────────────────┐
│ Ingress Rules                           │
├─────────────────────────────────────────┤
│ Protocol: TCP                           │
│ Source: 0.0.0.0/0                       │
│ Port: 22                                │
│                                         │
│ [+ Add Ingress Rule] or [Edit]          │
└─────────────────────────────────────────┘
```

### After Adding Port 8002

```
┌─────────────────────────────────────────┐
│ Ingress Rules                           │
├─────────────────────────────────────────┤
│ Protocol: TCP                           │
│ Source: 0.0.0.0/0                       │
│ Port: 22                                │
│                                         │
│ Protocol: TCP                           │
│ Source: 0.0.0.0/0                       │
│ Port: 8002  ← NEW RULE                  │
│                                         │
│ [+ Add Ingress Rule]                    │
└─────────────────────────────────────────┘
```

---

## Troubleshooting

### "I don't see Add Ingress Rules button"
- Look for an **Edit** button or **pencil icon (✏️)**
- Try clicking on the security list name
- Try right-clicking on the security list

### "The button is grayed out"
- You may not have permissions
- Try using a different user account with admin privileges

### "I see the rule but Valhalla is still not accessible"
- Wait another 1-2 minutes
- Refresh the page to verify the rule was saved
- Try restarting the Valhalla container:
  ```bash
  ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102
  docker restart valhalla
  ```

### "I don't see my VCN"
- Make sure you're in the correct compartment
- Click on the compartment dropdown and select the right one

---

## Quick Checklist

- [ ] Go to Networking → Virtual Cloud Networks
- [ ] Click on valhalla-vcn
- [ ] Click on Security Lists (in left sidebar)
- [ ] Click on Default Security List for valhalla-vcn
- [ ] Find Ingress Rules section
- [ ] Click Add Ingress Rule (or Edit)
- [ ] Fill in:
  - Protocol: TCP
  - Source: 0.0.0.0/0
  - Port: 8002
- [ ] Click Save/Add
- [ ] Wait 1-2 minutes
- [ ] Test: curl http://141.147.102.102:8002/status

---

**Time Required**: 3-5 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla accessible from external networks

