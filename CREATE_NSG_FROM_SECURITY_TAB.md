# Create Network Security Group from Security Tab

## Perfect! You Found It!

You're on the Security tab of your VCN. You can see:

```
Security Lists
├── valhalla-security-list (Already created!)
└── Default Security List for vcn-20251025-1544

Network Security Groups
├── [Empty - need to create]
└── [Create Network Security Group button]
```

---

## Step 1: Click "Create Network Security Group"

On the page you're viewing, scroll down to the **Network Security Groups** section.

Click the **Create Network Security Group** button.

---

## Step 2: Fill in Details

A dialog will appear. Fill in:

```
Name:                    valhalla-nsg
VCN:                     vcn-20251025-1544
Compartment:             anamnesisekklesia (root)
```

Click **Create**

---

## Step 3: Add Ingress Rule

Once created, you'll be on the NSG details page.

Look for:
```
Ingress Rules
[Add Ingress Rule]
```

Click **Add Ingress Rule**

---

## Step 4: Fill in Rule

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

## Step 5: Attach to Your VNIC

Now you need to attach this NSG to your instance's VNIC:

1. Go to **Compute** → **Instances**
2. Click on **voyagr-vm**
3. Scroll down to **Attached VNICs**
4. Click on the VNIC ID (blue link)
5. Find **Network Security Groups** section
6. Click **Edit**
7. Check the checkbox next to **valhalla-nsg**
8. Click **Update**

---

## Step 6: Wait and Test

Wait 1-2 minutes for OCI to apply changes.

Then test from your PC:

```bash
curl http://141.147.102.102:8002/status
```

**Expected response**: JSON with Valhalla version info ✅

---

## What You Should See After Creating NSG

Back on the Security tab, you should now see:

```
Network Security Groups
├── valhalla-nsg (Available)
└── [Create Network Security Group button]
```

---

## Quick Checklist

- [ ] On VCN Security tab
- [ ] Scroll to Network Security Groups section
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

