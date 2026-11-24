"""Explicit offline edge-ID reconciliation. No app factory, listener or guidance grant."""
import argparse
import copy
import json
from pathlib import Path
import re
import tempfile

from prototypes.graphhopper11.isolated_app import LocalJavaBridge, Refused, digest, version

REASONS = {'edge_id_inventory_compared','graph_id_budget','time_budget','graph_edge_budget',
           'invalid_graph_inventory','tile_budget','callback_budget','invalid_index_edge',
           'index_edge_budget','index_inventory_failure'}
NUMBERS = {'edge_limit','edge_id_bound','graph_edge_count','indexed_edge_count','index_callbacks','tiles_visited'}
BOOLEANS = {'graph_enumeration_complete','index_query_complete','inventory_complete','navigation_allowed','route_absence_proven'}
PARTIAL = {'inventory_match','missing_edge_count','unexpected_edge_count','graph_inventory_sha256','index_inventory_sha256'}
FIXED = {'scope':'edge_id_inventory_only','index_geometry_coverage':'UNVERIFIED',
         'physical_road_verification':'UNVERIFIED','heading_verification':'UNVERIFIED'}


def validate_inventory(value, edge_limit):
    """Validate narrow reconciliation claims; never trust an authority flag."""
    def refuse():
        raise Refused('index_inventory_contract')
    if not isinstance(value,dict) or set(value) != NUMBERS | BOOLEANS | PARTIAL | set(FIXED) | {'inventory_status','reason'}:
        refuse()
    if (any(value[key] != expected for key,expected in FIXED.items())
            or not isinstance(value['reason'],str) or value['reason'] not in REASONS):
        refuse()
    if any(type(value[key]) is not int or value[key]<0 for key in NUMBERS) or any(type(value[key]) is not bool for key in BOOLEANS):
        refuse()
    if (value['edge_limit'] != edge_limit or value['navigation_allowed'] or value['route_absence_proven']
            or value['edge_id_bound'] >= 2**31 or value['graph_edge_count'] > min(edge_limit,value['edge_id_bound'])
            or value['indexed_edge_count'] > min(edge_limit,value['edge_id_bound'])
            or value['indexed_edge_count'] > value['index_callbacks']
            or value['index_callbacks'] > min(250_000_000,edge_limit*5+1024)+1
            or value['tiles_visited'] > min(50_000_000,edge_limit*8+1024)+1):
        refuse()
    complete = value['graph_enumeration_complete'] and value['index_query_complete']
    if value['inventory_complete'] != complete or value['index_query_complete'] and not value['graph_enumeration_complete']:
        refuse()
    if not complete:
        if value['inventory_status'] != 'UNVERIFIED' or any(value[key] is not None for key in PARTIAL):
            refuse()
    else:
        missing,unexpected = value['missing_edge_count'],value['unexpected_edge_count']
        if (type(value['inventory_match']) is not bool or type(missing) is not int or type(unexpected) is not int
                or not 0 <= missing <= value['graph_edge_count'] or not 0 <= unexpected <= value['indexed_edge_count']
                or value['graph_edge_count']-missing != value['indexed_edge_count']-unexpected
                or value['reason'] != 'edge_id_inventory_compared'):
            refuse()
        hashes = [value[key] for key in ('graph_inventory_sha256','index_inventory_sha256')]
        if any(not isinstance(h,str) or not re.fullmatch(r'[0-9a-f]{64}',h) for h in hashes):
            refuse()
        matched = missing == unexpected == 0
        if (value['inventory_match'] != matched or (hashes[0] == hashes[1]) != matched
                or value['inventory_status'] != ('MATCHED_EDGE_INVENTORY' if matched else 'MISMATCHED_EDGE_INVENTORY')):
            refuse()
    return copy.deepcopy(value)


def audit_index_inventory(manifest, *, edge_limit=10000, java='java', timeout=60, heap_mb=512):
    if type(edge_limit) is not int or not 1 <= edge_limit <= 50_000_000:
        raise Refused('index_inventory_limit')
    auditor_hash = digest(__file__)
    bridge = LocalJavaBridge(manifest,java=java,timeout=timeout,heap_mb=heap_mb)
    identity = version(bridge.manifest)
    with tempfile.TemporaryDirectory(prefix='voyagr-gh11-inventory-') as directory:
        request = Path(directory)/'audit.json'
        request.write_text(json.dumps({'cases':[],'audit_index_inventory':{'edge_limit':edge_limit}}))
        raw = bridge._execute(request,directory)
        bridge.verify(check_source=True)
    if digest(__file__) != auditor_hash or version(bridge.manifest) != identity:
        raise Refused('index_inventory_binding_changed')
    if (not isinstance(raw,dict) or set(raw) != {'engine_version','java_runtime','audit_only','index_inventory_observation','navigation_allowed','production_migration'}
            or raw['engine_version'] != '11.1' or raw['audit_only'] is not True
            or not isinstance(raw['java_runtime'],str) or not re.fullmatch(r'[0-9A-Za-z.+_-]{1,80}',raw['java_runtime'])
            or raw['navigation_allowed'] is not False or raw['production_migration'] != 'NO_GO'):
        raise Refused('index_inventory_envelope')
    observation = validate_inventory(raw['index_inventory_observation'],edge_limit)
    bindings = {key:bridge.manifest[key] for key in ('graph_version','source_version','policy_version','engine_sha256','runner_sha256')}
    bindings['config_sha256'] = bridge.manifest['hashes']['config']
    result = {'schema':1,'scope':'manifest_bound_edge_id_inventory_only','bindings':bindings,
              'manifest_identity':identity,'auditor_sha256':auditor_hash,
              'artifact_check':'matched_manifest_before_and_after','java_runtime':raw['java_runtime'],'observation':observation,
              'navigation_allowed':False,'production_migration':'NO_GO'}
    result['evidence_identity'] = version(result)
    return result


def main():
    parser = argparse.ArgumentParser(description='Read-only isolated GH11 edge-ID inventory audit; never navigation authority.')
    parser.add_argument('--manifest',required=True)
    parser.add_argument('--edge-limit',type=int,default=10000)
    parser.add_argument('--heap-mb',type=int,choices=(512,1024,2048,4096),default=512)
    args = parser.parse_args()
    try:
        manifest = json.loads(Path(args.manifest).read_text())
        result = audit_index_inventory(manifest,edge_limit=args.edge_limit,heap_mb=args.heap_mb)
    except Exception:
        print(json.dumps({'success':False,'reason':'index_inventory_audit_refused','navigation_allowed':False,'production_migration':'NO_GO'}))
        return 1
    print(json.dumps(result,sort_keys=True))
    return 0 if result['observation']['inventory_status'] == 'MATCHED_EDGE_INVENTORY' else 2


if __name__ == '__main__':
    raise SystemExit(main())
