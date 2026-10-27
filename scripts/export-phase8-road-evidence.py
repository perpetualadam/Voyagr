#!/usr/bin/env python3
"""Bounded operator-run export from an approved local Overpass or offline XML.
Never connects to production automatically, mutates databases or promotes coverage.
"""
import argparse,datetime,hashlib,importlib.util,json,sys,time
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
import requests
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from voyagr.utils.road_evidence import read_bounded,write_new_json,validate_evidence,MAX_SOURCE_BYTES

spec=importlib.util.spec_from_file_location('phase7_acquisition',Path(__file__).with_name('acquire-phase7-osm.py'))
acquisition=importlib.util.module_from_spec(spec);spec.loader.exec_module(acquisition)


def bbox(value):
    try:w,s,e,n=map(float,value.split(','))
    except (ValueError,AttributeError):raise ValueError('Expected west,south,east,north')
    if not (-180<=w<e<=180 and -90<=s<n<=90 and e-w<=.01 and n-s<=.01):raise ValueError('Invalid/oversized bbox')
    return [s,w,n,e]


def source_time(value):
    dt=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    if dt.tzinfo is None:raise ValueError('Source timestamp needs an explicit timezone')
    stamp=int(dt.timestamp()*1000)
    if not 0<stamp<=time.time()*1000:raise ValueError('Source timestamp must be past/present')
    return stamp


def local_overpass(url,bounds,approved=False):
    p=urlparse(url)
    if not approved or p.scheme not in ('http','https') or p.hostname not in ('127.0.0.1','::1') or p.username or p.password or p.query or p.fragment or p.path not in ('/api/interpreter','/interpreter'):
        raise ValueError('Explicit approval and credential-free literal-loopback Overpass required')
    s,w,n,e=bounds
    query=f'[out:xml][timeout:10][maxsize:{MAX_SOURCE_BYTES}];(way[highway]({s},{w},{n},{e});relation[type=restriction]({s},{w},{n},{e});node[highway~"traffic_signals|speed_camera"]({s},{w},{n},{e});node[railway=level_crossing]({s},{w},{n},{e}););out meta;>;out meta;'
    with requests.Session() as session:
        session.trust_env=False
        with session.post(url,data={'data':query},timeout=(2,15),allow_redirects=False,stream=True) as response:
            if response.status_code!=200:raise ValueError('Local Overpass refused export; no retry or redirect')
            parts=[];size=0
            for chunk in response.iter_content(65536):
                size+=len(chunk)
                if size>MAX_SOURCE_BYTES:raise ValueError('Source response exceeds cap')
                parts.append(chunk)
            return b''.join(parts)


def export(raw,bounds,observed,source,jurisdiction,now=None):
    now=int(time.time()*1000) if now is None else now
    if len(raw)>MAX_SOURCE_BYTES:raise ValueError('Source exceeds cap')
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():raise ValueError('XML entities/DTDs not supported')
    root=ET.fromstring(raw)
    if root.tag!='osm' or root.find('remark') is not None:raise ValueError('Not a successful bounded OSM XML extract')
    meta=root.find('meta');data_time=None
    if meta is not None and meta.get('osm_base'):data_time=source_time(meta.get('osm_base'))
    observed=min(observed,data_time) if data_time is not None else observed
    value=acquisition.normalize(raw,bounds,observed,source,jurisdiction)
    value.update(coordinate_order='lat,lon',exported_at_ms=now,source_data_at_ms=data_time)
    value['source_hazards']=[]
    for node in root.findall('node'):
        tags=acquisition.source_tags(node)
        if tags.get('highway') in ('traffic_signals','speed_camera') or tags.get('railway')=='level_crossing':
            value['source_hazards'].append({'osm_node_id':node.get('id'),'lat':float(node.get('lat')),'lon':float(node.get('lon')),'tags':tags,
                'candidate_osm_way_ids':[r['osm_way_id'] for r in value['roads'] if node.get('id') in r['node_ids']],
                'association_status':'UNVERIFIED'})
    qc=validate_evidence(value,now=now)
    if not qc['valid']:raise ValueError('Road evidence QC failed: '+', '.join(qc['errors']))
    value['quality_control']=qc
    return value


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bbox',required=True);p.add_argument('--output',type=Path,required=True)
    group=p.add_mutually_exclusive_group(required=True);group.add_argument('--input',type=Path);group.add_argument('--overpass-url')
    p.add_argument('--source-acquired-at');p.add_argument('--approved-local-service',action='store_true');p.add_argument('--jurisdiction',choices=['England','Scotland','Wales','Northern Ireland'])
    args=p.parse_args()
    try:
        bounds=bbox(args.bbox)
        if args.output.exists():raise ValueError('Output exists; choose a new review file')
        if args.input:
            if not args.source_acquired_at:raise ValueError('Offline input requires original --source-acquired-at; never refresh old evidence age')
            observed=source_time(args.source_acquired_at);raw=read_bounded(args.input);source='operator-approved-offline-osm'
        else:
            raw=local_overpass(args.overpass_url,bounds,args.approved_local_service);observed=int(time.time()*1000);source='approved-local-overpass'
        value=export(raw,bounds,observed,source,args.jurisdiction);write_new_json(args.output,value)
        print(json.dumps({'status':'EXPORTED_FOR_REVIEW','coverage':value['coverage'],'roads':len(value['roads']),'source_sha256':value['source_sha256'],'output':str(args.output)}))
    except (ValueError,OSError,KeyError,TypeError,ET.ParseError,requests.RequestException) as error:p.exit(2,str(error)+'\n')

if __name__=='__main__':main()
