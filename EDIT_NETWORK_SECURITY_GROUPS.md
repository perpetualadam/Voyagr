# Edit Network Security Groups (NSG) - CORRECT METHOD

## ✅ You Found It!

You're looking at the VNIC details page. The section you need is:

```
Network Security Groups
[Edit]
```

This is where you configure firewall rules for your instance!

---

## Step-by-Step

### Step 1: Click "Edit" Button

On the VNIC details page, find:
```
Network Security Groups
[Edit]
```

Click the **Edit** button.

---

### Step 2: Add Network Security Group

A dialog will appear. You should see:
- A list of available Network Security Groups (NSGs)
- Checkboxes to select them
- An "Update" or "Save" button

---

### Step 3: Look for Your NSG

Look for a Network Security Group named:
- **valhalla-nsg** (if you created one)
- Or the default NSG for your VCN

If you don't see one, you may need to create it first.

---

### Step 4: Check the NSG

Check the checkbox next to the NSG you want to use.

---

### Step 5: Click Update

Click the **Update** or **Save** button.

---

## Alternative: Create a New NSG

If you don't have an NSG yet, you need to create one first:

1. Go to **Networking** → **Network Security Groups**
2. Click **Create Network Security Group**
3. Name: **valhalla-nsg**
4. VCN: **vcn-20251025-1544**
5. Click **Create**
6. Once created, click on it
7. Click **Add Ingress Rule**
8. Fill in:
   - **Protocol**: TCP
   - **Source Type**: CIDR
   - **Source CIDR**: 0.0.0.0/0
   - **Destination Port Range**: 8002
9. Click **Add Ingress Rule**
10. Then go back to your VNIC and attach this NSG (Steps 1-5 above)

---

## What's a Network Security Group (NSG)?

NSGs are like security lists but more flexible. They:
- Control inbound/outbound traffic
- Can be attached to VNICs
- Are more granular than security lists

---

## After Editing

1. Wait 1-2 minutes for OCI to apply changes
2. Test from your PC:
   ```bash
   curl http://141.147.102.102:8002/status
   ```
3. Expected: JSON response with Valhalla version ✅

---

## Troubleshooting

### "I don't see any NSGs in the list"
- You need to create one first (see "Create a New NSG" section above)

### "The Edit button is grayed out"
- You may not have permissions
- Try using a different user account

### "Still not accessible after editing"
- Wait another 1-2 minutes
- Verify the NSG has the correct ingress rule for port 8002
- Try restarting the Valhalla container:
  ```bash
  ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102
  docker restart valhalla
  ```

---

## Quick Checklist

- [ ] On VNIC details page
- [ ] Find "Network Security Groups" section
- [ ] Click "Edit" button
- [ ] Select/create NSG with port 8002 rule
- [ ] Click "Update"
- [ ] Wait 1-2 minutes
- [ ] Test: curl http://141.147.102.102:8002/status

---

**Time Required**: 3-5 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla accessible from external networks

