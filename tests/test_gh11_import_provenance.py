"""Observed fixed-fixture imports only; no map downloads or live infrastructure."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest

from prototypes.graphhopper11 import import_provenance as audit
from prototypes.graphhopper11.isolated_app import Refused, digest, version


@pytest.fixture(scope='module')
def observed(tmp_path_factory):
    if not os.environ.get('GH11_PROTOTYPE_JAR'):
        pytest.skip('Pinned local GH11 JAR not supplied')
    parent=tmp_path_factory.mktemp('import-provenance')
    report=audit.observe_synthetic_rebuild(os.environ['GH11_PROTOTYPE_JAR'],parent)
    return parent,report


def test_wrong_engine_refuses_before_subprocess_or_output_creation(tmp_path,monkeypatch):
    jar=tmp_path/'wrong.jar';jar.write_bytes(b'wrong runtime')
    monkeypatch.setattr(audit,'bounded_process',lambda *a,**k:pytest.fail('Must refuse before execution'))
    with pytest.raises(Refused,match='artifact_mismatch'):
        audit.observe_synthetic_rebuild(jar,tmp_path)
    assert sorted(p.name for p in tmp_path.iterdir())==['wrong.jar']


@pytest.mark.parametrize('timeout',[0,121,True,1.5])
def test_invalid_limits_refuse_before_file_access(tmp_path,timeout):
    with pytest.raises(Refused,match='import_process_limits'):
        audit.observe_synthetic_rebuild('/missing-runtime',tmp_path,timeout=timeout)
    assert not list(tmp_path.iterdir())


def test_two_imports_record_observed_lineage_and_recheck_artifacts(observed):
    parent,report=observed;root=parent/report['output_identifier']
    assert report['status']=='TWO_IMPORTS_OBSERVED'
    assert report['engine_sha256']==audit.JAR_SHA256
    assert report['harness_sha256']==digest(audit.__file__)
    assert len(report['builds'])==2
    for name,receipt in zip(('build-a','build-b'),report['builds']):
        directory=root/name
        assert receipt['import_observed'] is receipt['inputs_unchanged'] is True
        assert receipt['returncode']==0 and receipt['reason']=='process_completed'
        assert receipt['input_hashes_before']==receipt['input_hashes_after']==audit.input_hashes(directory)
        assert receipt['log_sha256']==digest(directory/'import.log')
        assert receipt['graph_files']==audit.graph_files(directory/'graph')
        assert receipt['graph_version']==version(receipt['graph_files'])
        assert receipt['started_utc']<=receipt['finished_utc'] and receipt['elapsed_seconds']>0
        unsigned=dict(receipt);identity=unsigned.pop('receipt_identity')
        assert version(unsigned)==identity
        assert receipt['command']==audit.COMMAND and receipt['navigation_allowed'] is False
        assert json.loads((directory/'receipt.json').read_text())==receipt
    assert report['builds'][0]['input_hashes_before']==report['builds'][1]['input_hashes_before']
    assert report['comparison']==audit.compare_graphs(*report['builds'])
    assert report['comparison']['status'] in {'BYTE_IDENTICAL_OBSERVED','DIFFERENCES_OBSERVED'}
    unsigned=dict(report);identity=unsigned.pop('evidence_identity')
    assert version(unsigned)==identity and json.loads((root/'evidence.json').read_text())==report
    assert report['general_reproducibility']==report['index_geometry_coverage']==report['legal_hazard_compliance']=='UNVERIFIED'
    assert report['read_only_graph_load']=='UNVERIFIED'
    assert report['navigation_allowed'] is False and report['production_migration']=='NO_GO'
    assert str(parent) not in json.dumps(report)
    assert (root.stat().st_mode & 0o777)==0o700


def test_differences_are_reported_without_ignoring_any_graph_files(observed):
    _,report=observed
    first,second=copy.deepcopy(report['builds'])
    second['graph_files']=dict(first['graph_files'])
    name=next(iter(second['graph_files']))
    second['graph_files'][name]='0'*64
    second['graph_files']['added-file']='1'*64
    result=audit.compare_graphs(first,second)
    assert result['status']=='DIFFERENCES_OBSERVED' and result['same_files'] is False
    assert result['changed_files']==[name] and result['only_second']==['added-file']
    second['import_observed']=False
    assert audit.compare_graphs(first,second)=={'status':'UNVERIFIED','same_files':None,'changed_files':[],'only_first':[],'only_second':[]}


@pytest.mark.parametrize('artifact,reason',[
    ('source.osm','import_inputs_changed'),('observed-car.json','import_inputs_changed'),
    ('graph','import_graph_changed'),('import.log','import_log_changed'),
    ('receipt.json','import_receipt_changed'),
])
def test_first_build_mutation_during_second_import_refuses_final_evidence(observed,tmp_path,monkeypatch,artifact,reason):
    original=audit.observe_build
    def changed(directory,*args,**kwargs):
        receipt=original(directory,*args,**kwargs)
        if directory.name=='build-b':
            target=directory.parent/'build-a'/artifact
            if artifact=='graph':
                target=next(p for p in target.rglob('*') if p.is_file())
            target.write_bytes(target.read_bytes()+b'synthetic mutation')
        return receipt
    monkeypatch.setattr(audit,'observe_build',changed)
    with pytest.raises(Refused,match=reason):
        audit.observe_synthetic_rebuild(os.environ['GH11_PROTOTYPE_JAR'],tmp_path)
    assert not list(tmp_path.rglob('evidence.json'))


def test_failed_import_has_failed_receipt_and_never_runs_second_import(observed,tmp_path,monkeypatch):
    original=audit.bounded_process;imports=[]
    def failed(command,cwd,**kwargs):
        if 'import' in command:
            imports.append(True)
            return {'returncode':1,'reason':None,'output':b'synthetic import error'}
        return original(command,cwd,**kwargs)
    monkeypatch.setattr(audit,'bounded_process',failed)
    report=audit.observe_synthetic_rebuild(os.environ['GH11_PROTOTYPE_JAR'],tmp_path)
    assert len(imports)==1 and len(report['builds'])==1
    receipt=report['builds'][0]
    assert receipt['import_observed'] is False and receipt['returncode']==1
    assert receipt['graph_files'] is receipt['graph_version'] is None
    assert report['status']=='IMPORT_NOT_ESTABLISHED' and report['comparison']['status']=='UNVERIFIED'
    assert report['navigation_allowed'] is False


def test_bounded_process_does_not_inherit_java_options_or_print_unbounded_output(tmp_path,monkeypatch):
    monkeypatch.setenv('JAVA_TOOL_OPTIONS','synthetic-secret')
    result=audit.bounded_process([sys.executable,'-c','import os;print(os.getenv("JAVA_TOOL_OPTIONS","absent"));print("x"*5000)'],tmp_path,output_limit=1024)
    assert result['reason']=='import_output_limit' and len(result['output'])==1024
    assert result['output'].startswith(b'absent\n') and b'synthetic-secret' not in result['output']


def test_timeout_kills_import_process_group(tmp_path):
    code='import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"]);print(p.pid,flush=True);time.sleep(30)'
    result=audit.bounded_process([sys.executable,'-c',code],tmp_path,timeout=1)
    assert result['reason']=='import_timeout' and result['returncode']!=0
    pid=int(result['output'].strip())
    stat=Path(f'/proc/{pid}/stat')
    # SIGKILL delivery/reaping is asynchronous; require termination within a
    # bounded interval rather than racing /proc cleanup immediately after wait.
    for _ in range(100):
        try:
            state=stat.read_text().split()[2]
        except FileNotFoundError:
            return
        if state=='Z':
            return
        time.sleep(.01)
    pytest.fail('Import descendant survived process-group cleanup')


def test_cli_cannot_accept_external_source_or_config(observed,tmp_path):
    command=[sys.executable,'-m','prototypes.graphhopper11.import_provenance',
             '--jar',os.environ['GH11_PROTOTYPE_JAR'],'--output-parent',str(tmp_path)]
    refused=subprocess.run(command+['--source','private.osm'],capture_output=True,text=True,timeout=10)
    assert refused.returncode==2 and not list(tmp_path.iterdir())
    completed=subprocess.run(command,capture_output=True,text=True,timeout=120)
    assert completed.returncode==0, completed.stderr[-2000:]
    report=json.loads(completed.stdout)
    assert report['status']=='TWO_IMPORTS_OBSERVED' and report['navigation_allowed'] is False
    assert str(tmp_path) not in completed.stdout


def test_input_replacement_during_import_records_failure_and_refuses_summary(observed,tmp_path,monkeypatch):
    original=audit.bounded_process
    def replaced(command,cwd,**kwargs):
        result=original(command,cwd,**kwargs)
        if 'import' in command:
            (cwd/'source.osm').write_bytes(b'<osm version="0.6"/>')
        return result
    monkeypatch.setattr(audit,'bounded_process',replaced)
    with pytest.raises(Refused,match='import_inputs_changed'):
        audit.observe_synthetic_rebuild(os.environ['GH11_PROTOTYPE_JAR'],tmp_path)
    receipts=list(tmp_path.rglob('receipt.json'))
    assert len(receipts)==1 and not list(tmp_path.rglob('evidence.json'))
    receipt=json.loads(receipts[0].read_text())
    assert receipt['inputs_unchanged'] is receipt['import_observed'] is False
    assert receipt['reason']=='inputs_changed' and receipt['graph_version'] is None


def test_changed_harness_refuses_before_import(observed,tmp_path,monkeypatch):
    original=audit.digest;calls=[]
    def changed(path):
        if Path(path)==Path(audit.__file__):
            calls.append(True)
            if len(calls)>1:
                return '0'*64
        return original(path)
    monkeypatch.setattr(audit,'digest',changed)
    monkeypatch.setattr(audit,'observe_build',lambda *a,**k:pytest.fail('Changed observer must not import'))
    with pytest.raises(Refused,match='import_runtime_changed'):
        audit.observe_synthetic_rebuild(os.environ['GH11_PROTOTYPE_JAR'],tmp_path)


def test_existing_parent_files_are_preserved_and_new_run_does_not_reuse_graph(observed,tmp_path):
    old=tmp_path/'existing-graph';old.mkdir();(old/'keep').write_bytes(b'do not change')
    before=audit.graph_files(old)
    report=audit.observe_synthetic_rebuild(os.environ['GH11_PROTOTYPE_JAR'],tmp_path)
    assert report['status']=='TWO_IMPORTS_OBSERVED'
    assert audit.graph_files(old)==before
    root=tmp_path/report['output_identifier']
    assert root!=old and all((root/name/'graph').is_dir() for name in ('build-a','build-b'))
