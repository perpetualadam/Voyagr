"""Offline manifest-bound finite spatial probes; no coverage or navigation grant."""
import argparse
import copy
import json
from pathlib import Path
import re
import tempfile

from prototypes.graphhopper11.isolated_app import LocalJavaBridge, Refused, digest, version

FIXED = {'scope':'graph_derived_finite_geometry_probes_only','radius_m':1,
         'index_geometry_coverage':'UNVERIFIED','construction_lineage':'UNVERIFIED',
         'physical_road_verification':'UNVERIFIED','heading_verification':'UNVERIFIED',
         'navigation_allowed':False,'route_absence_proven':False}
REASONS = {'graph_geometry_probes_selected','time_budget','edge_budget','geometry_budget',
           'invalid_imported_geometry','sample_budget','unsupported_geometry_envelope','geometry_selection_failure'}
SCAN_REASONS = {'complete_imported_graph_scan','edge_or_time_budget','geometry_budget',
                'invalid_imported_geometry','candidate_budget','time_budget','invalid_distance'}
INDEX_REASONS = {'index_coverage_unverified','unsupported_index_envelope','time_budget','tile_budget',
                 'callback_budget','invalid_index_edge','edge_budget','geometry_budget','candidate_budget',
                 'invalid_imported_geometry','invalid_distance','index_query_failure'}


def validate_geometry(value, edge_limit, sample_limit):
    def refuse():
        raise Refused('index_geometry_contract')
    fields = set(FIXED) | {'status','reason','edge_limit','sample_limit','edges_seen',
                          'selection_complete','samples_selected','comparisons_complete','samples'}
    if not isinstance(value,dict) or set(value) != fields:
        refuse()
    if any(type(value[k]) is not type(v) or value[k] != v for k,v in FIXED.items()):
        refuse()
    if (not isinstance(value['reason'],str) or value['reason'] not in REASONS
            or type(value['selection_complete']) is not bool or type(value['comparisons_complete']) is not bool
            or any(type(value[k]) is not int for k in ('edge_limit','sample_limit','edges_seen','samples_selected'))
            or value['edge_limit'] != edge_limit or value['sample_limit'] != sample_limit
            or not 0 <= value['edges_seen'] <= edge_limit or not 0 <= value['samples_selected'] <= sample_limit
            or not isinstance(value['samples'],list) or len(value['samples']) > value['samples_selected']):
        refuse()
    for i,row in enumerate(value['samples']):
        if not isinstance(row,dict) or set(row) != {'ordinal','comparison_complete','match',
                'full_candidate_count','index_candidate_count','missing_count','unexpected_count',
                'full_scan_complete','index_query_complete','full_scan_reason','index_query_reason'}:
            refuse()
        if (type(row['ordinal']) is not int or row['ordinal'] != i or type(row['comparison_complete']) is not bool
                or type(row['full_scan_complete']) is not bool or type(row['index_query_complete']) is not bool
                or row['comparison_complete'] != (row['full_scan_complete'] and row['index_query_complete'])
                or not isinstance(row['full_scan_reason'],str) or row['full_scan_reason'] not in SCAN_REASONS
                or not isinstance(row['index_query_reason'],str) or row['index_query_reason'] not in INDEX_REASONS
                or any(type(row[k]) is not int or not 0 <= row[k] <= 256 for k in ('full_candidate_count','index_candidate_count'))):
            refuse()
        if ((row['full_scan_reason']=='complete_imported_graph_scan') != row['full_scan_complete']
                or (row['index_query_reason']=='index_coverage_unverified') != row['index_query_complete']):
            refuse()
        if row['comparison_complete']:
            missing,unexpected=row['missing_count'],row['unexpected_count']
            if (type(missing) is not int or type(unexpected) is not int or type(row['match']) is not bool
                    or not 0 <= missing <= row['full_candidate_count'] or not 0 <= unexpected <= row['index_candidate_count']
                    or row['full_candidate_count']-missing != row['index_candidate_count']-unexpected
                    or row['match'] != (missing == unexpected == 0)):
                refuse()
        elif any(row[k] is not None for k in ('match','missing_count','unexpected_count')):
            refuse()
    complete = (value['selection_complete'] and len(value['samples']) == value['samples_selected']
                and bool(value['samples']) and all(row['comparison_complete'] for row in value['samples']))
    mismatch = any(row['match'] is False for row in value['samples'])
    expected = 'MISMATCH_OBSERVED' if mismatch else 'MATCHED_FINITE_PROBES' if complete else 'UNVERIFIED'
    if value['comparisons_complete'] != complete or value['status'] != expected:
        refuse()
    if value['selection_complete'] and value['reason'] not in {'graph_geometry_probes_selected','time_budget'}:
        refuse()
    return copy.deepcopy(value)


