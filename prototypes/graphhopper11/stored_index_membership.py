"""Bounded GH11.1 MMAP leaf decoder and independent strict-interior oracle."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import tempfile

from prototypes.graphhopper11 import import_provenance as process
from prototypes.graphhopper11.isolated_app import LocalJavaBridge, Refused, digest, version

EXPORTER=Path(__file__).with_name('MembershipInputExport.java')
MARKER=b'VOYAGR_GH11_MEMBERSHIP_INPUT '
MAX_BYTES=8*1024*1024
MAX_PAIRS=100000
MARGIN=Fraction(1,10**9)  # Declared degree-band exclusion, not a physical accuracy claim.


def require(condition, reason='membership_contract'):
    if not condition:
        raise Refused(reason)


def decimal(value):
    require(isinstance(value,str) and len(value)<=32 and re.fullmatch(r'[+-]?\d{1,3}(?:\.\d{1,17})?(?:[Ee][+-]?\d{1,2})?',value))
    if 'e' in value.lower():
        require(abs(int(value.lower().split('e')[1]))<=12)
    return Fraction(value)


def metadata(raw):
    require(isinstance(raw,dict) and set(raw)=={'engine_version','java_runtime','index_version','bounds','entries','resolution_m','checksum','edge_id_bound','edges'})
    require(raw['engine_version']=='11.1' and type(raw['index_version']) is int and raw['index_version']==5)
    require(isinstance(raw['java_runtime'],str) and re.fullmatch(r'[0-9A-Za-z.+_-]{1,80}',raw['java_runtime']))
    require(isinstance(raw['entries'],list) and 1<=len(raw['entries'])<=8)
    entries=raw['entries'];require(all(type(v) is int and v in (4,16) for v in entries) and entries[-1]==4)
    require(all(a>=b for a,b in zip(entries,entries[1:])))
    parts=1
    for value in entries: parts*=2 if value==4 else 4
    require(parts<=256,'membership_grid_budget')
    require(type(raw['resolution_m']) is int and 1<=raw['resolution_m']<=1000000)
    require(type(raw['checksum']) is int and -(2**31)<=raw['checksum']<2**31)
    require(type(raw['edge_id_bound']) is int and 0<=raw['edge_id_bound']<=1000000)
    require(isinstance(raw['bounds'],list) and len(raw['bounds'])==4)
    x0,x1,y0,y1=map(decimal,raw['bounds'])
    require(-180<=x0<x1<=180 and x1-x0<=180 and -80<=y0<y1<=80,'membership_envelope')
    require((x1-x0)/parts>2*MARGIN and (y1-y0)/parts>2*MARGIN,'membership_envelope')
    require(isinstance(raw['edges'],list) and 1<=len(raw['edges'])<=1000)
    edges={};vertices=0
    for edge in raw['edges']:
        require(isinstance(edge,dict) and set(edge)=={'id','points'})
        key=edge['id'];require(type(key) is int and 0<=key<raw['edge_id_bound'] and key not in edges)
        require(isinstance(edge['points'],list) and len(edge['points'])>=2)
        vertices+=len(edge['points']);require(vertices<=10000,'membership_geometry_budget')
        points=[]
        for point in edge['points']:
            require(isinstance(point,list) and len(point)==2)
            x,y=map(decimal,point);require(x0<=x<=x1 and y0<=y<=y1,'membership_envelope')
            points.append((x,y))
        edges[key]=points
    return (x0,x1,y0,y1),entries,parts,edges


def decode_index(data, entries, edge_ids, checksum, resolution):
    """No GH query/visitor/Morton lookup tables; only the pinned serialized grammar."""
    require(isinstance(entries,(list,tuple)) and 1<=len(entries)<=8 and entries[-1]==4
            and all(type(v) is int and v in (4,16) for v in entries)
            and all(a>=b for a,b in zip(entries,entries[1:])),'membership_entries')
    require(isinstance(edge_ids,set) and len(edge_ids)<=1000 and all(type(v) is int and 0<=v<2**31 for v in edge_ids),'membership_edge_id')
    require(type(checksum) is int and -(2**31)<=checksum<2**31 and type(resolution) is int and 1<=resolution<=1000000)
    require(isinstance(data,bytes) and 100<len(data)<=MAX_BYTES,'membership_file_budget')
    require(data[:4]==b'\x00\x02GH','membership_file_marker')
    length,segment=struct.unpack_from('>qi',data,4)
    require(length==len(data) and 128<=segment<=2**30 and segment&(segment-1)==0,'membership_mmap_header')
    headers=struct.unpack_from('>20i',data,16)
    require(headers[:3]==(5,checksum,resolution),'membership_index_header')
    require(not any(headers[3:]) and data[96:100]==b'\0'*4,'membership_reserved_header')
    require((len(data)-100)%4==0,'membership_word_alignment')
    words=(len(data)-100)//4;claimed=set();cells={};pairs=0
    def read(pos):
        require(type(pos) is int and 0<=pos<words,'membership_pointer')
        return struct.unpack_from('<i',data,100+pos*4)[0]
    def claim(start,end):
        require(1<=start<end<=words,'membership_pointer')
        require(end-start<=MAX_PAIRS and len(claimed)+end-start<=MAX_PAIRS,'membership_word_budget')
        region=set(range(start,end));require(not region&claimed,'membership_pointer_alias')
        claimed.update(region)
    def walk(pointer,depth,x,y,width):
        nonlocal pairs
        require(len(cells)<10000,'membership_leaf_budget')
        if depth==len(entries):
            value=read(pointer)
            if value<0:
                claim(pointer,pointer+1);ids=[-value-1]
            else:
                require(value>=pointer+3,'membership_leaf_encoding')
                claim(pointer,value);ids=[read(i) for i in range(pointer+1,value)]
            require(len(set(ids))==len(ids) and all(i in edge_ids for i in ids),'membership_edge_id')
            pairs+=len(ids);require(pairs<=MAX_PAIRS,'membership_pair_budget')
            require((x,y) not in cells and width==1,'membership_cell')
            cells[x,y]=frozenset(ids);return
        size=entries[depth];factor=2 if size==4 else 4;bits=1 if size==4 else 2
        claim(pointer,pointer+size);child_width=width//factor
        for offset in range(size):
            child=read(pointer+offset)
            if not child: continue
            require(child>=pointer+size,'membership_pointer_order')
            dx=sum(((offset>>(2*i))&1)<<i for i in range(bits))
            dy=sum(((offset>>(2*i+1))&1)<<i for i in range(bits))
            walk(child,depth+1,x+dx*child_width,y+dy*child_width,child_width)
    parts=1
    for size in entries:
        require(type(size) is int and size in (4,16),'membership_entries')
        parts*=2 if size==4 else 4
    require(parts<=256 and entries and entries[-1]==4,'membership_entries')
    require(read(0)==0,'membership_reserved_word')
    walk(1,0,0,0,parts)
    return cells


def intersects(a,b,box,open_box):
    """Exact rational parameter clipping, independent of GH's grid traversal."""
    lo,hi=Fraction(0),Fraction(1)
    for start,end,minimum,maximum in ((a[0],b[0],box[0],box[1]),(a[1],b[1],box[2],box[3])):
        delta=end-start
        if not delta:
            if not (minimum<start<maximum if open_box else minimum<=start<=maximum): return False
        else:
            u,v=sorted(((minimum-start)/delta,(maximum-start)/delta))
            lo=max(lo,u);hi=min(hi,v)
            if lo>hi or open_box and lo==hi: return False
    return lo<hi if open_box else lo<=hi


