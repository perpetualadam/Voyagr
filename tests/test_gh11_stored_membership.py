"""Independent byte decoder/rational geometry tests plus actual synthetic GH11 files."""
import copy
from fractions import Fraction as F
import json
import os
from pathlib import Path
import struct
import subprocess
import sys

import pytest

from prototypes.graphhopper11 import stored_index_membership as audit
from prototypes.graphhopper11.isolated_app import Refused, digest, version
from test_gh11_isolated_app import manifest as graph_manifest

REAL=pytest.mark.skipif(not os.environ.get('GH11_PROTOTYPE_JAR'),reason='Pinned local GH11 JAR not supplied')


def index_bytes(cells,entries=(4,),checksum=3):
    # Explicit Morton tables, independent of the decoder's bit extraction.
    tables={4:[[0,2],[1,3]],16:[[0,2,8,10],[1,3,9,11],[4,6,12,14],[5,7,13,15]]}
    words=[0]
    parts=1
    for size in entries: parts*=2 if size==4 else 4
    def node(items,depth,x,y,width):
        pointer=len(words)
        if depth==len(entries):
            ids=next(iter(items.values()))
            if len(ids)==1: words.append(-ids[0]-1)
            else:
                words.extend([0,*ids]);words[pointer]=len(words)
            return pointer
        size=entries[depth];factor=len(tables[size]);step=width//factor
        words.extend([0]*size);groups={}
        for (cx,cy),ids in items.items():
            dx,dy=(cx-x)//step,(cy-y)//step
            groups.setdefault((dx,dy),{})[cx,cy]=ids
        for (dx,dy),group in sorted(groups.items()):
            words[pointer+tables[size][dx][dy]]=node(group,depth+1,x+dx*step,y+dy*step,step)
        return pointer
    assert node(cells,0,0,0,parts)==1
    capacity=((len(words)*4+127)//128)*128
    data=bytearray(100+capacity);data[:4]=b'\x00\x02GH'
    struct.pack_into('>qi',data,4,len(data),128)
    struct.pack_into('>3i',data,16,5,checksum,300)
    for i,value in enumerate(words):struct.pack_into('<i',data,100+i*4,value)
    return bytes(data)


def raw(edges=None):
    edges=edges or {0:[['0.25','0.25'],['1.75','0.25']],1:[['0.25','0.25'],['0.25','1.75']]}
    return {'engine_version':'11.1','java_runtime':'17.0.0','index_version':5,'bounds':['0','2','0','2'],
            'entries':[4],'resolution_m':300,'checksum':3,'edge_id_bound':2,
            'edges':[{'id':key,'points':points} for key,points in edges.items()]}


def healthy():return {(0,0):[0,1],(1,0):[0],(0,1):[1]}


def test_binary_singleton_and_multi_edge_leaves_preserve_cell_identity():
    cells=healthy();data=index_bytes(cells)
    assert audit.decode_index(data,[4],{0,1},3,300)=={cell:frozenset(ids) for cell,ids in cells.items()}
    report=audit.inspect_memberships(raw(),data)
    assert report['status']=='INTERIOR_REQUIREMENTS_MATCHED_BOUNDARIES_UNVERIFIED'
    assert report['required_interior_pairs']==report['stored_pairs']==4
    assert report['missing_required_pairs']==0 and report['navigation_allowed'] is False
    assert report['index_geometry_coverage']==report['boundary_verification']=='UNVERIFIED'


def test_multilevel_morton_addresses_are_decoded_without_global_deduplication():
    cells={(0,0):[0],(7,6):[0],(2,3):[1],(1,7):[0,1]}
    assert audit.decode_index(index_bytes(cells,(16,4)),[16,4],{0,1},3,300)=={c:frozenset(ids) for c,ids in cells.items()}


@pytest.mark.parametrize('change',['delete','wrong_edge'])
def test_missing_membership_is_detected_even_when_all_global_ids_remain(change):
    cells=healthy()
    if change=='delete':cells.pop((1,0))
    else:cells[1,0]=[1]
    stored=audit.decode_index(index_bytes(cells),[4],{0,1},3,300)
    assert set().union(*stored.values())=={0,1}
    report=audit.inspect_memberships(raw(),index_bytes(cells))
    assert report['status']=='MISSING_REQUIRED_INTERIOR_MEMBERSHIPS' and report['missing_required_pairs']==1
    assert report['navigation_allowed'] is report['route_absence_proven'] is False


def test_extra_stored_pairs_are_unassessed_not_certified_correct():
    cells=healthy();cells[1,1]=[0]
    report=audit.inspect_memberships(raw(),index_bytes(cells))
    assert report['unassessed_stored_pairs']==1 and report['index_geometry_coverage']=='UNVERIFIED'


@pytest.mark.parametrize('points',[
    [['0.25','1'],['1.75','1']],  # Grid-aligned boundary.
    [['0.25','1.0000000001'],['1.75','1.0000000001']],  # Within declared exclusion band.
])
def test_boundary_or_near_boundary_only_segments_never_pass_vacuously(points):
    report=audit.inspect_memberships(raw({0:points}),index_bytes({(0,1):[0],(1,1):[0]}))
    assert report['status']=='NO_INTERIOR_REQUIREMENTS_UNVERIFIED'
    assert report['required_interior_pairs']==0 and report['boundary_or_near_boundary_pairs']>0


def test_exact_rational_clipping_handles_corner_reverse_and_zero_length():
    bounds=(F(0),F(2),F(0),F(2));a=(F(1,4),F(1,4));b=(F(7,4),F(7,4))
    required,boundary=audit.expected_interiors(bounds,2,{0:[a,b]})
    assert required=={(0,0,0),(1,1,0)} and boundary=={(1,0,0),(0,1,0)}
    assert audit.expected_interiors(bounds,2,{0:[b,a]})==(required,boundary)
    assert audit.expected_interiors(bounds,2,{0:[a,a]})[0]=={(0,0,0)}


@pytest.mark.parametrize('fault',[
    'marker','length','version','resolution','reserved','truncated','back_pointer','past_end','alias','invalid_edge','duplicate_leaf',
])
def test_malformed_or_unsupported_binary_input_refuses(fault):
    data=bytearray(index_bytes(healthy()))
    if fault=='marker':data[0]=1
    elif fault=='length':struct.pack_into('>q',data,4,len(data)+1)
    elif fault=='version':struct.pack_into('>i',data,16,6)
    elif fault=='resolution':struct.pack_into('>i',data,24,1)
    elif fault=='reserved':data[96]=1
    elif fault=='truncated':data=data[:110]
    elif fault=='back_pointer':struct.pack_into('<i',data,104,1)
    elif fault=='past_end':struct.pack_into('<i',data,104,100000)
    elif fault=='alias':struct.pack_into('<i',data,108,struct.unpack_from('<i',data,104)[0])
    elif fault=='invalid_edge':
        p=struct.unpack_from('<i',data,108)[0];struct.pack_into('<i',data,100+p*4,-100)
    else:
        p=struct.unpack_from('<i',data,104)[0];struct.pack_into('<i',data,100+(p+2)*4,0)
    with pytest.raises(Refused):audit.decode_index(bytes(data),[4],{0,1},3,300)


@pytest.mark.parametrize('change',[
    {'entries':[16]},{'edge_id_bound':True},{'index_version':6},{'bounds':['0','2','0','81']},
    {'edges':[{'id':True,'points':[['0','0'],['1','1']]}]},
    {'bounds':['0','1e-99','0','2']},
])
def test_metadata_scope_and_numeric_budgets_refuse(change):
    with pytest.raises(Refused):audit.inspect_memberships(dict(raw(),**change),index_bytes(healthy()))


@pytest.fixture(scope='module')
def evidence(graph_manifest):
    return audit.audit_stored_memberships(graph_manifest)


@REAL
def test_real_gh11_bytes_match_only_declared_interior_requirements(graph_manifest,evidence):
    assert evidence['observation']['required_interior_pairs']>0
    assert evidence['observation']['status']=='INTERIOR_REQUIREMENTS_MATCHED_BOUNDARIES_UNVERIFIED'
    assert evidence['observation']['missing_required_pairs']==0
    assert evidence['index_sha256']==graph_manifest['graph_files']['location_index']
    assert evidence['graph_version']==graph_manifest['graph_version']
    assert evidence['manifest_identity']==version(graph_manifest)
    assert evidence['policy_version']==graph_manifest['policy_version']
    assert evidence['bridge_sha256']==graph_manifest['bridge_sha256']
    unsigned=dict(evidence);identity=unsigned.pop('evidence_identity')
    assert version(unsigned)==identity
    assert evidence['navigation_allowed'] is False and evidence['production_migration']=='NO_GO'
    text=json.dumps(evidence)
    assert not any(str(path) in text for path in graph_manifest['paths'].values())


@REAL
def test_changed_manifest_refuses_before_export(graph_manifest,monkeypatch):
    manifest=copy.deepcopy(graph_manifest);manifest['graph_version']='0'*64
    monkeypatch.setattr(audit.process,'bounded_process',lambda *a,**k:pytest.fail('No export for stale manifest'))
    with pytest.raises(Refused,match='graph_changed'):audit.audit_stored_memberships(manifest)


@REAL
def test_graph_mutation_after_export_refuses_result(graph_manifest,monkeypatch):
    original=audit.process.bounded_process
    index=Path(graph_manifest['paths']['graph'])/'location_index';before=index.read_bytes()
    def changed(*args,**kwargs):
        result=original(*args,**kwargs);index.write_bytes(before+b'changed');return result
    monkeypatch.setattr(audit.process,'bounded_process',changed)
    try:
        with pytest.raises(Refused,match='membership_index_changed'):audit.audit_stored_memberships(graph_manifest)
    finally:index.write_bytes(before)


@REAL
def test_cli_outputs_only_bound_summary_and_redacts_refusal(graph_manifest,tmp_path):
    path=tmp_path/'manifest.json';path.write_text(json.dumps(graph_manifest))
    command=[sys.executable,'-m','prototypes.graphhopper11.stored_index_membership','--manifest',str(path)]
    result=subprocess.run(command,capture_output=True,text=True,timeout=90)
    assert result.returncode==0,result.stderr[-2000:]
    assert json.loads(result.stdout)['observation']['index_geometry_coverage']=='UNVERIFIED'
    assert str(tmp_path) not in result.stdout
    path.write_text('{}');result=subprocess.run(command,capture_output=True,text=True,timeout=10)
    assert result.returncode==1 and json.loads(result.stdout)['status']=='STORED_MEMBERSHIP_REFUSED'


@pytest.mark.parametrize('fault',['bytes','grid','candidate','decimal'])
def test_explicit_resource_budgets_refuse_instead_of_partial_success(monkeypatch,fault):
    if fault=='bytes':
        with pytest.raises(Refused,match='membership_file_budget'):
            audit.decode_index(b'x'*(audit.MAX_BYTES+1),[4],{0},3,300)
    elif fault=='grid':
        with pytest.raises(Refused,match='membership_grid_budget'):
            audit.metadata(dict(raw(),entries=[16]*4+[4]))
    elif fault=='candidate':
        monkeypatch.setattr(audit,'MAX_PAIRS',1)
        with pytest.raises(Refused,match='membership_candidate_budget'):
            audit.expected_interiors((F(0),F(2),F(0),F(2)),2,{0:[(F(1,4),F(1,4)),(F(7,4),F(1,4))]})
    else:
        with pytest.raises(Refused):audit.decimal('1e-99')


def test_unsupported_global_or_dateline_frame_is_not_treated_as_planar_coverage():
    with pytest.raises(Refused,match='membership_envelope'):
        audit.metadata(dict(raw(),bounds=['-179','179','-1','1']))


@REAL
@pytest.mark.parametrize('target',['auditor','exporter'])
def test_code_change_after_export_refuses_evidence(graph_manifest,monkeypatch,target):
    original=audit.digest;calls=[];path=Path(audit.__file__) if target=='auditor' else audit.EXPORTER
    def changed(value):
        if Path(value)==path:
            calls.append(True)
            if len(calls)>1:return '0'*64
        return original(value)
    monkeypatch.setattr(audit,'digest',changed)
    with pytest.raises(Refused,match='membership_binding_changed'):
        audit.audit_stored_memberships(graph_manifest)


@REAL
@pytest.mark.parametrize('result',[
    {'reason':'import_timeout','returncode':-9,'output':b''},
    {'reason':None,'returncode':1,'output':b'failed'},
    {'reason':None,'returncode':0,'output':audit.MARKER+b'{}\n'+audit.MARKER+b'{}\n'},
    {'reason':None,'returncode':0,'output':audit.MARKER+b'{bad json'},
])
def test_failed_ambiguous_or_malformed_export_never_produces_membership_verdict(graph_manifest,monkeypatch,result):
    monkeypatch.setattr(audit.process,'bounded_process',lambda *a,**k:result)
    with pytest.raises(Refused):audit.audit_stored_memberships(graph_manifest)
