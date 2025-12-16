#!/usr/bin/env python3
"""
Clear the route cache to force fresh route calculations.
"""

import sqlite3

def clear_route_cache():
    """Clear all cached routes."""
    conn = sqlite3.connect('voyagr.db')
    cursor = conn.cursor()
    
    # Check if table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='route_cache'")
    if not cursor.fetchone():
        print("❌ route_cache table doesn't exist")
        conn.close()
        return
    
    # Count cached routes
    cursor.execute("SELECT COUNT(*) FROM route_cache")
    count = cursor.fetchone()[0]
    print(f"📊 Found {count} cached routes")
    
    # Clear cache
    cursor.execute("DELETE FROM route_cache")
    conn.commit()
    
    print(f"✅ Cleared {count} cached routes")
    conn.close()

if __name__ == "__main__":
    print("="*80)
    print("CLEAR ROUTE CACHE")
    print("="*80)
    print()
    clear_route_cache()
    print()
    print("✅ Cache cleared! Run the test again to get fresh routes.")
    print("="*80)

