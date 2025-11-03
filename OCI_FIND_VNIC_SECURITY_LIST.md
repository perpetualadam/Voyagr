# Finding VNIC Security List Settings in OCI Console

## The Problem
You created the security list, but now you need to **associate it with your instance**. This is done through the VNIC (Virtual Network Interface Card) settings.

---

## Method 1: Direct Path (Easiest)

### Step 1: Go to Instances
1. Click **☰ (hamburger menu)** in top-left
2. Go to **Compute** → **Instances**
3. Click on your instance (the one with Valhalla at 141.147.102.102)

### Step 2: Find "Attached VNICs" Section
Scroll down on the instance details page until you see:
```
Attached VNICs
├── Primary VNIC
│   ├── VNIC ID: ocid1.vnic.oc1...
│   ├── MAC Address: 02:00:17:02:18:a6
│   └── Private IP: 10.0.0.178
```

### Step 3: Click on the VNIC ID Link
Click on the **VNIC ID** (the blue link that starts with `ocid1.vnic.oc1...`)

This will take you to the VNIC details page.

### Step 4: Find Security Lists Section
On the VNIC details page, scroll down until you see:
```
Security Lists
├── Default Security List for valhalla-vcn
```

**IMPORTANT**: Look for a **pencil icon (✏️)** or **Edit** button next to this section.

### Step 5: Click the Edit Button
Click the **Edit** button or pencil icon next to "Security Lists"

### Step 6: Add Your Security List
In the edit dialog that appears:
1. You'll see a list of available security lists
2. Look for **valhalla-security-list** (the one you just created)
3. **Check the checkbox** next to it to select it
4. Click **Update** button at the bottom

**IMPORTANT**: Make sure BOTH security lists are selected:
- ☑ Default Security List for valhalla-vcn
- ☑ valhalla-security-list

---

## Method 2: Alternative Path (If Method 1 Doesn't Work)

### Step 1: Go to Virtual Cloud Networks
1. Click **☰ (hamburger menu)**
2. Go to **Networking** → **Virtual Cloud Networks**
3. Click on your VCN (Virtual Cloud Network)

### Step 2: Find Subnets
In the left sidebar, click **Subnets**

### Step 3: Click on Your Subnet
Click on the subnet where your instance is located (usually the default subnet)

### Step 4: Find VNICs
Scroll down to find **VNICs** section

### Step 5: Click on Your VNIC
Click on the VNIC that belongs to your instance (look for the private IP 10.0.0.178)

### Step 6: Edit Security Lists
Once on the VNIC details page:
1. Scroll to **Security Lists**
2. Click **Edit**
3. Add **valhalla-security-list**
4. Click **Update**

---

## Method 3: Using Network Interfaces (If Above Methods Don't Work)

### Step 1: Go to Network Interfaces
1. Click **☰ (hamburger menu)**
2. Go to **Networking** → **Network Interfaces**

### Step 2: Find Your Interface
Look for the interface with:
- **Private IP**: 10.0.0.178
- **Instance**: Your Valhalla instance

### Step 3: Click on It
Click on the network interface

### Step 4: Edit Security Lists
1. Scroll to **Security Lists**
2. Click **Edit**
3. Add **valhalla-security-list**
4. Click **Update**

---

## What You're Looking For

When you find the right place, you should see something like:

```
┌─────────────────────────────────────────────────────────┐
│ VNIC Details                                            │
├─────────────────────────────────────────────────────────┤
│ VNIC ID:           ocid1.vnic.oc1.phx.aaaaaa...        │
│ MAC Address:       02:00:17:02:18:a6                   │
│ Private IP:        10.0.0.178                          │
│ Public IP:         141.147.102.102                     │
│                                                         │
│ Security Lists                                          │
│ ├── Default Security List for valhalla-vcn             │
│ └── [Edit] button                                       │
│                                                         │
│ Subnet:            Default Subnet for valhalla-vcn     │
└─────────────────────────────────────────────────────────┘
```

