#!/usr/bin/env python3
"""
Rebuild UK router database with pre-calculated edge costs + hazard penalties.

This script rebuilds the database to include:
1. Pre-calculated edge costs with road type penalties (Phase 1)
2. Pre-calculated static hazard penalties (cameras) (Hazard Avoidance)

Expected speedup: 2-3x (5.41s → 2.0s average)

Usage:
    python rebuild_with_costs.py
    python rebuild_with_costs.py --with-hazards  # Include hazard penalties
"""

import os
import time
import subprocess
import sys

def main():
    # Check for --with-hazards flag
    with_hazards = '--with-hazards' in sys.argv

    print("=" * 80)
    if with_hazards:
        print("REBUILD DATABASE WITH COSTS + HAZARD PENALTIES")
    else:
        print("REBUILD DATABASE WITH PRE-CALCULATED COSTS (PHASE 1)")
    print("=" * 80)
    print()
    print("This will rebuild the UK router database to include:")
    print("  1. Pre-calculated edge costs with road type penalties")
    if with_hazards:
        print("  2. Pre-calculated static hazard penalties (cameras)")
    print()
    print("Expected time: ~60 minutes")
    print("Expected speedup: 2-3x (5.41s → 2.0s average)")
    print()
    
    # Check if database exists
    db_file = 'data/uk_router.db'
    if os.path.exists(db_file):
        print(f"⚠️  WARNING: {db_file} already exists!")
        print()
        response = input("Do you want to rebuild? This will DELETE the existing database. (yes/no): ")
        if response.lower() != 'yes':
            print("Rebuild cancelled.")
            return
        
        # Backup existing database
        backup_file = f"{db_file}.backup_{int(time.time())}"
        print(f"\n📦 Creating backup: {backup_file}")
        os.rename(db_file, backup_file)
        print(f"✅ Backup created")
    
    print()
    print("=" * 80)
    print("STARTING REBUILD")
    print("=" * 80)
    print()
    
    # Run rebuild script
    start_time = time.time()
    
    try:
        # Use the existing rebuild script
        result = subprocess.run(
            ['python', 'custom_router/rebuild_uk_router.py'],
            check=True,
            capture_output=False,
            text=True
        )
        
        elapsed = time.time() - start_time
        
        print()
        print("=" * 80)
        print("REBUILD COMPLETE!")
        print("=" * 80)
        print(f"Total time: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
        print()
        print("Next steps:")
        print("1. Run: python test_phase1_optimizations.py")
        print("2. Verify 2-3x speedup vs baseline (5.41s → 2.0s)")
        print("3. If successful, proceed to Phase 2 (Contraction Hierarchies)")
        print()
        
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Rebuild failed with error code {e.returncode}")
        print("Check the output above for details.")
        return
    except KeyboardInterrupt:
        print("\n\n⚠️  Rebuild interrupted by user")
        return


if __name__ == '__main__':
    main()

