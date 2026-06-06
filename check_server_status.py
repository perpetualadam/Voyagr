#!/usr/bin/env python3
"""
Quick diagnostic script to check server status and custom router availability
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


import requests
import json

def check_server():
    """Check if server is running"""
    print("\n" + "=" * 80)
    print("CHECKING SERVER STATUS")
    print("=" * 80)
    
    try:
        response = requests.get("http://localhost:5000/", timeout=5)
        print(f"\n✅ Server is running on localhost:5000")
        print(f"📊 Status Code: {response.status_code}")
        return True
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Server is NOT running on localhost:5000")
        print(f"💡 Start the server with: python voyagr_web.py")
        return False
    except Exception as e:
        print(f"\n❌ Error checking server: {e}")
        return False


def check_custom_router():
    """Check if custom router is available by testing a simple route"""
    print("\n" + "=" * 80)
    print("CHECKING CUSTOM ROUTER STATUS")
    print("=" * 80)
    
    url = "http://localhost:5000/api/route"
    
    # Simple short route to test custom router
    payload = {
        "start": "51.5074,-0.1278",  # London
        "end": "51.5155,-0.1426",     # Paddington (short route)
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False
    }
    
    print(f"\n📤 Testing route: London → Paddington (short route)")
    print(f"⏱️  Waiting for response (timeout: 60s)...")
    
    try:
        import time
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=60)
        elapsed = (time.time() - start_time) * 1000
        
        print(f"\n⏱️  Response Time: {elapsed:.0f}ms")
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            source = data.get('source', 'Unknown')
            
            print(f"\n🚗 Routing Source: {source}")
            
            if "Custom Router" in source:
                print(f"✅ Custom router is WORKING!")
                return True
            else:
                print(f"⚠️  Custom router is NOT being used (fallback to {source})")
                print(f"\n💡 Possible reasons:")
                print(f"   1. Custom router failed to initialize")
                print(f"   2. Custom router timed out")
                print(f"   3. USE_CUSTOM_ROUTER=false in .env")
                print(f"   4. Custom router encountered an error")
                return False
        else:
            print(f"\n❌ Route request failed with status {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print(f"\n❌ Request timed out after 60 seconds")
        print(f"💡 Custom router might be stuck or very slow")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False


def check_env_config():
    """Check .env configuration"""
    print("\n" + "=" * 80)
    print("CHECKING .ENV CONFIGURATION")
    print("=" * 80)
    
    try:
        with open('.env', 'r') as f:
            env_content = f.read()
            
        if 'USE_CUSTOM_ROUTER=true' in env_content:
            print(f"\n✅ USE_CUSTOM_ROUTER=true (custom router enabled)")
            return True
        elif 'USE_CUSTOM_ROUTER=false' in env_content:
            print(f"\n⚠️  USE_CUSTOM_ROUTER=false (custom router disabled)")
            print(f"💡 Change to USE_CUSTOM_ROUTER=true in .env file")
            return False
        else:
            print(f"\n⚠️  USE_CUSTOM_ROUTER not found in .env")
            print(f"💡 Add USE_CUSTOM_ROUTER=true to .env file")
            return False
            
    except FileNotFoundError:
        print(f"\n❌ .env file not found")
        print(f"💡 Create .env file with USE_CUSTOM_ROUTER=true")
        return False
    except Exception as e:
        print(f"\n❌ Error reading .env: {e}")
        return False


def check_database():
    """Check if custom router database exists"""
    print("\n" + "=" * 80)
    print("CHECKING CUSTOM ROUTER DATABASE")
    print("=" * 80)
    
    import os
    
    db_path = "data/uk_router.db"
    
    if os.path.exists(db_path):
        size_mb = os.path.getsize(db_path) / (1024 * 1024)
        print(f"\n✅ Database found: {db_path}")
        print(f"📊 Size: {size_mb:.1f} MB")
        return True
    else:
        print(f"\n❌ Database NOT found: {db_path}")
        print(f"💡 Custom router requires the database file")
        return False


if __name__ == '__main__':
    print("=" * 80)
    print("VOYAGR SERVER DIAGNOSTIC TOOL")
    print("=" * 80)
    
    # Run all checks
    env_ok = check_env_config()
    db_ok = check_database()
    server_ok = check_server()
    
    if server_ok:
        router_ok = check_custom_router()
    else:
        router_ok = False
        print("\n⚠️  Skipping custom router check (server not running)")
    
    # Final summary
    print("\n" + "=" * 80)
    print("DIAGNOSTIC SUMMARY")
    print("=" * 80)
    
    print(f"\n{'✅' if env_ok else '❌'} .env Configuration")
    print(f"{'✅' if db_ok else '❌'} Custom Router Database")
    print(f"{'✅' if server_ok else '❌'} Server Running")
    print(f"{'✅' if router_ok else '❌'} Custom Router Working")
    
    if env_ok and db_ok and server_ok and router_ok:
        print("\n🎉 ALL CHECKS PASSED - Ready for testing!")
    else:
        print("\n⚠️  Some checks failed - see details above")
        
        if not server_ok:
            print("\n📝 Next Step: Start the server")
            print("   cd C:\\Users\\Brian\\OneDrive\\Documents\\augment-projects\\Voyagr")
            print("   python voyagr_web.py")
        elif not router_ok:
            print("\n📝 Next Step: Check server logs for custom router errors")
            print("   Look for '[CUSTOM_ROUTER]' messages in the server output")

