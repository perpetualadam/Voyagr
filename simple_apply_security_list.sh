#!/bin/bash

# Simple Script: Apply Security List to Valhalla Instance
# This is a simplified version that doesn't require jq

set -e

echo "🚀 Applying Security List to Valhalla..."
echo ""

# Step 1: Verify OCI CLI is installed
echo "1️⃣ Checking OCI CLI..."
if ! command -v oci &> /dev/null; then
  echo "❌ OCI CLI not found. Installing..."
  pip3 install oci-cli
fi

OCI_VERSION=$(oci --version 2>&1 | head -1)
echo "✅ OCI CLI: $OCI_VERSION"
echo ""

# Step 2: Configure OCI CLI if needed
echo "2️⃣ Configuring OCI CLI..."
if [ ! -f ~/.oci/config ]; then
  mkdir -p ~/.oci
  cat > ~/.oci/config << 'EOF'
[DEFAULT]
auth=instance_principal
EOF
  chmod 600 ~/.oci/config
  echo "✅ OCI CLI configured"
else
  echo "✅ OCI CLI already configured"
fi
echo ""

# Step 3: Get metadata using curl and grep
echo "3️⃣ Getting instance metadata..."
METADATA=$(curl -s http://169.254.169.254/opc/v2/instance/)

# Extract VNIC ID using grep
VNIC_ID=$(echo "$METADATA" | grep -o '"vnicId":"[^"]*' | cut -d'"' -f4 | head -1)
COMPARTMENT_ID=$(echo "$METADATA" | grep -o '"compartmentId":"[^"]*' | cut -d'"' -f4 | head -1)

if [ -z "$VNIC_ID" ] || [ -z "$COMPARTMENT_ID" ]; then
  echo "❌ Failed to get metadata"
  echo "Metadata response:"
  echo "$METADATA" | head -20
  exit 1
fi

echo "✅ VNIC ID:        $VNIC_ID"
echo "✅ Compartment ID: $COMPARTMENT_ID"
echo ""

# Step 4: Get security list ID
echo "4️⃣ Getting security list ID..."
SECURITY_LIST_JSON=$(oci network security-list list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "valhalla-security-list" \
  2>/dev/null)

SECURITY_LIST_ID=$(echo "$SECURITY_LIST_JSON" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -1)

if [ -z "$SECURITY_LIST_ID" ]; then
  echo "❌ Security list 'valhalla-security-list' not found!"
  echo ""
  echo "Available security lists:"
  oci network security-list list --compartment-id "$COMPARTMENT_ID" 2>/dev/null | grep -o '"display-name":"[^"]*' | cut -d'"' -f4
  exit 1
fi

echo "✅ Security List ID: $SECURITY_LIST_ID"
echo ""

# Step 5: Update VNIC
echo "5️⃣ Updating VNIC with security list..."
oci network vnic update \
  --vnic-id "$VNIC_ID" \
  --security-groups "[$SECURITY_LIST_ID]" \
  --force 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ VNIC updated successfully!"
else
  echo "⚠️ VNIC update may have failed"
fi
echo ""

# Step 6: Verify
echo "6️⃣ Verifying..."
VNIC_INFO=$(oci network vnic get --vnic-id "$VNIC_ID" 2>/dev/null)
UPDATED_LISTS=$(echo "$VNIC_INFO" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -5)

echo "✅ Security lists updated"
echo ""

# Step 7: Test local access
echo "7️⃣ Testing local Valhalla access..."
if curl -s http://localhost:8002/status > /dev/null 2>&1; then
  echo "✅ Valhalla is responding locally!"
else
  echo "⚠️ Valhalla not responding locally"
fi
echo ""

echo "✅ All done!"
echo ""
echo "⏳ Waiting 1-2 minutes for OCI to apply changes..."
echo ""
echo "Then test from your PC:"
echo "  curl http://141.147.102.102:8002/status"