---

## The Edit Dialog

When you click **Edit**, you should see:

```
┌─────────────────────────────────────────────────────────┐
│ Edit Security Lists                                     │
├─────────────────────────────────────────────────────────┤
│ Available Security Lists:                               │
│ ☐ Default Security List for valhalla-vcn               │
│ ☐ valhalla-security-list                               │
│ ☐ Other Security Lists...                              │
│                                                         │
│ [Add] [Remove] [Update]                                │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "I can't find the VNIC section"
- Make sure you're on the **Instance Details** page (not the Instances list)
- Scroll down - it's usually below the "Instance Information" section
- Look for "Attached VNICs" or "Network Interfaces"

### "I see the VNIC but no Security Lists section"
- The Security Lists section might be under a different name
- Look for:
  - "Security Lists"
  - "Network Security Groups"
  - "Firewall Rules"
  - "Attached Security Lists"

### "I can't find an Edit button"
- Try clicking directly on the security list name
- Or look for a **pencil icon** (✏️) next to the security list
- Or right-click on the security list

### "The security list I created isn't showing up"
- Go back to **Networking** → **Security Lists**
- Verify that `valhalla-security-list` was created successfully
- Make sure it's in the same compartment as your instance

---

## Quick Checklist

- [ ] Created security list named `valhalla-security-list`
- [ ] Added ingress rule for TCP port 8002
- [ ] Found your instance in Compute → Instances
- [ ] Found the VNIC section on the instance details page
- [ ] Clicked on the VNIC ID
- [ ] Found the Security Lists section
- [ ] Clicked Edit
- [ ] Added `valhalla-security-list` to the VNIC
- [ ] Clicked Update
- [ ] Waited 1-2 minutes
- [ ] Tested: `curl http://141.147.102.102:8002/status`

---

## Still Having Trouble?

If you're still stuck, try this:

1. **Take a screenshot** of what you're seeing
2. **Tell me the exact menu path** you're following
3. **Describe what sections** you see on the page
4. I can then give you more specific instructions

---

## SIMPLER ALTERNATIVE: Edit Security List Directly

Instead of associating the security list with the VNIC, you can **edit the existing security list** that's already attached to your instance:

### Step 1: Go to Security Lists
1. Click **☰ (hamburger menu)**
2. Go to **Networking** → **Security Lists**

### Step 2: Click on "Default Security List"
Click on the **Default Security List for valhalla-vcn** (the one currently attached to your instance)

### Step 3: Add Ingress Rule
1. Scroll to **Ingress Rules**
2. Click **+ Another Ingress Rule**
3. Fill in:
   - **Stateless**: ☐ (unchecked)
   - **Protocol**: TCP
   - **Source CIDR**: 0.0.0.0/0
   - **Destination Port Range**: 8002
   - **Description**: Allow Valhalla routing engine access
4. Click **Save Changes**

**This is MUCH EASIER** than trying to find the VNIC settings!

---

## Alternative: Use OCI CLI (If Available)

If you have OCI CLI installed on your PC, you can do this from command line:

```bash
# Get your VNIC ID
oci compute instance list-vnics --instance-id <INSTANCE_ID>

# Update the security list
oci network vnic update --vnic-id <VNIC_ID> \
  --security-groups '["ocid1.securitylist.oc1..."]'
```

But the GUI method above is easier if you're not familiar with CLI.

---

## RECOMMENDED: Just Edit the Default Security List

**The easiest solution**:
1. Go to **Networking** → **Security Lists**
2. Click **Default Security List for valhalla-vcn**
3. Click **+ Another Ingress Rule**
4. Add TCP port 8002 from 0.0.0.0/0
5. Click **Save Changes**

Done! No need to find the VNIC settings.

---

**Time Required**: 2-3 minutes
**Difficulty**: Easy (just edit the existing security list)
**Impact**: Valhalla will be accessible

