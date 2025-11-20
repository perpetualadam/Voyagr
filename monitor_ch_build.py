#!/usr/bin/env python3
"""
Monitor Contraction Hierarchies build progress.
Displays real-time progress and ETA.
"""

import time
import os
import re
from datetime import datetime, timedelta

def monitor_build(log_file='ch_build_full.log', check_interval=10):
    """Monitor CH build progress."""
    print("=" * 70)
    print("CONTRACTION HIERARCHIES BUILD MONITOR")
    print("=" * 70)
    print()
    
    start_time = None
    last_contracted = 0
    total_nodes = 26544335
    
    while True:
        try:
            if not os.path.exists(log_file):
                print(f"Waiting for {log_file}...")
                time.sleep(check_interval)
                continue
            
            with open(log_file, 'r') as f:
                content = f.read()
            
            # Check if build is complete
            if 'CH INDEX BUILD COMPLETE' in content:
                print("\n" + "=" * 70)
                print("BUILD COMPLETE!")
                print("=" * 70)
                break
            
            # Extract progress
            matches = re.findall(r'\[CH\] Contracted (\d+) nodes', content)
            if matches:
                contracted = int(matches[-1])
                
                if start_time is None:
                    start_time = time.time()
                
                elapsed = time.time() - start_time
                progress = (contracted / total_nodes) * 100
                
                if contracted > last_contracted:
                    # Calculate rate and ETA
                    rate = contracted / elapsed if elapsed > 0 else 0
                    remaining = total_nodes - contracted
                    eta_seconds = remaining / rate if rate > 0 else 0
                    eta_time = datetime.now() + timedelta(seconds=eta_seconds)
                    
                    print(f"\rProgress: {contracted:,}/{total_nodes:,} nodes ({progress:.1f}%) | "
                          f"Rate: {rate:.0f} nodes/sec | "
                          f"ETA: {eta_time.strftime('%H:%M:%S')}", end='', flush=True)
                    
                    last_contracted = contracted
            
            time.sleep(check_interval)
            
        except KeyboardInterrupt:
            print("\n\nMonitoring stopped by user")
            break
        except Exception as e:
            print(f"\nError: {e}")
            time.sleep(check_interval)

if __name__ == '__main__':
    monitor_build()

