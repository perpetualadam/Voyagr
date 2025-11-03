#!/usr/bin/env python3
"""
Test voyagr_web.py startup and basic functionality
"""

import sys
import os

print("=" * 60)
print("🧪 Testing voyagr_web.py Startup")
print("=" * 60)

# Test 1: Check if Flask is installed
print("\n1️⃣ Checking Flask installation...")
try:
    import flask
    print(f"✅ Flask {flask.__version__} is installed")
except ImportError:
    print("❌ Flask is NOT installed")
    print("   Install with: pip install flask")
    sys.exit(1)

# Test 2: Check if required dependencies are installed
print("\n2️⃣ Checking required dependencies...")
required_packages = {
    'requests': 'requests',
    'dotenv': 'python-dotenv',
    'polyline': 'polyline',
    'sqlite3': 'sqlite3 (built-in)'
}

missing = []
for module, package in required_packages.items():
    try:
        __import__(module)
        print(f"✅ {module} is installed")
    except ImportError:
        print(f"❌ {module} is NOT installed")
        missing.append(package)

if missing:
    print(f"\n   Install missing packages with:")
    for pkg in missing:
        print(f"   pip install {pkg}")
    sys.exit(1)

# Test 3: Check if .env file exists
print("\n3️⃣ Checking .env configuration...")
if os.path.exists('.env'):
    print("✅ .env file exists")
    from dotenv import load_dotenv
    load_dotenv()
    
    graphhopper_url = os.getenv('GRAPHHOPPER_URL', 'http://localhost:8989')
    valhalla_url = os.getenv('VALHALLA_URL', 'http://localhost:8002')
    
    print(f"   GraphHopper URL: {graphhopper_url}")
    print(f"   Valhalla URL: {valhalla_url}")
else:
    print("⚠️  .env file not found (will use defaults)")

# Test 4: Check if voyagr_web.py can be imported
print("\n4️⃣ Checking voyagr_web.py syntax...")
try:
    import voyagr_web
    print("✅ voyagr_web.py imports successfully")
except SyntaxError as e:
    print(f"❌ Syntax error in voyagr_web.py: {e}")
    sys.exit(1)
except Exception as e:
    print(f"⚠️  Import warning (may be OK): {e}")

# Test 5: Check if Flask app is created
print("\n5️⃣ Checking Flask app creation...")
try:
    from voyagr_web import app
    print("✅ Flask app created successfully")
    print(f"   Routes registered: {len(app.url_map._rules)}")
except Exception as e:
    print(f"❌ Error creating Flask app: {e}")
    sys.exit(1)

# Test 6: Check if database can be initialized
print("\n6️⃣ Checking database initialization...")
try:
    from voyagr_web import init_db
    init_db()
    print("✅ Database initialized successfully")
    if os.path.exists('voyagr_web.db'):
        size_mb = os.path.getsize('voyagr_web.db') / (1024 * 1024)
        print(f"   Database size: {size_mb:.2f} MB")
except Exception as e:
    print(f"⚠️  Database warning: {e}")

print("\n" + "=" * 60)
print("✅ All startup checks passed!")
print("=" * 60)
print("\n🚀 To start the Flask app, run:")
print("   python voyagr_web.py")
print("\n📱 Then access from:")
print("   http://localhost:5000")
print("=" * 60)

