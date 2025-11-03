# ⚡ OCI Security Rule - Quick Steps

**Goal:** Add port 8002 rule for Valhalla  
**Time:** 5 minutes

---

## 🔍 STEP 1: FIND YOUR PUBLIC IP (1 minute)

### Option A: Easiest (Recommended)
1. Open browser
2. Go to: **https://whatismyipaddress.com**
3. Look for **"IPv4 Address"**
4. Copy it (e.g., `203.0.113.45`)

### Option B: Command Line
```bash
curl -s https://api.ipify.org
```

---

## 🔐 STEP 2: GO TO OCI CONSOLE (1 minute)

1. Open: **https://cloud.oracle.com**
2. Sign in with your account
3. You should see the OCI dashboard

---

## 📍 STEP 3: NAVIGATE TO SECURITY LIST (2 minutes)

**Path:**
```
Networking 
  → Virtual Cloud Networks
    → [Your VCN Name]
      → Security Lists
        → [Your Security List]
```

**Visual Guide:**
```
Top Menu: Click "Networking"
         ↓
Left Sidebar: Click "Virtual Cloud Networks"
         ↓
Find your VCN (usually named "Default" or similar)
         ↓
Click on it
         ↓
Left Sidebar: Click "Security Lists"
         ↓
Click the security list (usually "Default Security List")
```

---

## ➕ STEP 4: ADD INGRESS RULE (1 minute)

1. Click **"Add Ingress Rules"** button
2. Fill in the form:

```
┌─────────────────────────────────────────┐
│ Add Ingress Rules                       │
├─────────────────────────────────────────┤
│ Stateless:              [No]            │
│ Source Type:            [CIDR]          │
│ Source CIDR:            [203.0.113.45/32] ← YOUR IP HERE
│ IP Protocol:            [TCP]           │
│ Destination Port Range: [8002]          │
│ Description:            [Valhalla routing engine] │
│                                         │
│ [Add Ingress Rules]                     │
└─────────────────────────────────────────┘
```

**Key Fields:**
- **Source CIDR:** Replace `203.0.113.45` with YOUR IP from Step 1
- **Destination Port Range:** Must be `8002`
- **IP Protocol:** Must be `TCP`

3. Click **"Add Ingress Rules"** button

---

## ⏳ STEP 5: WAIT (1-2 minutes)

The rule will be applied automatically. You'll see it in the list.

---

## ✅ STEP 6: TEST (1 minute)

### Test 1: From Command Line
```bash
curl http://141.147.102.102:8002/status
```

**Expected:** JSON response with version info

### Test 2: From Browser
```
http://141.147.102.102:8002/status
```

**Expected:** JSON displayed in browser

### Test 3: Route Calculation
```bash
curl -X POST http://141.147.102.102:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 51.5174, "lon": -0.1378}
    ],
    "costing": "auto"
  }'
```

**Expected:** Route data with distance and time

---

## 🎯 WHAT TO ENTER IN SOURCE CIDR

### Your IP Format
```
203.0.113.45/32
│              │
│              └─ /32 means "single IP address"
└─ Your public IP from Step 1
```

### Examples
```
If your IP is:          Enter:
203.0.113.45      →     203.0.113.45/32
192.168.1.100     →     192.168.1.100/32
10.0.0.50         →     10.0.0.50/32
```

### DO NOT Enter
```
❌ 0.0.0.0/0          (allows everyone - security risk)
❌ 203.0.113.45       (missing /32)
❌ 203.0.113.45/24    (allows 256 IPs)
❌ localhost          (won't work)
❌ 127.0.0.1          (won't work)
```

---

## ✅ VERIFICATION CHECKLIST

After adding the rule:

- [ ] Rule appears in OCI Console
- [ ] Status shows "Active"
- [ ] 1-2 minutes have passed
- [ ] `curl http://141.147.102.102:8002/status` works
- [ ] Browser can access `http://141.147.102.102:8002/status`
- [ ] Route calculation returns data

---

## 🚀 WHAT HAPPENS NEXT

Once the rule is active:

1. **Your PWA can access Valhalla** ✅
2. **Valhalla becomes fallback routing engine** ✅
3. **Full redundancy:** GraphHopper → Valhalla → OSRM ✅
4. **Better route quality** ✅

---

## 🆘 TROUBLESHOOTING

### Problem: "Connection refused" or timeout
**Solution:**
- Wait 2-3 minutes for rule to apply
- Check your IP is correct (use whatismyipaddress.com again)
- Check port is `8002` (not 8001 or 8003)

### Problem: "Permission denied"
**Solution:**
- Make sure you're logged into OCI Console
- Make sure you have permissions to edit security lists

### Problem: Can't find Security List
**Solution:**
- Go to: Networking → Virtual Cloud Networks
- Click on your VCN
- Look for "Security Lists" in left sidebar

### Problem: Rule added but still not working
**Solution:**
- Wait 5 minutes (sometimes takes longer)
- Try: `curl -v http://141.147.102.102:8002/status` (verbose mode)
- Check if your IP changed (go to whatismyipaddress.com again)

---

## 📋 QUICK REFERENCE

| Step | Action | Time |
|------|--------|------|
| 1 | Find your IP | 1 min |
| 2 | Go to OCI Console | 1 min |
| 3 | Navigate to Security List | 2 min |
| 4 | Add ingress rule | 1 min |
| 5 | Wait for rule to apply | 1-2 min |
| 6 | Test | 1 min |
| **Total** | | **7-8 min** |

---

## 🎯 SUMMARY

**What to enter in Source CIDR:**
```
YOUR_PUBLIC_IP/32
```

**Example:**
```
203.0.113.45/32
```

**Will it work for PWA?**
```
✅ YES - Your PWA will access Valhalla perfectly
```

**If IP changes?**
```
⚠️ Rare, but update rule if needed
```

**Use 0.0.0.0/0?**
```
❌ NO - Security risk
```

---

**Ready? Start with Step 1: Find your IP!**

