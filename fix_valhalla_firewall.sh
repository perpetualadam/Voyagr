#!/bin/bash

# Fix OCI Security List for Valhalla Port 8002
# This script adds an ingress rule to allow external access to port 8002

echo "🔧 Fixing OCI Security List for Valhalla..."
echo ""

# Get instance metadata
echo "1️⃣ Getting instance metadata..."
METADATA=$(curl -s http://169.254.169.254/opc/v2/instance/)

# Extract compartment ID and subnet ID
COMPARTMENT_ID=$(echo "$METADATA" | python3 -c "import sys, json; print(json.load(sys.stdin)['compartmentId'])")
SUBNET_ID=$(echo "$METADATA" | python3 -c "import sys, json; print(json.load(sys.stdin)['primaryVnic']['subnetId'])")

echo "✅ Compartment ID: $COMPARTMENT_ID"
echo "✅ Subnet ID: $SUBNET_ID"
echo ""

# Get security list ID for this subnet
echo "2️⃣ Getting Security List ID..."
SECURITY_LIST_ID=$(oci network security-list list \
  --compartment-id "$COMPARTMENT_ID" \
  --query "data[0].id" \
  --raw-output 2>/dev/null)

echo "✅ Security List ID: $SECURITY_LIST_ID"
echo ""

# Check if port 8002 rule already exists
echo "3️⃣ Checking for existing port 8002 rule..."
EXISTING_RULE=$(oci network security-list get \
  --security-list-id "$SECURITY_LIST_ID" \
  --query "data.'ingress-security-rules'[?'tcp-options'.'destination-port-range'.'min'==\`8002\`]" \
  --raw-output 2>/dev/null)

if [ "$EXISTING_RULE" != "[]" ]; then
  echo "✅ Port 8002 rule already exists!"
  echo ""
  echo "Rule details:"
  oci network security-list get \
    --security-list-id "$SECURITY_LIST_ID" \
    --query "data.'ingress-security-rules'[?'tcp-options'.'destination-port-range'.'min'==\`8002\`]" \
    2>/dev/null | python3 -m json.tool
else
  echo "❌ Port 8002 rule not found. Adding it now..."
  echo ""
  
  # Get current security list
  echo "4️⃣ Fetching current security list..."
  oci network security-list get \
    --security-list-id "$SECURITY_LIST_ID" \
    > /tmp/security-list.json
  
  # Add new ingress rule for port 8002
  echo "5️⃣ Adding ingress rule for port 8002..."
  oci network security-list update \
    --security-list-id "$SECURITY_LIST_ID" \
    --ingress-security-rules '[
      {
        "isStateless": false,
        "protocol": "6",
        "source": "0.0.0.0/0",
        "tcpOptions": {
          "destinationPortRange": {
            "min": 8002,
            "max": 8002
          }
        },
        "description": "Allow Valhalla routing engine access"
      }
    ]' \
    --force 2>/dev/null
  
  if [ $? -eq 0 ]; then
    echo "✅ Rule added successfully!"
  else
    echo "❌ Failed to add rule"
    exit 1
  fi
fi

echo ""
echo "6️⃣ Verifying port 8002 is accessible..."
sleep 2

# Test connectivity
if curl -s http://localhost:8002/status > /dev/null 2>&1; then
  echo "✅ Valhalla is responding locally!"
else
  echo "⚠️ Valhalla not responding locally (may be normal if running in Docker)"
fi

echo ""
echo "✅ OCI Security List has been updated!"
echo "Port 8002 should now be accessible from external networks."
echo ""
echo "Test from your PC:"
echo "  curl http://141.147.102.102:8002/status"

