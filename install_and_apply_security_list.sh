#!/bin/bash

# Complete Script: Install OCI CLI and Apply Security List
# Run this on your OCI instance to automatically fix Valhalla access

set -e

echo "🚀 Installing OCI CLI and Applying Security List..."
echo ""

# Step 1: Update and install dependencies
echo "1️⃣ Installing dependencies..."
sudo apt-get update -qq
sudo apt-get install -y python3-pip curl jq > /dev/null 2>&1
echo "✅ Dependencies installed"
echo ""

# Step 2: Install OCI CLI
echo "2️⃣ Installing OCI CLI..."
pip3 install oci-cli -q 2>/dev/null || pip install oci-cli -q
echo "✅ OCI CLI installed"
echo ""

# Step 3: Verify OCI CLI
echo "3️⃣ Verifying OCI CLI..."
OCI_VERSION=$(oci --version 2>/dev/null | head -1)
echo "✅ OCI CLI version: $OCI_VERSION"
echo ""

# Step 4: Configure OCI CLI with instance principal
echo "4️⃣ Configuring OCI CLI..."
mkdir -p ~/.oci

# Check if config already exists
if [ ! -f ~/.oci/config ]; then
  cat > ~/.oci/config << 'EOF'
[DEFAULT]
auth=instance_principal
EOF
  chmod 600 ~/.oci/config
  echo "✅ OCI CLI configured with instance principal"
else
  echo "✅ OCI CLI already configured"
fi
echo ""

# Step 5: Get instance metadata
echo "5️⃣ Getting instance metadata..."
METADATA=$(curl -s http://169.254.169.254/opc/v2/instance/)

VNIC_ID=$(echo "$METADATA" | jq -r '.primaryVnic.vnicId')
COMPARTMENT_ID=$(echo "$METADATA" | jq -r '.compartmentId')
INSTANCE_ID=$(echo "$METADATA" | jq -r '.id')

echo "✅ Instance ID:     $INSTANCE_ID"
echo "✅ VNIC ID:         $VNIC_ID"
echo "✅ Compartment ID:  $COMPARTMENT_ID"
echo ""

# Step 6: Get security list ID
echo "6️⃣ Getting security list ID..."
SECURITY_LIST_ID=$(oci network security-list list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "valhalla-security-list" \
  --query "data[0].id" \
  --raw-output 2>/dev/null)

if [ -z "$SECURITY_LIST_ID" ] || [ "$SECURITY_LIST_ID" = "None" ]; then
  echo "❌ Security list 'valhalla-security-list' not found!"
  echo ""
  echo "Make sure you created it in the OCI Console first:"
  echo "  1. Go to Networking → Security Lists"
  echo "  2. Click Create Security List"
  echo "  3. Name: valhalla-security-list"
  echo "  4. Add ingress rule for TCP port 8002"
  exit 1
fi

echo "✅ Security List ID: $SECURITY_LIST_ID"
echo ""

# Step 7: Get current security lists for VNIC
echo "7️⃣ Getting current security lists..."
CURRENT_LISTS=$(oci network vnic get \
  --vnic-id "$VNIC_ID" \
  --query "data.'security-groups'" \
  --raw-output 2>/dev/null)

echo "Current security lists: $CURRENT_LISTS"
echo ""

# Step 8: Update VNIC with new security list
echo "8️⃣ Updating VNIC with security list..."
oci network vnic update \
  --vnic-id "$VNIC_ID" \
  --security-groups "[$SECURITY_LIST_ID]" \
  --force 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ VNIC updated successfully!"
else
  echo "⚠️ Warning: VNIC update may have failed"
fi
echo ""

# Step 9: Verify
echo "9️⃣ Verifying security list..."
UPDATED_LISTS=$(oci network vnic get \
  --vnic-id "$VNIC_ID" \
  --query "data.'security-groups'" \
  --raw-output 2>/dev/null)

echo "Updated security lists: $UPDATED_LISTS"
echo ""

# Step 10: Test local access
echo "🔟 Testing local Valhalla access..."
if curl -s http://localhost:8002/status > /dev/null 2>&1; then
  echo "✅ Valhalla is responding locally!"
else
  echo "⚠️ Valhalla not responding locally (may be normal)"
fi
echo ""

echo "✅ All done!"
echo ""
echo "⏳ Waiting 1-2 minutes for OCI to apply changes..."
echo ""
echo "Then test from your PC:"
echo "  curl http://141.147.102.102:8002/status"
echo ""
echo "Expected response: JSON with Valhalla version info"

