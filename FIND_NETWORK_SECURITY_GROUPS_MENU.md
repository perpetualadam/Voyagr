# Find Network Security Groups in OCI Console

## Your Networking Menu

```
Networking
├── Overview
├── Virtual cloud networks
├── Web Application Acceleration
├── Load balancers
│   ├── Overview
│   ├── Load balancer
│   ├── Network load balancer
├── DNS management
│   ├── Overview
│   ├── Public zones
│   ├── Private zones
│   ├── Traffic management steering policies
│   ├── Private views
│   ├── Private resolvers
│   ├── HTTP redirects
│   ├── TSIG keys
├── Customer connectivity
│   ├── Overview
│   ├── Site-to-Site VPN
│   ├── FastConnect
│   ├── Dynamic routing gateway
│   ├── Customer-premises equipment
├── Cluster Placement Groups
├── IP management
│   ├── Overview
│   ├── Reserved public IPs
│   ├── BYOIP
│   ├── Public IP pools
│   ├── IP Address Insights
│   ├── BYOASN
├── Network Command Center
│   ├── Overview
│   ├── Network visualizer
│   ├── Network Path Analyzer
│   ├── Inter-region latency
│   ├── Capture filters
│   ├── VTAPs
│   ├── Flow logs
```

---

## Where to Find Network Security Groups

**Network Security Groups** should be under:

### **Option 1: Virtual Cloud Networks**
1. Click **Networking** → **Virtual cloud networks**
2. Click on your VCN: **vcn-20251025-1544**
3. In the left sidebar, look for **Network Security Groups**

### **Option 2: Direct Search**
1. Use the search bar at the top of OCI Console
2. Search for: **Network Security Groups**
3. Click on the result

### **Option 3: Via Instance**
1. Go to **Compute** → **Instances**
2. Click on **voyagr-vm**
3. Scroll to **Attached VNICs**
4. Click on the VNIC ID
5. Find **Network Security Groups** section
6. Click **Edit**

---

## Simplest Path: Use Virtual Cloud Networks

1. Click **Networking** → **Virtual cloud networks**
2. Click on **vcn-20251025-1544**
3. In the left sidebar, you should see options like:
   ```
   VCN Details
   Subnets
   Security Lists
   Network Security Groups  ← CLICK HERE
   Route Tables
   DHCP Options
   ```
4. Click **Network Security Groups**
5. Click **Create Network Security Group**
6. Name: **valhalla-nsg**
7. VCN: **vcn-20251025-1544**
8. Click **Create**

---

## After Creating NSG

1. Click on the NSG you just created
2. Click **Add Ingress Rule**
3. Fill in:
   ```
   Protocol:                TCP
   Source Type:             CIDR
   Source CIDR:             0.0.0.0/0
   Destination Port Range:  8002
   ```
4. Click **Add Ingress Rule**

---

## Attach NSG to Your VNIC

1. Go to **Compute** → **Instances**
2. Click on **voyagr-vm**
3. Scroll to **Attached VNICs**
4. Click on the VNIC ID
5. Find **Network Security Groups** section
6. Click **Edit**
7. Check the checkbox next to **valhalla-nsg**
8. Click **Update**

---

## Test

Wait 1-2 minutes, then:

```bash
curl http://141.147.102.102:8002/status
```

Expected: JSON response with Valhalla version ✅

---

## If You Still Can't Find It

Try the **search bar** approach:

1. At the top of OCI Console, there's a search bar
2. Type: **Network Security Groups**
3. Press Enter
4. Click on the result
5. Click **Create Network Security Group**

---

## Quick Checklist

- [ ] Go to Networking → Virtual cloud networks
- [ ] Click on vcn-20251025-1544
- [ ] Find Network Security Groups in left sidebar
- [ ] Create new NSG: valhalla-nsg
- [ ] Add ingress rule for TCP port 8002
- [ ] Go back to instance VNIC
- [ ] Edit Network Security Groups
- [ ] Attach valhalla-nsg
- [ ] Wait 1-2 minutes
- [ ] Test: curl http://141.147.102.102:8002/status

---

**Time Required**: 5-10 minutes  
**Difficulty**: Easy  
**Impact**: Valhalla accessible from external networks

