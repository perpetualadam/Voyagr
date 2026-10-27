#!/usr/bin/env python3
"""Acquire a small public OSM XML extract or normalize a saved extract. No VPS access.

Records source, licence, hash, bounds, acquisition time and restrictions. Output is
review material, never installs/enables a production dataset. No road-truth claims.
"""
import argparse,hashlib,json,time,urllib.request,xml.etree.ElementTree as ET
from pathlib import Path

def normalize(raw,bounds,acquired,source,jurisdiction=None):
    root=ET.fromstring(raw);nodes={n.attrib['id']:[float(n.attrib['lat']),float(n.attrib['lon'])] for n in root.findall('node')};roads=[];restrictions=[]
    for way in root.findall('way'):
        tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')};ids=[n.attrib['ref'] for n in way.findall('nd')]
        if 'highway' not in tags or len(ids)<2:continue
        if any(n not in nodes for n in ids):raise ValueError('Incomplete way nodes')
        roads.append(dict(osm_way_id=way.attrib['id'],osm_version=way.attrib.get('version'),node_ids=ids,geometry=[nodes[n] for n in ids],tags=tags,jurisdiction=jurisdiction))
    for relation in root.findall('relation'):
        tags={t.attrib['k']:t.attrib['v'] for t in relation.findall('tag')}
        if tags.get('type')!='restriction':continue
        members={m.attrib.get('role'):m.attrib for m in relation.findall('member')}
        if all(k in members for k in ('from','to','via')) and members['via']['type']=='node' and not any('conditional' in k for k in tags):
            restrictions.append(dict(from_way=members['from']['ref'],to_way=members['to']['ref'],via_node=members['via']['ref'],restriction=tags.get('restriction',''),osm_relation_id=relation.attrib['id']))
        else:restrictions.append(dict(unsupported=True,osm_relation_id=relation.attrib['id'],tags=tags))
    digest=hashlib.sha256(raw).hexdigest()
    return dict(schema_version=1,source=source,source_kind='OSM_EXTRACT',attribution='© OpenStreetMap contributors',licence='ODbL-1.0',licence_url='https://www.openstreetmap.org/copyright',revision=digest,source_sha256=digest,acquired_at_ms=acquired,bounds=bounds,coverage='PARTIAL',coverage_note='OSM map endpoint availability is not a completeness or legal-road guarantee; requires operator/fixture review.',roads=roads,restrictions=restrictions)

def main():
    a=argparse.ArgumentParser();a.add_argument('--bbox',required=True,help='west,south,east,north; maximum .01° each dimension');a.add_argument('--input',type=Path);a.add_argument('--output',type=Path,required=True);a.add_argument('--jurisdiction',choices=['England','Scotland','Wales','Northern Ireland']);args=a.parse_args()
    west,south,east,north=map(float,args.bbox.split(','))
    if not (-180<=west<east<=180 and -90<=south<north<=90 and east-west<=.01 and north-south<=.01):a.error('Invalid or oversized bbox')
    source='https://www.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,[west,south,east,north]))
    if args.input:raw=args.input.read_bytes();source='local-source-extract'
    else:
        with urllib.request.urlopen(urllib.request.Request(source,headers={'User-Agent':'Voyagr-Phase7-fixture-review/1.0'}),timeout=15) as response:raw=response.read(4*1024*1024+1)
    if len(raw)>4*1024*1024:raise ValueError('Source extract too large')
    result=normalize(raw,[south,west,north,east],int(time.time()*1000),source,args.jurisdiction)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'roads':len(result['roads']),'restrictions':len(result['restrictions']),'revision':result['revision'],'output':str(args.output)}))

if __name__=='__main__':main()
