"""Memory monitoring for CH routing queries."""

import psutil
import os
import time
from typing import Dict, List

class MemoryMonitor:
    """Monitor memory usage during routing queries."""
    
    def __init__(self):
        self.process = psutil.Process(os.getpid())
        self.snapshots: List[Dict] = []
        self.peak_memory_mb = 0
        self.start_memory_mb = 0
    
    def start(self):
        """Start monitoring."""
        self.snapshots = []
        self.start_memory_mb = self.process.memory_info().rss / (1024 * 1024)
        self.peak_memory_mb = self.start_memory_mb
    
    def snapshot(self, label: str = ""):
        """Take memory snapshot."""
        mem_info = self.process.memory_info()
        current_mb = mem_info.rss / (1024 * 1024)
        self.peak_memory_mb = max(self.peak_memory_mb, current_mb)
        
        snapshot = {
            'timestamp': time.time(),
            'label': label,
            'memory_mb': current_mb,
            'delta_mb': current_mb - self.start_memory_mb,
            'peak_mb': self.peak_memory_mb
        }
        self.snapshots.append(snapshot)
        return snapshot
    
    def get_report(self) -> Dict:
        """Get memory monitoring report."""
        if not self.snapshots:
            return {}
        
        return {
            'start_memory_mb': self.start_memory_mb,
            'peak_memory_mb': self.peak_memory_mb,
            'total_delta_mb': self.peak_memory_mb - self.start_memory_mb,
            'snapshots': self.snapshots,
            'num_snapshots': len(self.snapshots)
        }
    
    def print_report(self):
        """Print memory report."""
        report = self.get_report()
        if not report:
            return
        
        print("\n[MEMORY MONITOR]")
        print(f"  Start: {report['start_memory_mb']:.1f} MB")
        print(f"  Peak: {report['peak_memory_mb']:.1f} MB")
        print(f"  Delta: {report['total_delta_mb']:.1f} MB")
        print(f"  Snapshots: {report['num_snapshots']}")
        
        for snap in report['snapshots']:
            print(f"    {snap['label']}: {snap['memory_mb']:.1f} MB (delta: {snap['delta_mb']:.1f} MB)")

# Global monitor instance
_monitor = None

def get_monitor() -> MemoryMonitor:
    """Get global memory monitor."""
    global _monitor
    if _monitor is None:
        _monitor = MemoryMonitor()
    return _monitor

def start_monitoring():
    """Start memory monitoring."""
    get_monitor().start()

def snapshot(label: str = ""):
    """Take memory snapshot."""
    return get_monitor().snapshot(label)

def get_report() -> Dict:
    """Get memory report."""
    return get_monitor().get_report()

def print_report():
    """Print memory report."""
    get_monitor().print_report()

