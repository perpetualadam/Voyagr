# Find Security Lists - CORRECT LOCATION

## ⚠️ Common Mistake
You're probably looking at "Security Attributes" which is for **tagging**, not for firewall rules.

---

## ✅ CORRECT PATH

### Method 1: Via Instances (EASIEST)

1. Go to **Compute** → **Instances**
2. Click on your instance: **voyagr-vm** (141.147.102.102)
3. Scroll down to **Attached VNICs** section
4. You'll see:
   ```
   Attached VNICs
   ├── Primary VNIC
   │   ├── VNIC ID: ocid1.vnic.oc1...
   │   ├── MAC Address: 02:00:17:02:18:a6
   │   └── Private IP: 10.0.0.178
   ```
5. **Click on the VNIC ID** (the blue link starting with `ocid1.vnic.oc1...`)
6. This opens the VNIC details page
7. Scroll down to find **Attached Security Lists** section
8. Look for a button that says **Edit** or a **pencil icon (✏️)**
9. Click it

---

### Method 2: Via Network Interfaces

1. Go to **Networking** → **Network Interfaces**
2. Search for MAC: **02:00:17:02:18:a6**
3. Click on it
4. Scroll down to **Attached Security Lists**
5. Click **Edit** or **pencil icon (✏️)**

---

### Method 3: Via Virtual Cloud Networks

1. Go to **Networking** → **Virtual Cloud Networks**
2. Click on your VCN: **valhalla-vcn**
3. In the left sidebar, click **Security Lists**
4. You'll see:
   ```
   Default Security List for valhalla-vcn
   valhalla-security-list (the one you created)
   ```
5. Click on **valhalla-security-list**
6. Scroll down to **Ingress Rules**
7. Verify it has:
   ```
   Protocol: TCP
   Source: 0.0.0.0/0
   Destination Port Range: 8002
   ```

---

## 🔍 What You're Looking For

### On the VNIC Details Page

You should see a section that looks like:

```
┌─────────────────────────────────────────┐
│ Attached Security Lists                 │
├─────────────────────────────────────────┤
│ ☑ Default Security List for valhalla-vcn│
│                                         │
│ [Edit] or [✏️]                          │
└─────────────────────────────────────────┘
```

NOT:

```
┌─────────────────────────────────────────┐
│ Security Attributes                     │
├─────────────────────────────────────────┤
│ [Add Security Attributes]               │
└─────────────────────────────────────────┘
```

---

## ❌ What You're Seeing (Wrong Section)

If you see:
- "Add Security Attributes"
- "Add Tags"
- "Metadata"

You're in the **wrong section**. Scroll up or down to find **"Attached Security Lists"**.

---

## ✅ What You Should See (Right Section)

When you find the right section, it will show:
- A list of security lists (usually just "Default Security List for valhalla-vcn")
- An **Edit** button or **pencil icon (✏️)**
- When you click Edit, a dialog appears with checkboxes for available security lists

---

## Step-by-Step (Method 1 - RECOMMENDED)

1. **Go to Compute → Instances**
2. **Click on voyagr-vm** (the instance with IP 141.147.102.102)
3. **Scroll down** until you see:
   ```
   Attached VNICs
   ```
4. **Click on the VNIC ID** (blue link, starts with ocid1.vnic.oc1...)
5. **On the VNIC page, scroll down** until you see:
   ```
   Attached Security Lists
   ```
6. **Click Edit** or **pencil icon (✏️)**
7. **In the dialog:**
   - Check: ☑ Default Security List for valhalla-vcn
   - Check: ☑ valhalla-security-list
8. **Click Update**

---

## If You Still Can't Find It

Try this alternative:

1. Go to **Networking** → **Virtual Cloud Networks**
2. Click on **valhalla-vcn**
3. In the left sidebar, click **Security Lists**
4. Click on **valhalla-security-list**
5. Verify it has the ingress rule for port 8002:
   ```
   Protocol: TCP
   Source: 0.0.0.0/0
   Destination Port Range: 8002
   ```

If the rule is there, the security list is correctly configured. The issue might be that it's not **attached** to your VNIC.

---

## Troubleshooting

### "I see Security Attributes but not Attached Security Lists"
- Scroll down more on the page
- Or try Method 1 (via Instances)

### "I see Attached Security Lists but no Edit button"
- Look for a **pencil icon (✏️)** instead
- Try clicking directly on the security list name
- Try right-clicking on the security list

### "The Edit button is grayed out"
- You may not have permissions
- Try using OCI CLI instead (see SETUP_OCI_CLI_WITH_API_KEY.md)

### "I don't see valhalla-security-list in the available options"
- Make sure you created it (go to Networking → Security Lists)
- Make sure it's in the same compartment as your instance

---

## Quick Checklist

- [ ] Go to Compute → Instances
- [ ] Click on voyagr-vm
- [ ] Scroll to Attached VNICs
- [ ] Click on VNIC ID (blue link)
- [ ] Scroll to Attached Security Lists
- [ ] Click Edit or pencil icon
- [ ] Check valhalla-security-list
- [ ] Click Update
- [ ] Wait 1-2 minutes
- [ ] Test: curl http://141.147.102.102:8002/status

---

**Time Required**: 3-5 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla accessible from external networks

