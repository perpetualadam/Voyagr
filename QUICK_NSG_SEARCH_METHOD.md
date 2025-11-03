# Quick NSG Creation - Search Bar Method

## Fastest Way to Create NSG

Instead of navigating through menus, use the **search bar** at the top of OCI Console.

---

## Step 1: Click Search Bar

At the very top of OCI Console, there's a search bar. Click on it.

---

## Step 2: Search for NSG

Type: **Network Security Groups**

Press Enter or click the search result.

---

## Step 3: Create NSG

You should see a page with:
- A list of existing NSGs
- A **Create Network Security Group** button

Click **Create Network Security Group**

---

## Step 4: Fill in Details

```
Name:                    valhalla-nsg
VCN:                     vcn-20251025-1544
Compartment:             anamnesisekklesia (root)
```

Click **Create**

---

## Step 5: Add Ingress Rule

Once created, the NSG details page opens.

Look for:
```
Ingress Rules
[Add Ingress Rule]
```

Click **Add Ingress Rule**

---

## Step 6: Fill in Rule

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

Expected: JSON response with Valhalla version ✅

---

## Quick Checklist

- [ ] Click search bar at top of OCI Console
- [ ] Search: Network Security Groups
- [ ] Click Create Network Security Group
- [ ] Name: valhalla-nsg
- [ ] VCN: vcn-20251025-1544
- [ ] Click Create
- [ ] Click Add Ingress Rule
- [ ] Protocol: TCP
- [ ] Source: 0.0.0.0/0
- [ ] Port: 8002
- [ ] Click Add Ingress Rule
- [ ] Go to Compute → Instances
- [ ] Click voyagr-vm
- [ ] Scroll to Attached VNICs
- [ ] Click VNIC ID
- [ ] Find Network Security Groups
- [ ] Click Edit
- [ ] Check valhalla-nsg
- [ ] Click Update
- [ ] Wait 1-2 minutes
- [ ] Test: curl http://141.147.102.102:8002/status

---

**Time Required**: 5 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla accessible from external networks

