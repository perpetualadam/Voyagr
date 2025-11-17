#!/usr/bin/env python3
"""
Performance Benchmark: Sampling vs Full BFS Component Detection
Compares the old sampling approach with the new full BFS approach
"""

import time
import sys
from custom_router.graph import RoadNetwork
from custom_router.component_analyzer import ComponentAnalyzer

def benchmark_sampling():
    """Benchmark the sampling-based approach (old method)."""
    print("\n" + "="*70)
    print("BENCHMARK 1: SAMPLING-BASED COMPONENT DETECTION (OLD METHOD)")
    print("="*70)
    
    print("\n[STEP 1] Loading graph...")
    start = time.time()
    graph = RoadNetwork('data/uk_router.db')
    load_time = time.time() - start
    print(f"✓ Graph loaded in {load_time:.1f}s")
    print(f"  Nodes: {len(graph.nodes):,}")
    print(f"  Edges: {sum(len(e) for e in graph.edges.values()):,}")
    
    print("\n[STEP 2] Running sampling-based analysis (1,000 nodes)...")
    start = time.time()
    analyzer = ComponentAnalyzer(graph)
    stats = analyzer.analyze(sample_size=1000)
    analysis_time = time.time() - start
    
    print(f"✓ Analysis complete in {analysis_time:.1f}s")
    print(f"  Components found: {stats['total_components']}")
    print(f"  Nodes analyzed: {stats['total_nodes']:,}")
    print(f"  Main component: {stats['main_component_size']:,} nodes ({stats['main_component_pct']:.1f}%)")
    
    total_time = load_time + analysis_time
    print(f"\n📊 SAMPLING RESULTS:")
    print(f"   Total time: {total_time:.1f}s ({total_time/60:.1f}m)")
    print(f"   Load time: {load_time:.1f}s")
    print(f"   Analysis time: {analysis_time:.1f}s")
    
    return {
        'method': 'sampling',
        'load_time': load_time,
        'analysis_time': analysis_time,
        'total_time': total_time,
        'components': stats['total_components'],
        'nodes_analyzed': stats['total_nodes'],
        'main_component_size': stats['main_component_size']
    }

def benchmark_full_bfs():
    """Benchmark the full BFS approach (new method)."""
    print("\n" + "="*70)
    print("BENCHMARK 2: FULL BFS COMPONENT DETECTION (NEW METHOD)")
    print("="*70)
    
    print("\n[STEP 1] Loading graph...")
    start = time.time()
    graph = RoadNetwork('data/uk_router.db')
    load_time = time.time() - start
    print(f"✓ Graph loaded in {load_time:.1f}s")
    print(f"  Nodes: {len(graph.nodes):,}")
    print(f"  Edges: {sum(len(e) for e in graph.edges.values()):,}")
    
    print("\n[STEP 2] Running full BFS analysis (all 26.5M nodes)...")
    start = time.time()
    analyzer = ComponentAnalyzer(graph)
    stats = analyzer.analyze_full()
    analysis_time = time.time() - start
    
    print(f"✓ Analysis complete in {analysis_time:.1f}s ({analysis_time/60:.1f}m)")
    print(f"  Components found: {stats['total_components']}")
    print(f"  Nodes analyzed: {stats['total_nodes']:,}")
    print(f"  Main component: {stats['main_component_size']:,} nodes ({stats['main_component_pct']:.1f}%)")
    
    total_time = load_time + analysis_time
    print(f"\n📊 FULL BFS RESULTS:")
    print(f"   Total time: {total_time:.1f}s ({total_time/60:.1f}m)")
    print(f"   Load time: {load_time:.1f}s")
    print(f"   Analysis time: {analysis_time:.1f}s")
    
    return {
        'method': 'full_bfs',
        'load_time': load_time,
        'analysis_time': analysis_time,
        'total_time': total_time,
        'components': stats['total_components'],
        'nodes_analyzed': stats['total_nodes'],
        'main_component_size': stats['main_component_size']
    }

def print_comparison(sampling_results, full_bfs_results):
    """Print detailed comparison between methods."""
    print("\n" + "="*70)
    print("COMPARISON: SAMPLING vs FULL BFS")
    print("="*70)
    
    print("\n📊 METRICS COMPARISON:")
    print(f"\n{'Metric':<30} {'Sampling':<20} {'Full BFS':<20}")
    print("-" * 70)
    
    print(f"{'Total Time':<30} {sampling_results['total_time']:>6.1f}s {full_bfs_results['total_time']:>18.1f}s")
    print(f"{'Load Time':<30} {sampling_results['load_time']:>6.1f}s {full_bfs_results['load_time']:>18.1f}s")
    print(f"{'Analysis Time':<30} {sampling_results['analysis_time']:>6.1f}s {full_bfs_results['analysis_time']:>18.1f}s")
    print(f"{'Components Found':<30} {sampling_results['components']:>6} {full_bfs_results['components']:>18}")
    print(f"{'Nodes Analyzed':<30} {sampling_results['nodes_analyzed']:>6,} {full_bfs_results['nodes_analyzed']:>18,}")
    print(f"{'Main Component Size':<30} {sampling_results['main_component_size']:>6,} {full_bfs_results['main_component_size']:>18,}")
    
    time_increase = ((full_bfs_results['total_time'] - sampling_results['total_time']) / 
                     sampling_results['total_time'] * 100)
    component_increase = ((full_bfs_results['components'] - sampling_results['components']) / 
                          sampling_results['components'] * 100)
    
    print(f"\n⏱️  TIME INCREASE: {time_increase:+.1f}%")
    print(f"📈 COMPONENT INCREASE: {component_increase:+.1f}%")
    
    print(f"\n✅ ACCURACY IMPROVEMENT:")
    print(f"   Sampling: {sampling_results['nodes_analyzed']:,} nodes analyzed")
    print(f"   Full BFS: {full_bfs_results['nodes_analyzed']:,} nodes analyzed")
    print(f"   Coverage: {100 * full_bfs_results['nodes_analyzed'] / full_bfs_results['nodes_analyzed']:.1f}% vs {100 * sampling_results['nodes_analyzed'] / full_bfs_results['nodes_analyzed']:.2f}%")

if __name__ == '__main__':
    print("\n" + "="*70)
    print("COMPONENT DETECTION PERFORMANCE BENCHMARK")
    print("="*70)
    
    try:
        # Run benchmarks
        sampling_results = benchmark_sampling()
        full_bfs_results = benchmark_full_bfs()
        
        # Print comparison
        print_comparison(sampling_results, full_bfs_results)
        
        print("\n" + "="*70)
        print("✅ BENCHMARK COMPLETE")
        print("="*70)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

