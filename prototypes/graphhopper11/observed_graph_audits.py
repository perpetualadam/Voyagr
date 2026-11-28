"""Fresh fixed synthetic imports followed by artifact-bound read-only audits."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

from prototypes.graphhopper11 import import_provenance as imports
from prototypes.graphhopper11 import index_inventory_audit as inventory
from prototypes.graphhopper11 import index_geometry_audit as geometry
from prototypes.graphhopper11.isolated_app import LocalJavaBridge, MARKER, RUNNER, Refused, build_manifest, digest, graph_files, version

OVERRIDES = {'datareader.file':['source.osm',''], 'graph.location':['graph','OBSERVED_GRAPH'],
             'custom_models.directory':['implicit_import_working_directory','OBSERVED_BUILD']}
REGISTRY = {'scope':'operator_audit_only_no_registered_route', 'cases':[{'id':'audit_only_unroutable'}]}
AUDIT_JVM_FLAGS = ['-Djava.io.tmpdir=.','-Duser.home=.','-XX:-UsePerfData']


class FixedEnvironmentBridge(LocalJavaBridge):
    """Reuse manifest verification and bounded clean-env import transport."""
    def _execute(self, fixture, directory):
        command=[self.java,f'-Xmx{self.heap_mb}m','-XX:ActiveProcessorCount=1',*AUDIT_JVM_FLAGS,
                 '--class-path',self.manifest['paths']['jar'],str(RUNNER),self.manifest['paths']['config'],
                 self.manifest['paths']['graph'],str(fixture)]
        result=imports.bounded_process(command,directory,timeout=self.timeout,output_limit=self.output_limit)
        if result['reason'] or result['returncode']!=0:
            raise Refused('observed_native_process_refused')
        rows=[line[len(MARKER):] for line in result['output'].splitlines() if line.startswith(MARKER)]
        if len(rows)!=1:
            raise Refused('observed_native_report')
        try:
            return json.loads(rows[0])
        except ValueError as error:
            raise Refused('observed_native_report') from error


def same_json(path, expected):
    if path.is_symlink() or path.stat().st_size>262144 or path.read_text()!=json.dumps(expected,sort_keys=True):
        raise Refused('observed_record_changed')


def verify_observed(root, report, jar):
    """Check the original in-memory observer record and its retained artifacts."""
    root=Path(root);jar=Path(jar)
    if root.is_symlink() or root.name!=report.get('output_identifier'):
        raise Refused('observed_root_changed')
    unsigned=dict(report);identity=unsigned.pop('evidence_identity',None)
    if (version(unsigned)!=identity or report.get('status')!='TWO_IMPORTS_OBSERVED'
            or report.get('engine_sha256')!=imports.JAR_SHA256 or digest(jar)!=imports.JAR_SHA256
            or report.get('harness_sha256')!=digest(imports.__file__)
            or report.get('navigation_allowed') is not False or report.get('production_migration')!='NO_GO'
            or any(report.get(key)!='UNVERIFIED' for key in ('general_reproducibility','index_geometry_coverage','legal_hazard_compliance','read_only_graph_load'))
            or report.get('source_sha256')!=hashlib.sha256(imports.SOURCE).hexdigest()
            or report.get('config_sha256')!=hashlib.sha256(imports.CONFIG).hexdigest()
            or not isinstance(report.get('builds'),list) or len(report['builds'])!=2):
        raise Refused('observed_import_binding')
    same_json(root/'evidence.json',report)
    with zipfile.ZipFile(jar) as archive:
        model_hash=hashlib.sha256(archive.read(imports.MODEL_ENTRY)).hexdigest()
    if report.get('model_sha256')!=model_hash or report.get('model_entry')!=imports.MODEL_ENTRY:
        raise Refused('observed_model_binding')
    expected={'source.osm':report['source_sha256'],'config.yml':report['config_sha256'],'observed-car.json':model_hash}
    for name,receipt in zip(('build-a','build-b'),report['builds']):
        directory=root/name
        unsigned=dict(receipt);identity=unsigned.pop('receipt_identity',None)
        if (version(unsigned)!=identity or receipt.get('import_observed') is not True
                or receipt.get('inputs_unchanged') is not True or type(receipt.get('returncode')) is not int
                or receipt['returncode']!=0 or receipt.get('command')!=imports.COMMAND
                or receipt.get('navigation_allowed') is not False or receipt.get('production_migration')!='NO_GO'
                or receipt.get('input_hashes_before')!=expected or receipt.get('input_hashes_after')!=expected
                or receipt.get('graph_version')!=version(receipt.get('graph_files'))):
            raise Refused('observed_receipt_binding')
        if directory.is_symlink() or (directory/'graph').is_symlink():
            raise Refused('observed_graph_path')
        same_json(directory/'receipt.json',receipt)
        if imports.input_hashes(directory)!=expected:
            raise Refused('observed_inputs_changed')
        if graph_files(directory/'graph')!=receipt['graph_files']:
            raise Refused('observed_graph_changed')
        log=directory/'import.log'
        if log.is_symlink() or log.stat().st_size>2*1024*1024 or digest(log)!=receipt['log_sha256']:
            raise Refused('observed_log_changed')
    return model_hash


def verify_runtime(root, report):
    java=Path(shutil.which('java') or '/missing-java').resolve(strict=True)
    release=java.parent.parent/'release'
    if (digest(java)!=report['java_launcher_sha256']
            or (digest(release) if release.is_file() else None)!=report['java_release_sha256']):
        raise Refused('observed_java_changed')
    result=imports.bounded_process([str(java),'-version'],root,timeout=10)
    if (result['reason'] or result['returncode']!=0
            or hashlib.sha256(result['output']).hexdigest()!=report['java_version_output_sha256']):
        raise Refused('observed_java_changed')
    return str(java)


def load_config(directory):
    """Only explicit path/import overrides; profile/model/encoded values stay fixed."""
    text=imports.CONFIG.decode()
    text=text.replace('  datareader.file: source.osm\n',"  datareader.file: ''\n")
    text=text.replace('  graph.location: graph\n','  graph.location: '+json.dumps(str(directory/'graph'))+'\n')
    return text.replace('  profiles:\n','  custom_models.directory: '+json.dumps(str(directory))+'\n  profiles:\n')


def verify_audit(evidence, manifest, module, scope, validator):
    fields={'schema','scope','bindings','manifest_identity','auditor_sha256','artifact_check','java_runtime',
            'observation','navigation_allowed','production_migration','evidence_identity'}
    if not isinstance(evidence,dict) or set(evidence)!=fields:
        raise Refused('observed_audit_binding')
    unsigned=dict(evidence);identity=unsigned.pop('evidence_identity',None)
    expected={name:manifest[name] for name in ('graph_version','source_version','policy_version','engine_sha256','runner_sha256')}
    expected['config_sha256']=manifest['hashes']['config']
    if (version(unsigned)!=identity or evidence.get('scope')!=scope or type(evidence.get('schema')) is not int or evidence['schema']!=1
            or evidence.get('bindings')!=expected or evidence.get('manifest_identity')!=version(manifest)
            or evidence.get('auditor_sha256')!=digest(module.__file__)
            or evidence.get('artifact_check')!='matched_manifest_before_and_after'
            or evidence.get('navigation_allowed') is not False or evidence.get('production_migration')!='NO_GO'):
        raise Refused('observed_audit_binding')
    validator(evidence.get('observation'))
    return evidence


def audit_observed_graphs(report, root, jar, *, edge_limit=10000, sample_limit=128):
    """Internal continuation from the original observer; no receipt-upload endpoint."""
    if type(edge_limit) is not int or not 1<=edge_limit<=10000 or type(sample_limit) is not int or not 1<=sample_limit<=128:
        raise Refused('observed_audit_limits')
    if Path(root).is_symlink():
        raise Refused('observed_root_changed')
    root=Path(root).resolve(strict=True);jar=Path(jar).resolve(strict=True)
    binder_hash=digest(__file__)
    auditor_hashes={name:digest(module.__file__) for name,module in (('inventory',inventory),('geometry',geometry))}
    model_hash=verify_observed(root,report,jar);java=verify_runtime(root,report)
    folder=root/'bound-audits';folder.mkdir(mode=0o700)  # No reuse or overwrite.
    results=[];checks=[]
    for name,receipt in zip(('build-a','build-b'),report['builds']):
        verify_observed(root,report,jar)
        directory=root/name;out=folder/name;out.mkdir(mode=0o700)
        config=out/'load.yml';config.write_text(load_config(directory))
        registry=out/'registry.json';registry.write_text(json.dumps(REGISTRY,sort_keys=True))
        manifest=build_manifest(jar=jar,graph=directory/'graph',config=config,registry=registry,source=directory/'source.osm')
        if manifest['graph_version']!=receipt['graph_version'] or manifest['graph_files']!=receipt['graph_files']:
            raise Refused('observed_manifest_graph')
        config_hash=digest(config);registry_hash=digest(registry)
        inv=inventory.audit_index_inventory(manifest,edge_limit=edge_limit,java=java,bridge_factory=FixedEnvironmentBridge)
        verify_observed(root,report,jar)
        geo=geometry.audit_index_geometry(manifest,edge_limit=edge_limit,sample_limit=sample_limit,java=java,bridge_factory=FixedEnvironmentBridge)
        verify_observed(root,report,jar)
        verify_audit(inv,manifest,inventory,'manifest_bound_edge_id_inventory_only',
                     lambda value:inventory.validate_inventory(value,edge_limit))
        verify_audit(geo,manifest,geometry,'manifest_bound_finite_geometry_probes_only',
                     lambda value:geometry.validate_geometry(value,edge_limit,sample_limit))
        if inv.get('java_runtime')!=report['java_runtime'] or geo.get('java_runtime')!=report['java_runtime']:
            raise Refused('observed_audit_java')
        if digest(config)!=config_hash or digest(registry)!=registry_hash:
            raise Refused('observed_load_config_changed')
        checks.append((manifest,config,registry,config_hash,registry_hash))
        results.append({'build':name,'receipt_identity':receipt['receipt_identity'],'graph_version':receipt['graph_version'],
                        'import_config_sha256':report['config_sha256'],'load_config_sha256':config_hash,
                        'model_sha256':model_hash,'runtime_overrides':OVERRIDES,'manifest_identity':version(manifest),
                        'read_only_load':'OBSERVED_FOR_BOUND_AUDIT_REQUESTS','inventory':inv,'geometry':geo,
                        'navigation_allowed':False})
    verify_observed(root,report,jar);verify_runtime(root,report)
    for manifest,config,registry,config_hash,registry_hash in checks:
        if config.is_symlink() or registry.is_symlink() or digest(config)!=config_hash or digest(registry)!=registry_hash:
            raise Refused('observed_load_config_changed')
        LocalJavaBridge(manifest,java=java).verify(check_source=True)
    if (digest(__file__)!=binder_hash or auditor_hashes!=
            {name:digest(module.__file__) for name,module in (('inventory',inventory),('geometry',geometry))}):
        raise Refused('observed_binder_changed')
    matched=all(row['inventory']['observation']['inventory_status']=='MATCHED_EDGE_INVENTORY'
                and row['geometry']['observation']['status']=='MATCHED_FINITE_PROBES' for row in results)
    evidence={'schema':1,'scope':'observed_fixed_synthetic_graphs_read_only_audits_only',
              'import_evidence_identity':report['evidence_identity'],'binder_sha256':binder_hash,
              'auditor_hashes':auditor_hashes,
              'audit_environment':'fixed_path_locale_timezone_home_tmp_no_inherited_java_options',
              'audit_jvm_flags':AUDIT_JVM_FLAGS,
              'results':results,'status':'BOUND_FINITE_CHECKS_MATCHED' if matched else 'BOUND_CHECKS_UNVERIFIED_OR_MISMATCHED',
              'construction_scope':'observer_record_only_not_signed_attestation','general_reproducibility':'UNVERIFIED',
              'index_geometry_coverage':'UNVERIFIED','legal_hazard_compliance':'UNVERIFIED',
              'navigation_allowed':False,'production_migration':'NO_GO'}
    evidence['evidence_identity']=version(evidence)
    (folder/'evidence.json').write_text(json.dumps(evidence,sort_keys=True))
    return evidence


def observe_import_and_audit(jar,parent,*,edge_limit=10000,sample_limit=128):
    if type(edge_limit) is not int or not 1<=edge_limit<=10000 or type(sample_limit) is not int or not 1<=sample_limit<=128:
        raise Refused('observed_audit_limits')
    report=imports.observe_synthetic_rebuild(jar,parent)
    return audit_observed_graphs(report,Path(parent)/report['output_identifier'],jar,
                                edge_limit=edge_limit,sample_limit=sample_limit)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jar',required=True);parser.add_argument('--output-parent',required=True)
    parser.add_argument('--edge-limit',type=int,default=10000);parser.add_argument('--sample-limit',type=int,default=128)
    args=parser.parse_args()
    try:
        evidence=observe_import_and_audit(args.jar,args.output_parent,edge_limit=args.edge_limit,sample_limit=args.sample_limit)
    except Exception:
        print(json.dumps({'status':'OBSERVED_GRAPH_AUDIT_REFUSED','navigation_allowed':False,'production_migration':'NO_GO'}))
        return 1
    print(json.dumps(evidence,sort_keys=True))
    return 0 if evidence['status']=='BOUND_FINITE_CHECKS_MATCHED' else 2


if __name__=='__main__':
    raise SystemExit(main())
