# 🔐 OCI Security Rule Guide - Complete Explanation

**Goal:** Add ingress rule for Valhalla port 8002  
**Time:** 5 minutes

---

## ❓ QUESTION 1: What Should I Enter in Source CIDR?

### Answer: Your Public IP Address in CIDR Format

**Format:** `YOUR_PUBLIC_IP/32`

**Example:** If your public IP is `203.0.113.45`, enter: `203.0.113.45/32`

**What does `/32` mean?**
- `/32` = Single IP address (only you)
- `/0` = Everyone (0.0.0.0/0)
- `/24` = Network range (256 addresses)

**For your use case:** Use `/32` (single IP) for security.

---

## ❓ QUESTION 2: How Do I Find My Public IP Address?

### Method 1: Quick Online Check (Easiest)
1. Open your browser
2. Go to: **https://whatismyipaddress.com**
3. Look for "IPv4 Address" (this is your public IP)
4. Copy it

**Example result:** `203.0.113.45`

### Method 2: Using Command Line
```bash
curl -s https://api.ipify.org
```

**Result:** Your public IP will be displayed

### Method 3: Using PowerShell
```powershell
(Invoke-WebRequest -Uri "https://api.ipify.org").Content
```

### Method 4: Check Your Router
1. Go to your router's admin page (usually 192.168.1.1)
2. Look for "WAN IP" or "Public IP"

---

## ❓ QUESTION 3: Will This Allow My PWA to Access Valhalla?

### Answer: YES! ✅

**How it works:**

```
Your PC (203.0.113.45)
    ↓
Browser makes request to http://141.147.102.102:8002
    ↓
Request goes to OCI server
    ↓
OCI Security List checks: "Is source IP 203.0.113.45?"
    ↓
Rule says: "Allow 203.0.113.45/32 on port 8002"
    ↓
✅ Request allowed!
    ↓
Valhalla responds with route data
    ↓
PWA receives route and displays it on map
```

**Yes, your PWA will be able to:**
- ✅ Calculate routes using Valhalla
- ✅ Get turn-by-turn directions
- ✅ Use Valhalla as fallback engine
- ✅ Provide full routing redundancy

---

## ❓ QUESTION 4: What If My IP Address Changes?

### Answer: You'll Need to Update the Rule

**How often does your IP change?**

**If you have a static IP (most home/business connections):**
- ✅ IP rarely changes (months or years)
- ✅ You probably won't need to update

**If you have a dynamic IP (some ISPs):**
- ⚠️ IP might change occasionally (days/weeks)
- ⚠️ You may need to update the rule

**How to check if your IP is static:**
1. Note your current IP from whatismyipaddress.com
2. Wait a few days
3. Check again
4. If it's the same → Static IP ✅
5. If it changed → Dynamic IP ⚠️

**If your IP changes:**
1. Go back to OCI Console
2. Find the security rule you created
3. Edit it with your new IP
4. Takes 1-2 minutes to apply

---

## ❓ QUESTION 5: Should I Use 0.0.0.0/0 Instead?

### Answer: NO - Use Your IP Instead

**Comparison:**

| Approach | Security | Convenience | Recommended |
|----------|----------|-------------|-------------|
| Your IP (`203.0.113.45/32`) | 🟢 High | 🟡 Medium | ✅ YES |
| Anywhere (`0.0.0.0/0`) | 🔴 Low | 🟢 High | ❌ NO |

### Why NOT Use 0.0.0.0/0?

**Security Risks:**
- ❌ Anyone on the internet can access Valhalla
- ❌ Someone could abuse your routing engine
- ❌ Could cause high bandwidth costs
- ❌ Could be used for DDoS attacks
- ❌ Valhalla could be overloaded by strangers

**Example Attack:**
```
Attacker discovers: http://141.147.102.102:8002
Attacker writes script to spam route requests
Your OCI instance gets overloaded
Your costs skyrocket
Your PWA becomes slow
```

### Why Use Your IP (203.0.113.45/32)?

**Security Benefits:**
- ✅ Only you can access Valhalla
- ✅ No risk of abuse
- ✅ No bandwidth waste
- ✅ No DDoS risk
- ✅ Valhalla stays fast for your PWA

**Convenience:**
- ✅ Still works perfectly for your PWA
- ✅ Your PWA is the only client that needs access
- ✅ No performance impact

---

## 🚀 STEP-BY-STEP: ADD THE SECURITY RULE

### Step 1: Find Your Public IP
```
Go to: https://whatismyipaddress.com
Copy your IPv4 address (e.g., 203.0.113.45)
```

### Step 2: Go to OCI Console
```
https://cloud.oracle.com
Sign in with your account
```

### Step 3: Navigate to Security List
1. Click **Networking** (top menu)
2. Click **Virtual Cloud Networks**
3. Find your VCN (Virtual Cloud Network)
4. Click on it
5. Click **Security Lists** (left sidebar)
6. Click the security list for your instance

### Step 4: Add Ingress Rule
1. Click **Add Ingress Rules** button
2. Fill in the form:

| Field | Value |
|-------|-------|
| **Stateless** | No |
| **Source Type** | CIDR |
| **Source CIDR** | `203.0.113.45/32` (your IP) |
| **IP Protocol** | TCP |
| **Destination Port Range** | `8002` |
| **Description** | Valhalla routing engine |

3. Click **Add Ingress Rules**

### Step 5: Wait for Rule to Apply
- Wait 1-2 minutes
- Rule will be active automatically

### Step 6: Test from Your PC
```bash
curl http://141.147.102.102:8002/status
```

**Expected response:**
```json
{"version":"3.5.1","tileset_last_modified":1761414889,...}
```

---

## ✅ VERIFICATION CHECKLIST

After adding the rule:

- [ ] Rule appears in OCI Console
- [ ] 1-2 minutes have passed
- [ ] `curl http://141.147.102.102:8002/status` returns JSON
- [ ] PWA can calculate routes
- [ ] Valhalla appears in fallback chain

---

## 🎯 SUMMARY

| Question | Answer |
|----------|--------|
| **Source CIDR** | Your public IP in format: `203.0.113.45/32` |
| **Find IP** | Go to https://whatismyipaddress.com |
| **PWA Access** | ✅ YES - Will work perfectly |
| **IP Changes** | ⚠️ Rare, but update rule if needed |
| **Use 0.0.0.0/0?** | ❌ NO - Security risk |

---

## 📞 NEED HELP?

**Can't find your IP?**
- Go to https://whatismyipaddress.com
- Look for "IPv4 Address"

**Can't find Security List in OCI?**
- Networking → Virtual Cloud Networks → Your VCN → Security Lists

**Rule not working after 5 minutes?**
- Check IP is correct
- Check port is 8002
- Try: `curl -v http://141.147.102.102:8002/status`

---

## 🔒 SECURITY BEST PRACTICES

✅ **DO:**
- Use your specific IP (`203.0.113.45/32`)
- Update rule if IP changes
- Monitor OCI costs
- Use HTTPS in production

❌ **DON'T:**
- Use `0.0.0.0/0` for production
- Share your OCI IP publicly
- Leave default rules open
- Ignore security warnings

---

**Ready? Find your IP and add the rule!**

