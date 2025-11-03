# Setup OCI CLI with API Key (For Instance Principal Issues)

## Problem
Instance principal authentication is not working (403 Forbidden on metadata endpoint).

## Solution
Use API Key authentication instead.

---

## Step 1: Create API Key in OCI Console

1. Go to https://cloud.oracle.com
2. Click your **profile icon** (top-right)
3. Click **My Profile**
4. In the left sidebar, click **API Keys**
5. Click **Add API Key**
6. Select **Generate API Key Pair**
7. Click **Download Private Key** (save as `api_key.pem`)
8. Click **Add**
9. Copy the **Configuration File Preview** (you'll need this)

---

## Step 2: Upload Private Key to Instance

From your PC:

```bash
scp -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key C:\path\to\api_key.pem ubuntu@141.147.102.102:~/.oci/
```

Or if you don't have the key file, create it manually on the instance:

```bash
ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102
mkdir -p ~/.oci
# Then paste the private key content
cat > ~/.oci/api_key.pem << 'EOF'
-----BEGIN RSA PRIVATE KEY-----
[paste your private key here]
-----END RSA PRIVATE KEY-----
EOF

chmod 600 ~/.oci/api_key.pem
```

---

## Step 3: Create OCI Config File

On the instance:

```bash
cat > ~/.oci/config << 'EOF'
[DEFAULT]
user=ocid1.user.oc1..YOUR_USER_OCID
fingerprint=YOUR_FINGERPRINT
key_file=~/.oci/api_key.pem
tenancy=ocid1.tenancy.oc1..YOUR_TENANCY_OCID
region=us-phoenix-1
EOF

chmod 600 ~/.oci/config
```

Replace:
- `YOUR_USER_OCID` - Your user OCID (from OCI Console)
- `YOUR_FINGERPRINT` - The fingerprint shown when you added the API key
- `YOUR_TENANCY_OCID` - Your tenancy OCID

---

## Step 4: Test OCI CLI

```bash
oci iam compartment list
```

If it works, you'll see your compartments.

---

## Step 5: Get Your IDs

Once OCI CLI is working, run this to get your instance details:

```bash
# Get your compartment ID
COMPARTMENT_ID=$(oci iam compartment list --query "data[0].id" --raw-output)
echo "Compartment ID: $COMPARTMENT_ID"

# Get your instance ID (replace with your instance name)
INSTANCE_ID=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --query "data[?display_name=='voyagr-vm'].id" --raw-output | head -1)
echo "Instance ID: $INSTANCE_ID"

# Get VNIC ID
VNIC_ID=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query "data[0].id" --raw-output)
echo "VNIC ID: $VNIC_ID"
```

---

## Step 6: Apply Security List

```bash
# Get security list ID
SECURITY_LIST_ID=$(oci network security-list list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "valhalla-security-list" \
  --query "data[0].id" \
  --raw-output)

echo "Security List ID: $SECURITY_LIST_ID"

# Update VNIC
oci network vnic update \
  --vnic-id "$VNIC_ID" \
  --security-groups "[$SECURITY_LIST_ID]" \
  --force
```

---

## Finding Your OCIDs

### User OCID
1. Go to OCI Console
2. Click profile icon → **My Profile**
3. Copy the **OCID** value

### Tenancy OCID
1. Go to OCI Console
2. Click profile icon → **Tenancy: [name]**
3. Copy the **OCID** value

### Fingerprint
1. Go to OCI Console
2. Click profile icon → **My Profile**
3. Click **API Keys**
4. Find your key and copy the **Fingerprint**

---

## Troubleshooting

### "Invalid credentials"
- Make sure all OCIDs are correct
- Make sure fingerprint matches the key
- Make sure private key file is readable: `chmod 600 ~/.oci/api_key.pem`

### "Permission denied"
- Make sure config file has correct permissions: `chmod 600 ~/.oci/config`

### "Key file not found"
- Make sure private key is in `~/.oci/api_key.pem`
- Check: `ls -la ~/.oci/`

---

## Quick Reference

```bash
# SSH to instance
ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102

# Create config
cat > ~/.oci/config << 'EOF'
[DEFAULT]
user=ocid1.user.oc1..YOUR_USER_OCID
fingerprint=YOUR_FINGERPRINT
key_file=~/.oci/api_key.pem
tenancy=ocid1.tenancy.oc1..YOUR_TENANCY_OCID
region=us-phoenix-1
EOF

# Test
oci iam compartment list

# Apply security list (see Step 6)
```

---

**Time Required**: 10 minutes  
**Difficulty**: Medium  
**Impact**: Full OCI CLI access