def audit_index_geometry(manifest, *, edge_limit=10000, sample_limit=128, java='java', timeout=60, heap_mb=512, bridge_factory=None):
    if type(edge_limit) is not int or not 1 <= edge_limit <= 10000 or type(sample_limit) is not int or not 1 <= sample_limit <= 128:
        raise Refused('index_geometry_limit')
    auditor_hash=digest(__file__)
    bridge=(bridge_factory or LocalJavaBridge)(manifest,java=java,timeout=timeout,heap_mb=heap_mb)
    identity=version(bridge.manifest)
    with tempfile.TemporaryDirectory(prefix='voyagr-gh11-geometry-') as directory:
        request=Path(directory)/'audit.json'
        request.write_text(json.dumps({'cases':[],'audit_index_geometry':{'edge_limit':edge_limit,'sample_limit':sample_limit}}))
        raw=bridge._execute(request,directory)
        bridge.verify(check_source=True)
    if digest(__file__) != auditor_hash or version(bridge.manifest) != identity:
        raise Refused('index_geometry_binding_changed')
    if (not isinstance(raw,dict) or set(raw) != {'engine_version','java_runtime','audit_only','index_geometry_observation','navigation_allowed','production_migration'}
            or raw['engine_version'] != '11.1' or raw['audit_only'] is not True
            or not isinstance(raw['java_runtime'],str) or not re.fullmatch(r'[0-9A-Za-z.+_-]{1,80}',raw['java_runtime'])
            or raw['navigation_allowed'] is not False or raw['production_migration'] != 'NO_GO'):
        raise Refused('index_geometry_envelope')
    observation=validate_geometry(raw['index_geometry_observation'],edge_limit,sample_limit)
    bindings={key:bridge.manifest[key] for key in ('graph_version','source_version','policy_version','engine_sha256','runner_sha256')}
    bindings['config_sha256']=bridge.manifest['hashes']['config']
    result={'schema':1,'scope':'manifest_bound_finite_geometry_probes_only','bindings':bindings,
            'manifest_identity':identity,'auditor_sha256':auditor_hash,'java_runtime':raw['java_runtime'],
            'artifact_check':'matched_manifest_before_and_after','observation':observation,
            'navigation_allowed':False,'production_migration':'NO_GO'}
    result['evidence_identity']=version(result)
    return result


def main():
    parser=argparse.ArgumentParser(description='Offline finite geometry probes; never exhaustive coverage or guidance authority.')
    parser.add_argument('--manifest',required=True)
    parser.add_argument('--edge-limit',type=int,default=10000)
    parser.add_argument('--sample-limit',type=int,default=128)
    parser.add_argument('--heap-mb',type=int,choices=(512,1024,2048,4096),default=512)
    args=parser.parse_args()
    try:
        result=audit_index_geometry(json.loads(Path(args.manifest).read_text()),edge_limit=args.edge_limit,
                                    sample_limit=args.sample_limit,heap_mb=args.heap_mb)
    except Exception:
        print(json.dumps({'success':False,'reason':'index_geometry_audit_refused','navigation_allowed':False,'production_migration':'NO_GO'}))
        return 1
    print(json.dumps(result,sort_keys=True))
    return 0 if result['observation']['status']=='MATCHED_FINITE_PROBES' else 2


if __name__=='__main__':
    raise SystemExit(main())