def expected_interiors(bounds,parts,edges):
    x0,x1,y0,y1=bounds;dx=(x1-x0)/parts;dy=(y1-y0)/parts
    required=set();boundary=set();examined=0
    for edge,points in edges.items():
        for a,b in zip(points,points[1:]):
            # Include cells touching the segment's lower bounds as well as upper.
            xmin=max(0,(min(a[0],b[0])-x0)//dx-1);xmax=min(parts-1,(max(a[0],b[0])-x0)//dx)
            ymin=max(0,(min(a[1],b[1])-y0)//dy-1);ymax=min(parts-1,(max(a[1],b[1])-y0)//dy)
            for x in range(int(xmin),int(xmax)+1):
                for y in range(int(ymin),int(ymax)+1):
                    examined+=1;require(examined<=MAX_PAIRS,'membership_candidate_budget')
                    box=(x0+x*dx,x0+(x+1)*dx,y0+y*dy,y0+(y+1)*dy)
                    if not intersects(a,b,box,False): continue
                    inner=(box[0]+MARGIN,box[1]-MARGIN,box[2]+MARGIN,box[3]-MARGIN)
                    pair=(x,y,edge)
                    if intersects(a,b,inner,True): required.add(pair)
                    else: boundary.add(pair)
    boundary-=required
    return required,boundary


def inspect_memberships(raw,data):
    bounds,entries,parts,edges=metadata(raw)
    cells=decode_index(data,entries,set(edges),raw['checksum'],raw['resolution_m'])
    stored={(x,y,edge) for (x,y),ids in cells.items() for edge in ids}
    required,boundary=expected_interiors(bounds,parts,edges)
    missing=required-stored
    status='MISSING_REQUIRED_INTERIOR_MEMBERSHIPS' if missing else 'INTERIOR_REQUIREMENTS_MATCHED_BOUNDARIES_UNVERIFIED' if required else 'NO_INTERIOR_REQUIREMENTS_UNVERIFIED'
    return {'scope':'declared_decimal_grid_strict_interiors_only','status':status,'parts':parts,
            'parsed_leaves':len(cells),'stored_pairs':len(stored),'required_interior_pairs':len(required),
            'missing_required_pairs':len(missing),'unassessed_stored_pairs':len(stored-required),
            'boundary_or_near_boundary_pairs':len(boundary),'boundary_margin_degrees':str(MARGIN),
            'stored_membership_sha256':version(sorted(stored)),'required_membership_sha256':version(sorted(required)),
            'boundary_verification':'UNVERIFIED','index_geometry_coverage':'UNVERIFIED',
            'navigation_allowed':False,'route_absence_proven':False}


def audit_stored_memberships(manifest):
    code_hash=digest(__file__);export_hash=digest(EXPORTER);transport_hash=digest(process.__file__)
    bridge=LocalJavaBridge(manifest);identity=version(bridge.manifest)
    java=Path(shutil.which(bridge.java) or '/missing-java').resolve(strict=True);java_hash=digest(java)
    with tempfile.TemporaryDirectory(prefix='voyagr-gh11-leaves-') as directory:
        result=process.bounded_process([str(java),'-Xmx512m','-XX:ActiveProcessorCount=1','-Djava.io.tmpdir=.',
            '-Duser.home=.','-XX:-UsePerfData','--class-path',bridge.manifest['paths']['jar'],str(EXPORTER),
            bridge.manifest['paths']['config'],bridge.manifest['paths']['graph']],directory,timeout=60)
        require(not result['reason'] and result['returncode']==0,'membership_export_refused')
        lines=[line[len(MARKER):] for line in result['output'].splitlines() if line.startswith(MARKER)]
        require(len(lines)==1,'membership_export_report')
        try: raw=json.loads(lines[0])
        except ValueError as error: raise Refused('membership_export_report') from error
        index=Path(bridge.manifest['paths']['graph'])/'location_index'
        require(not index.is_symlink() and index.stat().st_size<=MAX_BYTES,'membership_file_budget')
        data=index.read_bytes()
        require(hashlib.sha256(data).hexdigest()==bridge.manifest['graph_files'].get('location_index'),'membership_index_changed')
        observation=inspect_memberships(raw,data)
        bridge.verify(check_source=True)
    require(digest(__file__)==code_hash and digest(EXPORTER)==export_hash and digest(process.__file__)==transport_hash
            and digest(java)==java_hash and version(bridge.manifest)==identity,'membership_binding_changed')
    report={'schema':1,'scope':'manifest_bound_stored_index_strict_interiors_only','manifest_identity':identity,
            'graph_version':bridge.manifest['graph_version'],'source_version':bridge.manifest['source_version'],
            'policy_version':bridge.manifest['policy_version'],'bridge_sha256':bridge.manifest['bridge_sha256'],
            'config_sha256':bridge.manifest['hashes']['config'],'engine_sha256':bridge.manifest['engine_sha256'],
            'auditor_sha256':code_hash,'exporter_sha256':export_hash,'transport_sha256':transport_hash,
            'java_launcher_sha256':java_hash,
            'input_export_sha256':hashlib.sha256(lines[0]).hexdigest(),'index_sha256':hashlib.sha256(data).hexdigest(),
            'observation':observation,'java_runtime':raw['java_runtime'],'navigation_allowed':False,'production_migration':'NO_GO'}
    report['evidence_identity']=version(report)
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--manifest',required=True)
    args=parser.parse_args()
    try: report=audit_stored_memberships(json.loads(Path(args.manifest).read_text()))
    except Exception:
        print(json.dumps({'status':'STORED_MEMBERSHIP_REFUSED','navigation_allowed':False,'production_migration':'NO_GO'}));return 1
    print(json.dumps(report,sort_keys=True))
    return 0 if report['observation']['status']=='INTERIOR_REQUIREMENTS_MATCHED_BOUNDARIES_UNVERIFIED' else 2


if __name__=='__main__': raise SystemExit(main())
