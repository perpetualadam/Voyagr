#!/usr/bin/env python3
"""Synthetic local parsing/QC/index costs; no network, graph, VPS or device timing."""
import json,platform,statistics,sys,time,tracemalloc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from voyagr.utils.road_evidence import validate_evidence

NOW=1800000000000

def source(n):
    roads=[]
    for i in range(n//10):
        g=[[53.52+(i//100)*.001+j*.00005,-1.13+(i%100)*.0005] for j in range(11)]
        roads.append({'osm_way_id':str(i),'node_ids':[str(i*20+j) for j in range(11)],'geometry':g,'tags':{'highway':'primary','oneway':'yes'}})
    return {'schema_version':1,'source_kind':'SYNTHETIC','source':'synthetic-benchmark','revision':'benchmark-v1','acquired_at_ms':NOW,'bounds':[53.0,-1.5,54.0,-.5],'coverage':'PARTIAL','roads':roads,'restrictions':[]}


def benchmark(name,fn,n=20):
    for _ in range(3):fn()
    times=[]
    for _ in range(n):
        start=time.perf_counter_ns();fn();times.append((time.perf_counter_ns()-start)/1e6)
    times.sort();tracemalloc.start();fn();_,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
    return {'name':name,'samples':n,'median_ms':statistics.median(times),'p95_ms':times[int(n*.95)],'max_ms':max(times),'single_call_peak_traced_bytes':peak}

if __name__=='__main__':
    results=[]
    for n in (100,1000,10000):
        d=source(n);raw=json.dumps(d)
        results.append(benchmark(f'JSON_parse_{n}_segments',lambda:json.loads(raw)))
        results.append(benchmark(f'evidence_QC_and_index_{n}_segments',lambda:validate_evidence(d,now=NOW)))
    print(json.dumps({'runtime':platform.python_version(),'platform':platform.platform(),'kind':'SYNTHETIC_LOCAL_CPU','limitations':'No Contabo, actual source acquisition, graph requests or physical devices measured. QC includes full index construction on source load, not every GPS tick.','results':results},indent=2))
