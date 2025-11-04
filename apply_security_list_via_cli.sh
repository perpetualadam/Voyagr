#!/bin/bash

# Apply Security List to Valhalla Instance via OCI CLI
# This script automates the process of associating the security list with the VNIC

echo "🔧 Applying Security List to Valhalla Instance..."
echo ""

# Get instance details
INSTANCE_IP="141.147.102.102"
SECURITY_LIST_NAME="valhalla-security-list"

echo "1️⃣ Getting instance details..."
# Note: You'll need to set these variables based on your OCI setup
# COMPARTMENT_ID="ocid1.compartment.oc1..aaaaaa..."
# INSTANCE_ID="ocid1.instance.oc1..aaaaaa..."

# For now, let's get the VNIC ID from the instance
echo "Getting VNIC ID for instance..."

# List all VNICs and find the one with our instance
VNIC_ID=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_ID" \
  --query "data[0].id" \
  --raw-output 2>/dev/null)

if [ -z "$VNIC_ID" ]; then
  echo "❌ Could not find VNIC ID"
  echo ""
  echo "Please provide your INSTANCE_ID:"
  echo "  Go to Compute → Instances"
  echo "  Click on your instance"
  echo "  Copy the OCID from the Instance ID field"
  exit 1
fi

echo "✅ VNIC ID: $VNIC_ID"
echo ""

# Get the security list ID
echo "2️⃣ Getting Security List ID..."
SECURITY_LIST_ID=$(oci network security-list list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "$SECURITY_LIST_NAME" \
  --query "data[0].id" \
  --raw-output 2>/dev/null)

if [ -z "$SECURITY_LIST_ID" ]; then
  echo "❌ Could not find security list: $SECURITY_LIST_NAME"
  echo ""
  echo "Make sure you created the security list first!"
  exit 1
fi

echo "✅ Security List ID: $SECURITY_LIST_ID"
echo ""

# Get current security lists for the VNIC
echo "3️⃣ Getting current security lists for VNIC..."
CURRENT_LISTS=$(oci network vnic get \
  --vnic-id "$VNIC_ID" \
  --query "data.'security-groups'" \
  --raw-output 2>/dev/null)

echo "Current security lists: $CURRENT_LISTS"
echo ""

# Update VNIC with new security list
echo "4️⃣ Adding security list to VNIC..."
oci network vnic update \
  --vnic-id "$VNIC_ID" \
  --security-groups "[$SECURITY_LIST_ID]" \
  --force 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ Security list added successfully!"
else
  echo "❌ Failed to add security list"
  exit 1
fi

echo ""
echo "5️⃣ Verifying..."
UPDATED_LISTS=$(oci network vnic get \
  --vnic-id "$VNIC_ID" \
  --query "data.'security-groups'" \
  --raw-output 2>/dev/null)

echo "Updated security lists: $UPDATED_LISTS"
echo ""

echo "✅ Done! Waiting 1-2 minutes for changes to take effect..."
echo ""
echo "Test from your PC:"
echo "  curl http://141.147.102.102:8002/status"

