"""Fixed synthetic import -> unchanged graph -> read-only audit bindings."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

from prototypes.graphhopper11 import observed_graph_audits as bound
from prototypes.graphhopper11.isolated_app import LocalJavaBridge, Refused, digest, graph_files, version

pytestmark=pytest.mark.skipif(not os.environ.get('GH11_PROTOTYPE_JAR'),reason='Pinned local GH11 JAR not supplied')


@pytest.fixture(scope='module')
def observed(tmp_path_factory):
    parent=tmp_path_factory.mktemp('observed-bound-source')
    jar=Path(os.environ['GH11_PROTOTYPE_JAR']).resolve()
    report=bound.imports.observe_synthetic_rebuild(jar,parent)
    return parent/report['output_identifier'],report,jar


@pytest.fixture
def prepared(observed,tmp_path):
    original,report,jar=observed
    root=tmp_path/original.name;shutil.copytree(original,root)
    return root,copy.deepcopy(report),jar


@pytest.fixture(scope='module')
def audited(observed,tmp_path_factory):
    original,report,jar=observed
    root=tmp_path_factory.mktemp('bound-success')/original.name;shutil.copytree(original,root)
    with pytest.MonkeyPatch.context() as m:
        for name in ('JAVA_TOOL_OPTIONS','_JAVA_OPTIONS','JDK_JAVA_OPTIONS','CLASSPATH','LD_PRELOAD','LD_LIBRARY_PATH'):
            m.setenv(name,'synthetic-injection')
        m.setattr(LocalJavaBridge,'route',lambda *a,**k:pytest.fail('No routing in bound audits'))
        m.setattr(bound.imports,'observe_synthetic_rebuild',lambda *a,**k:pytest.fail('Existing graph must not reimport'))
        evidence=bound.audit_observed_graphs(report,root,jar)
    return root,report,jar,evidence


def test_actual_loaded_graphs_remain_bound_to_import_receipts(audited):
    root,report,jar,evidence=audited
    assert evidence['status']=='BOUND_FINITE_CHECKS_MATCHED'
    assert evidence['import_evidence_identity']==report['evidence_identity']
    assert evidence['binder_sha256']==digest(bound.__file__)
    assert len(evidence['results'])==2
    for row,receipt in zip(evidence['results'],report['builds']):
        assert row['receipt_identity']==receipt['receipt_identity']
        assert row['graph_version']==receipt['graph_version']
        assert row['import_config_sha256']==report['config_sha256']
        assert row['load_config_sha256']!=row['import_config_sha256']
        assert row['runtime_overrides']==bound.OVERRIDES
        assert row['read_only_load']=='OBSERVED_FOR_BOUND_AUDIT_REQUESTS'
        for name in ('inventory','geometry'):
            item=row[name]
            assert item['bindings']['graph_version']==receipt['graph_version']
            assert item['bindings']['source_version']==report['source_sha256']
            assert item['bindings']['config_sha256']==row['load_config_sha256']
            assert item['manifest_identity']==row['manifest_identity']
            assert item['java_runtime']==report['java_runtime'] and item['navigation_allowed'] is False
        assert graph_files(root/row['build']/'graph')==receipt['graph_files']
        assert row['inventory']['observation']['inventory_status']=='MATCHED_EDGE_INVENTORY'
        assert row['geometry']['observation']['status']=='MATCHED_FINITE_PROBES'
        config=(root/'bound-audits'/row['build']/'load.yml').read_text()
        assert "datareader.file: ''" in config and 'custom_models.directory:' in config
        assert (root/row['build']/'config.yml').read_bytes()==bound.imports.CONFIG
    assert bound.verify_observed(root,report,jar)==report['model_sha256']
    assert evidence['index_geometry_coverage']==evidence['legal_hazard_compliance']==evidence['general_reproducibility']=='UNVERIFIED'
    assert evidence['navigation_allowed'] is False and evidence['production_migration']=='NO_GO'
    unsigned=dict(evidence);identity=unsigned.pop('evidence_identity')
    assert version(unsigned)==identity
    assert json.loads((root/'bound-audits/evidence.json').read_text())==evidence
    assert str(root) not in json.dumps(evidence)


@pytest.mark.parametrize('artifact',[
    'source.osm','config.yml','observed-car.json','graph','receipt.json','import.log','evidence.json',
])
def test_changed_original_artifacts_refuse_before_any_java(prepared,monkeypatch,artifact):
    root,report,jar=prepared
    target=root/'evidence.json' if artifact=='evidence.json' else root/'build-a'/artifact
    if artifact=='graph':
        target=next(p for p in target.iterdir() if p.is_file())
    target.write_bytes(target.read_bytes()+b'changed')
    monkeypatch.setattr(bound.imports,'bounded_process',lambda *a,**k:pytest.fail('Changed artifacts must refuse before Java'))
    with pytest.raises(Refused):
        bound.audit_observed_graphs(report,root,jar)
    assert not (root/'bound-audits').exists()


@pytest.mark.parametrize('change',[
    {'status':'IMPORT_NOT_ESTABLISHED'},{'navigation_allowed':True},
    {'index_geometry_coverage':'VERIFIED'},{'harness_sha256':'0'*64},
])
def test_modified_observer_record_cannot_grant_load_binding(prepared,monkeypatch,change):
    root,report,jar=prepared;report.update(change)
    monkeypatch.setattr(bound.imports,'bounded_process',lambda *a,**k:pytest.fail('Bad record must not execute'))
    with pytest.raises(Refused,match='observed_import_binding'):
        bound.audit_observed_graphs(report,root,jar)


@pytest.mark.parametrize('limits',[{'edge_limit':True},{'edge_limit':0},{'edge_limit':10001},{'sample_limit':0},{'sample_limit':129}])
def test_bad_limits_refuse_before_import_or_file_access(monkeypatch,limits):
    monkeypatch.setattr(bound.imports,'observe_synthetic_rebuild',lambda *a,**k:pytest.fail('No import for invalid limits'))
    with pytest.raises(Refused,match='observed_audit_limits'):
        bound.observe_import_and_audit('/missing','/missing',**limits)


def test_partial_audits_keep_observed_load_separate_from_coverage(prepared):
    root,report,jar=prepared
    evidence=bound.audit_observed_graphs(report,root,jar,sample_limit=1)
    assert evidence['status']=='BOUND_CHECKS_UNVERIFIED_OR_MISMATCHED'
    for row in evidence['results']:
        assert row['read_only_load']=='OBSERVED_FOR_BOUND_AUDIT_REQUESTS'
        assert row['geometry']['observation']['status']=='UNVERIFIED'
    assert evidence['index_geometry_coverage']=='UNVERIFIED' and evidence['navigation_allowed'] is False


def test_graph_mutation_between_native_audits_refuses_summary(prepared,monkeypatch):
    root,report,jar=prepared;original=bound.inventory.audit_index_inventory
    def changed(*args,**kwargs):
        result=original(*args,**kwargs)
        target=next(p for p in (root/'build-a/graph').iterdir() if p.is_file())
        target.write_bytes(target.read_bytes()+b'changed after load')
        return result
    monkeypatch.setattr(bound.inventory,'audit_index_inventory',changed)
    monkeypatch.setattr(bound.geometry,'audit_index_geometry',lambda *a,**k:pytest.fail('Changed graph must refuse before next audit'))
    with pytest.raises(Refused,match='observed_graph_changed'):
        bound.audit_observed_graphs(report,root,jar)
    assert not (root/'bound-audits/evidence.json').exists()


@pytest.mark.parametrize('fault',['graph','java','navigation','scope','extra'])
def test_mislabeled_audit_evidence_refuses_even_with_recomputed_identity(audited,fault):
    root,report,jar,evidence=audited
    row=evidence['results'][0];item=copy.deepcopy(row['inventory'])
    manifest=bound.build_manifest(jar=jar,graph=root/'build-a/graph',config=root/'bound-audits/build-a/load.yml',
                                  registry=root/'bound-audits/build-a/registry.json',source=root/'build-a/source.osm')
    if fault=='graph': item['bindings']['graph_version']='0'*64
    elif fault=='java': item['auditor_sha256']='0'*64
    elif fault=='navigation': item['navigation_allowed']=True
    elif fault=='scope': item['scope']='verified_coverage'
    else: item['extra']='authority'
    item.pop('evidence_identity');item['evidence_identity']=version(item)
    with pytest.raises(Refused,match='observed_audit_binding'):
        bound.verify_audit(item,manifest,bound.inventory,'manifest_bound_edge_id_inventory_only',
                           lambda v:bound.inventory.validate_inventory(v,10000))


def test_symlink_graph_and_root_are_not_accepted(prepared,tmp_path):
    root,report,jar=prepared
    graph=root/'build-a/graph';target=root/'moved-graph';graph.rename(target);graph.symlink_to(target,target_is_directory=True)
    with pytest.raises(Refused,match='observed_graph_path'):
        bound.audit_observed_graphs(report,root,jar)
    alias=tmp_path/'alias';alias.symlink_to(root,target_is_directory=True)
    with pytest.raises(Refused,match='observed_root_changed'):
        bound.audit_observed_graphs(report,alias,jar)


def test_completed_binding_cannot_overwrite_an_existing_audit_workspace(audited):
    root,report,jar,evidence=audited
    before=(root/'bound-audits/evidence.json').read_bytes()
    with pytest.raises(FileExistsError):
        bound.audit_observed_graphs(report,root,jar)
    assert (root/'bound-audits/evidence.json').read_bytes()==before


def test_cli_accepts_only_new_fixed_imports_and_returns_bound_unknown_for_partial_probes(tmp_path):
    command=[sys.executable,'-m','prototypes.graphhopper11.observed_graph_audits','--jar',os.environ['GH11_PROTOTYPE_JAR'],
             '--output-parent',str(tmp_path),'--sample-limit','1']
    refused=subprocess.run(command+['--receipt','private.json'],capture_output=True,text=True,timeout=10)
    assert refused.returncode==2 and not list(tmp_path.iterdir())
    result=subprocess.run(command,capture_output=True,text=True,timeout=120)
    assert result.returncode==2,result.stderr[-2000:]
    evidence=json.loads(result.stdout)
    assert evidence['status']=='BOUND_CHECKS_UNVERIFIED_OR_MISMATCHED' and evidence['navigation_allowed'] is False
    assert str(tmp_path) not in result.stdout


def test_load_config_changes_only_recorded_path_and_import_fields():
    directory=Path('/synthetic build/with "quotes"')
    config=bound.load_config(directory)
    config=config.replace("  datareader.file: ''\n",'  datareader.file: source.osm\n')
    config=config.replace('  graph.location: '+json.dumps(str(directory/'graph'))+'\n','  graph.location: graph\n')
    config=config.replace('  custom_models.directory: '+json.dumps(str(directory))+'\n','')
    assert config.encode()==bound.imports.CONFIG


def mocked_audits(monkeypatch,template,after_geometry=None):
    def adapt(item,manifest):
        result=copy.deepcopy(item)
        result['bindings']={name:manifest[name] for name in ('graph_version','source_version','policy_version','engine_sha256','runner_sha256')}
        result['bindings']['config_sha256']=manifest['hashes']['config']
        result['manifest_identity']=version(manifest)
        result.pop('evidence_identity');result['evidence_identity']=version(result)
        return result
    monkeypatch.setattr(bound.inventory,'audit_index_inventory',lambda manifest,**kwargs:adapt(template['inventory'],manifest))
    def geo(manifest,**kwargs):
        result=adapt(template['geometry'],manifest)
        if after_geometry:
            after_geometry(manifest)
        return result
    monkeypatch.setattr(bound.geometry,'audit_index_geometry',geo)


def test_earlier_load_config_mutation_during_later_audit_refuses_final_summary(prepared,audited,monkeypatch):
    root,report,jar=prepared;template=audited[3]['results'][0]
    def changed(manifest):
        if Path(manifest['paths']['graph']).parent.name=='build-b':
            config=root/'bound-audits/build-a/load.yml';config.write_text(config.read_text()+'\n# late mutation\n')
    mocked_audits(monkeypatch,template,after_geometry=changed)
    with pytest.raises(Refused,match='observed_load_config_changed'):
        bound.audit_observed_graphs(report,root,jar)
    assert not (root/'bound-audits/evidence.json').exists()


def test_changed_binder_source_refuses_final_summary(prepared,audited,monkeypatch):
    root,report,jar=prepared;original=bound.digest;calls=[]
    mocked_audits(monkeypatch,audited[3]['results'][0])
    def changed(path):
        if Path(path)==Path(bound.__file__):
            calls.append(True)
            if len(calls)>1:
                return '0'*64
        return original(path)
    monkeypatch.setattr(bound,'digest',changed)
    with pytest.raises(Refused,match='observed_binder_changed'):
        bound.audit_observed_graphs(report,root,jar)
    assert not (root/'bound-audits/evidence.json').exists()


def test_changed_java_version_refuses_before_audit_workspaces(prepared,monkeypatch):
    root,report,jar=prepared
    monkeypatch.setattr(bound.imports,'bounded_process',lambda *a,**k:{'reason':None,'returncode':0,'output':b'changed runtime'})
    with pytest.raises(Refused,match='observed_java_changed'):
        bound.audit_observed_graphs(report,root,jar)
    assert not (root/'bound-audits').exists()


def transport_bridge():
    bridge=bound.FixedEnvironmentBridge.__new__(bound.FixedEnvironmentBridge)
    bridge.java='/fixed/java';bridge.heap_mb=512;bridge.timeout=60;bridge.output_limit=1024
    bridge.manifest={'paths':{'jar':'/fixed/runtime.jar','config':'/fixed/load.yml','graph':'/fixed/graph'}}
    return bridge


def test_bound_transport_reuses_clean_bounded_process_and_exact_verified_paths(monkeypatch,tmp_path):
    calls=[]
    def process(command,directory,**kwargs):
        calls.append((command,directory,kwargs))
        return {'reason':None,'returncode':0,'output':bound.MARKER+b'{"audit_only":true}\n'}
    monkeypatch.setattr(bound.imports,'bounded_process',process)
    bridge=transport_bridge();fixture=tmp_path/'request.json'
    assert bridge._execute(fixture,tmp_path)=={'audit_only':True}
    command,directory,limits=calls[0]
    assert directory==tmp_path and limits=={'timeout':60,'output_limit':1024}
    assert command==['/fixed/java','-Xmx512m','-XX:ActiveProcessorCount=1',*bound.AUDIT_JVM_FLAGS,
                     '--class-path','/fixed/runtime.jar',str(bound.RUNNER),'/fixed/load.yml','/fixed/graph',str(fixture)]


@pytest.mark.parametrize('result',[
    {'reason':'import_timeout','returncode':-9,'output':b''},
    {'reason':None,'returncode':1,'output':bound.MARKER+b'{}'},
    {'reason':None,'returncode':0,'output':b'no report'},
    {'reason':None,'returncode':0,'output':bound.MARKER+b'{}\n'+bound.MARKER+b'{}\n'},
    {'reason':None,'returncode':0,'output':bound.MARKER+b'{bad json'},
])
def test_bound_transport_refuses_timeout_failed_or_ambiguous_native_reports(monkeypatch,tmp_path,result):
    monkeypatch.setattr(bound.imports,'bounded_process',lambda *a,**k:result)
    with pytest.raises(Refused):
        transport_bridge()._execute(tmp_path/'request.json',tmp_path)
