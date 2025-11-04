#!/bin/bash

# Get OCI Instance Details
echo "Getting OCI Instance Details..."
echo ""

METADATA=$(curl -s http://169.254.169.254/opc/v2/instance/)

# Extract values using grep and sed
INSTANCE_ID=$(echo "$METADATA" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
VNIC_ID=$(echo "$METADATA" | grep -o '"vnicId":"[^"]*' | head -1 | cut -d'"' -f4)
SUBNET_ID=$(echo "$METADATA" | grep -o '"subnetId":"[^"]*' | head -1 | cut -d'"' -f4)
COMPARTMENT_ID=$(echo "$METADATA" | grep -o '"compartmentId":"[^"]*' | head -1 | cut -d'"' -f4)

echo "Instance ID:     $INSTANCE_ID"
echo "VNIC ID:         $VNIC_ID"
echo "Subnet ID:       $SUBNET_ID"
echo "Compartment ID:  $COMPARTMENT_ID"
echo ""

# Get current security lists
echo "Current Security Lists:"
oci network vnic get --vnic-id "$VNIC_ID" 2>/dev/null | grep -A 20 "security-groups" || echo "Could not retrieve security lists"

