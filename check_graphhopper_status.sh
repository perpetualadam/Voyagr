#!/bin/bash
# Check GraphHopper build status on Contabo

echo "🔍 Checking GraphHopper status on Contabo..."
echo ""

# Check if Java process is running
echo "📊 Process Status:"
ssh root@81.0.246.97 "ps aux | grep 'graphhopper-web' | grep -v grep" && echo "✅ GraphHopper is running" || echo "❌ GraphHopper is NOT running"

echo ""
echo "📈 Build Progress:"
ssh root@81.0.246.97 "tail -20 /opt/valhalla/custom_files/graphhopper.log"

echo ""
echo "🌐 Testing API (if ready):"
ssh root@81.0.246.97 "curl -s 'http://localhost:8989/route?points=51.5074,-0.1278&points=51.5174,-0.1278&profile=car' | head -c 200" && echo "✅ API responding" || echo "⏳ Still building..."

echo ""
echo "💾 Disk Usage:"
ssh root@81.0.246.97 "du -sh /opt/valhalla/custom_files/"

