"""Offline synthetic UK segment workload; no network, production data or road-accuracy claim.

Run from repository root: .venv/bin/python scripts/benchmark-avoidance-integrity.py
"""
import json
import math
import statistics
import sys
import time
import tracemalloc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from voyagr.utils.hazard_matching import SegmentIndex, HazardDataset, segment_distance
from voyagr.services.routing.integrity import normalize_requirements, assess_response, CATEGORIES

NOW=1800000000
COORDS=[(53.50+i*.00005,-1.13+math.sin(i/60)*.001) for i in range(1001)]
REQUIREMENTS=normalize_requirements({'avoid_caz':False,'avoidance_requirements':[
    {'category':'speed_cameras','enabled':True,'mode':'mandatory'}]})

def hazards(n):
    return [{'lat':53.48+(i%400)*.0003,'lon':-1.16+(i//400)*.0002,
             'road_id':'UK-fixture','travel_bearing_deg':0,'id':str(i)} for i in range(n)]

def timed(fn,repetitions=5):
    samples=[]
    for _ in range(repetitions):
        started=time.perf_counter();fn();samples.append((time.perf_counter()-started)*1000)
    return {'median_ms':round(statistics.median(samples),3),'max_ms':round(max(samples),3),'repetitions':repetitions}

payload={'success':True,'routes':[{'geometry':COORDS,'source':source,'duration_minutes':20+i,
    'road_segments':[{'begin_shape_index':0,'end_shape_index':1000,'road_id':'UK-fixture'}]}
    for i,source in enumerate(('Valhalla','GraphHopper','OSRM'))]}
output={'workload':'synthetic UK geometry, 1000 segments, 3 alternatives, 1 enabled mandatory category',
        'scope':'local CPU, no providers or paid requests; not a device or real-road benchmark','cases':[]}
for n in (100,1000,10000):
    data=HazardDataset({b:hazards(n) if i==0 else [] for i,b in enumerate(CATEGORIES['speed_cameras'])},
        coverage={b:{'status':'AVAILABLE','bounds':[53,-2,54,0],'retrieved_at':NOW,'source':'synthetic'}
                  for b in CATEGORIES['speed_cameras']})
    fn=lambda:assess_response(payload,REQUIREMENTS,data,now=NOW)
    measured=timed(fn)
    tracemalloc.start();fn();_,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
    output['cases'].append(dict(hazards=n,peak_traced_mib=round(peak/1024/1024,3),**measured))
index=SegmentIndex(COORDS);points=hazards(1000)
def indexed():
    return [any(d<=50 for d,_ in index.nearby(h['lat'],h['lon'],50)) for h in points]
def full_scan():
    return [any(segment_distance(h['lat'],h['lon'],a,b)<=50 for a,b in zip(COORDS,COORDS[1:])) for h in points]
assert indexed()==full_scan(), 'Index must preserve full-scan proximity results'
output['same_result_proximity_comparison']={'hazards':len(points),'indexed':timed(indexed),'full_scan':timed(full_scan)}
print(json.dumps(output,indent=2))
