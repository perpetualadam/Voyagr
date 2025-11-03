# Install OCI CLI on Your OCI Instance

## Why Install OCI CLI?
Once installed, you can run OCI commands directly from your instance to manage security lists, VNICs, and other resources without using the web console.

---

## Quick Install (Recommended)

SSH into your instance and run:

```bash
ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102
```

Then run this command:

```bash
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

This will:
1. Download the OCI CLI installer
2. Install Python dependencies
3. Install OCI CLI
4. Ask you to configure credentials

---

## Step-by-Step Installation

### Step 1: SSH into Your Instance

```bash
ssh -i C:\Users\Brian\Downloads\ssh-key-2025-10-25.key ubuntu@141.147.102.102
```

### Step 2: Update Package Manager

```bash
sudo apt-get update
sudo apt-get install -y python3-pip
```

### Step 3: Install OCI CLI

```bash
pip3 install oci-cli
```

Or use the official installer:

```bash
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

### Step 4: Verify Installation

```bash
oci --version
```

Expected output:
```
3.x.x
```

---

## Configure OCI CLI Credentials

After installation, you need to configure credentials. You have two options:

### Option A: Use Instance Principal (Recommended for OCI Instances)

This allows the instance to authenticate to OCI without storing credentials.

```bash
oci setup config
```

When prompted:
- **Location of config file**: Press Enter (default: ~/.oci/config)
- **User OCID**: Leave blank (we'll use instance principal)
- **Tenancy OCID**: Leave blank
- **Region**: Leave blank

Then add this to your config:

```bash
cat >> ~/.oci/config << 'EOF'

[DEFAULT]
auth=instance_principal
EOF
```

### Option B: Use API Key (If Instance Principal Doesn't Work)

1. Go to OCI Console
2. Click your profile icon (top-right)
3. Go to **My Profile** → **API Keys**
4. Click **Add API Key**
5. Download the private key
6. Upload the private key to your instance:

```bash
# From your PC:
scp -i ssh-key-2025-10-25.key /path/to/api_key.pem ubuntu@141.147.102.102:~/.oci/
```

Then configure:

```bash
oci setup config
```

And fill in:
- **User OCID**: Your user OCID
- **Tenancy OCID**: Your tenancy OCID
- **Region**: Your region (e.g., us-phoenix-1)
- **API Key location**: ~/.oci/api_key.pem

---

## Test OCI CLI

Once configured, test it:

```bash
oci iam compartment list
```

If it works, you'll see your compartments listed.

---

## Now Apply the Security List

Once OCI CLI is installed and configured, you can apply the security list:

```bash
# Get your VNIC ID
VNIC_ID=$(curl -s http://169.254.169.254/opc/v2/instance/ | python3 -c "import sys, json; print(json.load(sys.stdin)['primaryVnic']['vnicId'])")

# Get your compartment ID
COMPARTMENT_ID=$(curl -s http://169.254.169.254/opc/v2/instance/ | python3 -c "import sys, json; print(json.load(sys.stdin)['compartmentId'])")

# Get the security list ID
SECURITY_LIST_ID=$(oci network security-list list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "valhalla-security-list" \
  --query "data[0].id" \
  --raw-output)

# Update the VNIC with the security list
oci network vnic update \
  --vnic-id "$VNIC_ID" \
  --security-groups "[$SECURITY_LIST_ID]" \
  --force
```

---

## Complete Automated Script

Save this as `setup_oci_cli.sh` on your instance:

```bash
#!/bin/bash

echo "🔧 Installing OCI CLI..."

# Update package manager
sudo apt-get update -qq
sudo apt-get install -y python3-pip curl

# Install OCI CLI
echo "Installing OCI CLI..."
pip3 install oci-cli -q

# Verify installation
echo "✅ OCI CLI installed:"
oci --version

# Configure with instance principal
echo ""
echo "Configuring OCI CLI with instance principal..."
mkdir -p ~/.oci

cat >> ~/.oci/config << 'EOF'

[DEFAULT]
auth=instance_principal
EOF

echo "✅ OCI CLI configured"
echo ""
echo "Testing OCI CLI..."
oci iam compartment list --query "data[0].name" --raw-output

if [ $? -eq 0 ]; then
  echo "✅ OCI CLI is working!"
else
  echo "⚠️ OCI CLI test failed - you may need to configure credentials manually"
fi
```

Run it:

```bash
bash setup_oci_cli.sh
```

---

## Troubleshooting

### "oci: command not found"
- Make sure pip3 installed it to a location in your PATH
- Try: `python3 -m pip install oci-cli`
- Or: `~/.local/bin/oci --version`

### "Error: Instance principal authentication failed"
- Instance principal may not be enabled for your instance
- Use Option B (API Key) instead

### "Error: Invalid credentials"
- Make sure your config file is correct
- Check: `cat ~/.oci/config`
- Verify OCID values are correct

### "Permission denied"
- Make sure the config file has correct permissions:
  ```bash
  chmod 600 ~/.oci/config
  chmod 700 ~/.oci
  ```

---

## Next Steps

Once OCI CLI is installed and working:

1. Run the security list update script above
2. Wait 1-2 minutes
3. Test from your PC:
   ```bash
   curl http://141.147.102.102:8002/status
   ```
4. Valhalla should now be accessible!

---

## Quick Reference

```bash
# SSH into instance
ssh -i ssh-key-2025-10-25.key ubuntu@141.147.102.102

# Install OCI CLI
pip3 install oci-cli

# Configure
oci setup config

# Test
oci iam compartment list

# Apply security list (see script above)
```

---

**Time Required**: 5-10 minutes  
**Difficulty**: Medium  
**Impact**: Full automation of OCI management from instance

