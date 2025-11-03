# VCN Left Sidebar - Find Network Security Groups

## You're on the Right Page!

You're viewing: **vcn-20251025-1544**

Now look for the **left sidebar** on this page.

---

## What to Look For

On the left side of the page, you should see a menu like:

```
vcn-20251025-1544
├── VCN Details (currently selected)
├── Subnets
├── Security Lists
├── Network Security Groups  ← CLICK HERE
├── Route Tables
├── DHCP Options
├── VCN Flowlogs
└── Peering Connections
```

---

## Step 1: Find the Left Sidebar

Look at the **left side** of your screen. You should see a vertical menu with options.

If you don't see it:
- Scroll left on the page
- Or look for a **hamburger menu (☰)** icon on the left
- Or look for a **sidebar toggle** button

---

## Step 2: Click "Network Security Groups"

In the left sidebar, click on **Network Security Groups**

---

## Step 3: Create NSG

You should see a page with:
- A list of existing NSGs (probably empty)
- A **Create Network Security Group** button

Click **Create Network Security Group**

---

## Step 4: Fill in Details

In the dialog that appears:

```
Name:                    valhalla-nsg
VCN:                     vcn-20251025-1544
Compartment:             anamnesisekklesia (root)
```

Click **Create**

---

## Step 5: Add Ingress Rule

Once created, click on **valhalla-nsg** to open it.

You should see:
```
Ingress Rules
[Add Ingress Rule]

Egress Rules
[Add Egress Rule]
```

Click **Add Ingress Rule**

---

## Step 6: Fill in Rule

In the dialog:

```
Protocol:                TCP
Source Type:             CIDR
Source CIDR:             0.0.0.0/0
Destination Port Range:  8002
Description:             Allow Valhalla routing engine
```

Click **Add Ingress Rule**

---

## Step 7: Attach to VNIC

Now go back to your instance:

1. Go to **Compute** → **Instances**
2. Click on **voyagr-vm**
3. Scroll to **Attached VNICs**
4. Click on the VNIC ID (blue link)
5. Find **Network Security Groups** section
6. Click **Edit**
7. Check the checkbox next to **valhalla-nsg**
8. Click **Update**

---

## Step 8: Test

Wait 1-2 minutes, then:

```bash
curl http://141.147.102.102:8002/status
```

Expected: JSON response ✅

---

## If You Can't Find the Left Sidebar

Try this:

1. Look at the **top-left** of the page
2. You might see tabs or buttons like:
   - **VCN Details**
   - **Subnets**
   - **Security Lists**
   - **Network Security Groups**

If they're displayed as **tabs** instead of a sidebar, click on **Network Security Groups** tab.

---

## Alternative: Search Method

If you still can't find it:

1. Use the search bar at the top of OCI Console
2. Search for: **Network Security Groups**
3. Click on the result
4. Click **Create Network Security Group**
5. Fill in the details (see Step 4)

---

## Quick Checklist

- [ ] On VCN page: vcn-20251025-1544
- [ ] Find left sidebar or tabs
- [ ] Click on Network Security Groups
- [ ] Click Create Network Security Group
- [ ] Name: valhalla-nsg
- [ ] Click Create
- [ ] Click on valhalla-nsg
- [ ] Click Add Ingress Rule
- [ ] Fill in: TCP, 0.0.0.0/0, port 8002
- [ ] Click Add Ingress Rule
- [ ] Go to instance VNIC
- [ ] Edit Network Security Groups
- [ ] Attach valhalla-nsg
- [ ] Click Update
- [ ] Wait 1-2 minutes
- [ ] Test: curl http://141.147.102.102:8002/status

---

**Time Required**: 5-10 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla accessible from external networks

