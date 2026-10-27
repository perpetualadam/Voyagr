#!/usr/bin/env python3
"""Acquire a small public OSM XML extract or normalize a saved extract. No VPS access.

Records source, licence, hash, bounds, acquisition time and restrictions. Output is
review material, never installs/enables a production dataset. No road-truth claims.
"""
import argparse,datetime,hashlib,json,time,urllib.request,xml.etree.ElementTree as ET
from pathlib import Path

def source_tags(element):
    """Reject contradictory tags instead of granting the final value authority."""
    tags={}
    for tag in element.findall('tag'):
        key,value=tag.attrib['k'],tag.attrib['v']
        if key in tags and tags[key]!=value:raise ValueError('Conflicting source tag: '+key)
        tags[key]=value
    return tags

def normalize(raw,bounds,acquired,source,jurisdiction=None):
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():raise ValueError('XML entities/DTDs not supported')
    root=ET.fromstring(raw)
    if root.tag!='osm' or root.find('remark') is not None:raise ValueError('Not a successful OSM extract')
    nodes={};roads=[];restrictions=[]
    for node in root.findall('node'):
        source_tags(node)
        key=node.attrib['id'];point=[float(node.attrib['lat']),float(node.attrib['lon'])]
        if key in nodes and nodes[key]!=point:raise ValueError('Conflicting source node coordinates')
        nodes[key]=point
    for way in root.findall('way'):
        tags=source_tags(way);ids=[n.attrib['ref'] for n in way.findall('nd')]
        if 'highway' not in tags or len(ids)<2:continue
        if any(n not in nodes for n in ids):raise ValueError('Incomplete way nodes')
        roads.append(dict(osm_way_id=way.attrib['id'],osm_version=way.attrib.get('version'),node_ids=ids,geometry=[nodes[n] for n in ids],tags=tags,jurisdiction=jurisdiction))
    for relation in root.findall('relation'):
        tags=source_tags(relation)
        if tags.get('type')!='restriction':continue
        raw_members=relation.findall('member')
        members={m.attrib.get('role'):m.attrib for m in raw_members}
        simple=len(raw_members)==3 and all(sum(m.attrib.get('role')==role for m in raw_members)==1 for role in ('from','via','to'))
        if simple and all(k in members for k in ('from','to','via')) and members['from']['type']=='way' and members['to']['type']=='way' and members['via']['type']=='node' and tags.get('restriction','').startswith(('no_','only_')) and not tags.get('except') and not any('conditional' in k for k in tags):
            restrictions.append(dict(from_way=members['from']['ref'],to_way=members['to']['ref'],via_node=members['via']['ref'],restriction=tags.get('restriction',''),osm_relation_id=relation.attrib['id'],tags=tags))
        else:restrictions.append(dict(unsupported=True,osm_relation_id=relation.attrib['id'],tags=tags))
    digest=hashlib.sha256(raw).hexdigest()
    return dict(schema_version=1,source=source,source_kind='OSM_EXTRACT',attribution='© OpenStreetMap contributors',licence='ODbL-1.0',licence_url='https://www.openstreetmap.org/copyright',revision=digest,source_sha256=digest,acquired_at_ms=acquired,bounds=bounds,coverage='PARTIAL',coverage_note='OSM map endpoint availability is not a completeness or legal-road guarantee; requires operator/fixture review.',roads=roads,restrictions=restrictions)

def main():
    a=argparse.ArgumentParser();a.add_argument('--bbox',required=True,help='west,south,east,north; maximum .01° each dimension');a.add_argument('--input',type=Path);a.add_argument('--source-acquired-at');a.add_argument('--output',type=Path,required=True);a.add_argument('--jurisdiction',choices=['England','Scotland','Wales','Northern Ireland']);args=a.parse_args()
    west,south,east,north=map(float,args.bbox.split(','))
    if not (-180<=west<east<=180 and -90<=south<north<=90 and east-west<=.01 and north-south<=.01):a.error('Invalid or oversized bbox')
    source='https://www.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,[west,south,east,north]))
    if args.output.exists():a.error('Output exists; choose a new review file')
    observed=int(time.time()*1000)
    if args.input:
        if not args.source_acquired_at:a.error('Offline input requires original --source-acquired-at; use Phase 8 exporter for QC')
        dt=datetime.datetime.fromisoformat(args.source_acquired_at.replace('Z','+00:00'))
        if dt.tzinfo is None or not 0<dt.timestamp()*1000<=observed:a.error('Source timestamp needs a valid past/present timezone-aware time')
        observed=int(dt.timestamp()*1000)
        with args.input.open('rb') as handle:raw=handle.read(4*1024*1024+1)
        source='local-source-extract'
    else:
        with urllib.request.urlopen(urllib.request.Request(source,headers={'User-Agent':'Voyagr-Phase7-fixture-review/1.0'}),timeout=15) as response:raw=response.read(4*1024*1024+1)
    if len(raw)>4*1024*1024:raise ValueError('Source extract too large')
    result=normalize(raw,[south,west,north,east],observed,source,args.jurisdiction)
    with args.output.open('x') as handle:handle.write(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'roads':len(result['roads']),'restrictions':len(result['restrictions']),'revision':result['revision'],'output':str(args.output)}))

if __name__=='__main__':main()
