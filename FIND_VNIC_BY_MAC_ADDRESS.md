# Find Your VNIC by MAC Address

## Your Instance Details

```
Instance IP:     141.147.102.102
Private IP:      10.0.0.178
MAC Address:     02:00:17:02:18:a6
Port:            8002
Service:         Valhalla
```

---

## Step 1: Go to OCI Console

1. Open https://cloud.oracle.com
2. Sign in

---

## Step 2: Navigate to Network Interfaces

1. Click **☰ (hamburger menu)** in top-left
2. Go to **Networking** → **Network Interfaces**

---

## Step 3: Find Your Interface

Look for the interface with MAC address: **02:00:17:02:18:a6**

Or search by:
- **Private IP**: 10.0.0.178
- **Public IP**: 141.147.102.102

Click on it to open the details.

---

## Step 4: Find Security Lists Section

On the Network Interface details page, scroll down until you see:

```
Security Lists
├── Default Security List for valhalla-vcn
```

---

## Step 5: Edit Security Lists

Look for an **Edit** button or **pencil icon (✏️)** next to "Security Lists".

Click it.

---

## Step 6: Add Your Security List

In the edit dialog:

1. You'll see a list of available security lists
2. Find **valhalla-security-list** (the one you created)
3. **Check the checkbox** next to it
4. Make sure BOTH are selected:
   - ☑ Default Security List for valhalla-vcn
   - ☑ valhalla-security-list
5. Click **Update** button

---

## Step 7: Wait and Verify

1. Wait 1-2 minutes for OCI to apply the changes
2. Test from your PC:
   ```bash
   curl http://141.147.102.102:8002/status
   ```

---

## Alternative: Find via Instances

If you can't find it via Network Interfaces:

1. Go to **Compute** → **Instances**
2. Click on your instance (141.147.102.102)
3. Scroll to **Attached VNICs**
4. Click on the VNIC ID (blue link)
5. Scroll to **Security Lists**
6. Click **Edit**
7. Add **valhalla-security-list**
8. Click **Update**

---

## Expected Result

After updating, your security lists should show:

```
Security Lists
├── Default Security List for valhalla-vcn
└── valhalla-security-list
```

---

## Verify Port 8002 is Accessible

From your PC:

```bash
curl http://141.147.102.102:8002/status
```

**Expected response**:
```json
{
  "version": "3.5.1",
  "tileset_last_modified": 1761414889,
  ...
}
```

---

## Troubleshooting

### "I can't find the network interface"
- Try searching by private IP: 10.0.0.178
- Or search by public IP: 141.147.102.102
- Or search by MAC: 02:00:17:02:18:a6

### "I see the interface but no Security Lists section"
- Scroll down more
- Look for "Attached Security Lists" or "Firewall Rules"
- Try the Instances method instead

### "I don't see an Edit button"
- Look for a **pencil icon (✏️)**
- Try clicking directly on the security list name
- Try right-clicking on the security list

### "Still not accessible after updating"
- Wait another 1-2 minutes
- Verify the security list was actually added (refresh the page)
- Check if there's a Network Security Group (NSG) instead
- Try restarting the Valhalla container:
  ```bash
  ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102
  docker restart valhalla
  ```

---

## Quick Checklist

- [ ] Found Network Interface with MAC 02:00:17:02:18:a6
- [ ] Opened the interface details
- [ ] Found Security Lists section
- [ ] Clicked Edit
- [ ] Added valhalla-security-list
- [ ] Clicked Update
- [ ] Waited 1-2 minutes
- [ ] Tested: curl http://141.147.102.102:8002/status
- [ ] Got JSON response with Valhalla version

---

**Time Required**: 3-5 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla accessible from external networks

