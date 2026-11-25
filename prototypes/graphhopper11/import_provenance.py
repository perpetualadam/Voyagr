"""Two observed imports of a fixed synthetic fixture. Never accepts a map dataset."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import selectors
import shutil
import signal
import subprocess
import tempfile
import time
import zipfile

from prototypes.graphhopper11.isolated_app import JAR_SHA256, Refused, digest, graph_files, version

SOURCE = b'''<osm version="0.6">
<node id="1" lat="0" lon="0"/><node id="2" lat="0" lon="0.001"/>
<node id="3" lat="0.001" lon="0.001"/>
<way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/></way>
</osm>'''
CONFIG = b'''graphhopper:
  datareader.file: source.osm
  graph.location: graph
  graph.dataaccess.default_type: MMAP
  prepare.min_network_size: 0
  import.osm.ignored_highways: footway,construction,cycleway,path,steps
  graph.encoded_values: car_access,car_average_speed,road_access,max_speed,road_class,osm_way_id
  profiles:
    - name: car
      custom_model_files: [observed-car.json]
      turn_costs:
        vehicle_types: [motorcar, motor_vehicle]
        u_turn_costs: 60
  profiles_ch: []
  profiles_lm: []
'''
COMMAND = ['JAVA','-Xmx512m','-XX:ActiveProcessorCount=1','-Djava.io.tmpdir=.',
           '-Duser.home=.','-XX:-UsePerfData','-jar','PINNED_JAR','import','config.yml']
MODEL_ENTRY = 'com/graphhopper/custom_models/car.json'


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def bounded_process(command, cwd, *, timeout=120, output_limit=2*1024*1024):
    """Fixed local commands, isolated environment, bounded capture and child lifetime."""
    if type(timeout) is not int or not 1 <= timeout <= 120 or type(output_limit) is not int or not 1024 <= output_limit <= 2*1024*1024:
        raise Refused('import_process_limits')
    env={'PATH':str(Path(command[0]).parent),'LANG':'C.UTF-8','TZ':'UTC','HOME':str(cwd),'TMPDIR':str(cwd)}
    process=subprocess.Popen(command,cwd=cwd,env=env,stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
    data=bytearray();deadline=time.monotonic()+timeout;reason=None
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout,selectors.EVENT_READ)
            while selector.get_map():
                if time.monotonic()>=deadline:
                    reason='import_timeout';break
                for key,_ in selector.select(min(.2,max(0,deadline-time.monotonic()))):
                    chunk=os.read(key.fd,65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                    else:
                        remaining=output_limit-len(data)
                        data.extend(chunk[:remaining])
                        if len(chunk)>remaining:
                            reason='import_output_limit';break
                if reason:
                    break
        if reason is None:
            process.wait(timeout=max(.01,deadline-time.monotonic()))
    except subprocess.TimeoutExpired:
        reason='import_timeout'
    finally:
        # Also kill descendants retaining stdout or surviving a failed parent.
        try:
            os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait();process.stdout.close()
    return {'returncode':process.returncode,'reason':reason,'output':bytes(data)}


def input_hashes(directory):
    names=('source.osm','config.yml','observed-car.json')
    if any((directory/name).is_symlink() for name in names):
        raise Refused('import_input_symlink')
    return {name:digest(directory/name) for name in names}


def observe_build(directory, jar, java, model, *, timeout):
    directory.mkdir(mode=0o700)
    (directory/'source.osm').write_bytes(SOURCE)
    (directory/'config.yml').write_bytes(CONFIG)
    (directory/'observed-car.json').write_bytes(model)
    before=input_hashes(directory)
    expected={'source.osm':hashlib.sha256(SOURCE).hexdigest(),'config.yml':hashlib.sha256(CONFIG).hexdigest(),
              'observed-car.json':hashlib.sha256(model).hexdigest()}
    if before!=expected:
        raise Refused('import_fixture_changed')
    if (directory/'graph').exists():
        raise Refused('import_output_not_empty')
    started=utc_now();clock=time.monotonic()
    command=[str(java) if token=='JAVA' else str(jar) if token=='PINNED_JAR' else token for token in COMMAND]
    result=bounded_process(command,directory,timeout=timeout)
    # Raw bounded logs stay in this new operator-only workspace, never stdout/HTTP.
    (directory/'import.log').write_bytes(result['output'])
    after=input_hashes(directory)
    unchanged=before==after
    success=result['reason'] is None and result['returncode']==0 and unchanged
    files=None
    if success:
        graph=directory/'graph'
        if graph.is_symlink():
            raise Refused('import_graph_symlink')
        files=graph_files(graph)
    receipt={'schema':1,'scope':'observed_fixed_synthetic_import_only','started_utc':started,'finished_utc':utc_now(),
             'elapsed_seconds':time.monotonic()-clock,'command':COMMAND,'heap_mb':512,'active_processor_count':1,
             'process_timeout_seconds':timeout,'process_output_limit_bytes':2*1024*1024,
             'environment_policy':'fixed_path_locale_timezone_home_tmp_no_inherited_java_options',
             'input_hashes_before':before,'input_hashes_after':after,'inputs_unchanged':unchanged,
             'returncode':result['returncode'],'reason':result['reason'] or ('inputs_changed' if not unchanged else
                 'import_nonzero_exit' if result['returncode']!=0 else 'process_completed'),
             'log_sha256':hashlib.sha256(result['output']).hexdigest(),'log_bytes':len(result['output']),
             'import_observed':success,'graph_files':files,'graph_version':version(files) if files else None,
             'navigation_allowed':False,'production_migration':'NO_GO'}
    receipt['receipt_identity']=version(receipt)
    (directory/'receipt.json').write_text(json.dumps(receipt,sort_keys=True))
    return receipt


def compare_graphs(first, second):
    if not first['import_observed'] or not second['import_observed']:
        return {'status':'UNVERIFIED','same_files':None,'changed_files':[],'only_first':[],'only_second':[]}
    a,b=first['graph_files'],second['graph_files']
    changed=sorted(name for name in set(a)&set(b) if a[name]!=b[name])
    only_a,only_b=sorted(set(a)-set(b)),sorted(set(b)-set(a))
    same=not (changed or only_a or only_b)
    return {'status':'BYTE_IDENTICAL_OBSERVED' if same else 'DIFFERENCES_OBSERVED','same_files':same,
            'changed_files':changed,'only_first':only_a,'only_second':only_b}


def observe_synthetic_rebuild(jar, parent, *, timeout=120):
    if type(timeout) is not int or not 1 <= timeout <= 120:
        raise Refused('import_process_limits')
    jar=Path(jar).resolve(strict=True)
    if digest(jar)!=JAR_SHA256:
        raise Refused('artifact_mismatch')
    java=Path(shutil.which('java') or '/missing-java').resolve(strict=True)
    parent=Path(parent).resolve(strict=True)
    if not parent.is_dir():
        raise Refused('import_parent_not_directory')
    code_hash=digest(__file__);java_hash=digest(java)
    with zipfile.ZipFile(jar) as archive:
        model=archive.read(MODEL_ENTRY)
    if len(model)>65536:
        raise Refused('import_model_limit')
    root=Path(tempfile.mkdtemp(prefix='voyagr-gh11-import-',dir=parent));root.chmod(0o700)
    runtime=bounded_process([str(java),'-version'],root,timeout=10)
    if runtime['returncode']!=0 or runtime['reason']:
        raise Refused('import_runtime_unavailable')
    runtime_hash=hashlib.sha256(runtime['output']).hexdigest()
    match=re.search(rb'version "([0-9A-Za-z.+_-]{1,80})"',runtime['output'])
    if not match or int(match[1].split(b'.')[0])<17:
        raise Refused('import_runtime_version')
    java_version=match[1].decode('ascii')
    release=java.parent.parent/'release'
    release_hash=digest(release) if release.is_file() else None
    builds=[]
    for name in ('build-a','build-b'):
        if digest(jar)!=JAR_SHA256 or digest(java)!=java_hash or digest(__file__)!=code_hash:
            raise Refused('import_runtime_changed')
        builds.append(observe_build(root/name,jar,java,model,timeout=timeout))
        if not builds[-1]['import_observed']:
            break
    if digest(jar)!=JAR_SHA256 or digest(java)!=java_hash or digest(__file__)!=code_hash:
        raise Refused('import_runtime_changed')
    runtime_after=bounded_process([str(java),'-version'],root,timeout=10)
    if (runtime_after['reason'] or runtime_after['returncode']!=0
            or hashlib.sha256(runtime_after['output']).hexdigest()!=runtime_hash
            or (digest(release) if release.is_file() else None)!=release_hash):
        raise Refused('import_runtime_changed')
    for name,receipt in zip(('build-a','build-b'),builds):
        directory=root/name
        if input_hashes(directory)!=receipt['input_hashes_before']:
            raise Refused('import_inputs_changed')
        if receipt['import_observed'] and ((directory/'graph').is_symlink() or graph_files(directory/'graph')!=receipt['graph_files']):
            raise Refused('import_graph_changed')
        if (directory/'import.log').is_symlink() or digest(directory/'import.log')!=receipt['log_sha256']:
            raise Refused('import_log_changed')
        receipt_path=directory/'receipt.json'
        if (receipt_path.is_symlink() or receipt_path.read_text()!=json.dumps(receipt,sort_keys=True)):
            raise Refused('import_receipt_changed')
    comparison=compare_graphs(builds[0],builds[-1]) if len(builds)==2 else {
        'status':'UNVERIFIED','same_files':None,'changed_files':[],'only_first':[],'only_second':[]}
    if len(builds)==2 and builds[0]['input_hashes_before']!=builds[1]['input_hashes_before']:
        raise Refused('import_fixture_changed')
    report={'schema':1,'scope':'two_fixed_synthetic_imports_only','engine_version':'11.1','engine_sha256':JAR_SHA256,
            'harness_sha256':code_hash,'java_launcher_sha256':java_hash,'java_version_output_sha256':runtime_hash,
            'java_runtime':java_version,'java_release_sha256':release_hash,
            'platform':{'system':platform.system(),'machine':platform.machine(),'python':platform.python_version()},
            'model_entry':MODEL_ENTRY,'model_sha256':hashlib.sha256(model).hexdigest(),
            'source_sha256':hashlib.sha256(SOURCE).hexdigest(),'config_sha256':hashlib.sha256(CONFIG).hexdigest(),
            'output_identifier':root.name,'builds':builds,'comparison':comparison,
            'status':'TWO_IMPORTS_OBSERVED' if len(builds)==2 and all(b['import_observed'] for b in builds) else 'IMPORT_NOT_ESTABLISHED',
            'construction_scope':'observer_record_only_not_signed_attestation','general_reproducibility':'UNVERIFIED',
            'index_geometry_coverage':'UNVERIFIED','legal_hazard_compliance':'UNVERIFIED',
            'read_only_graph_load':'UNVERIFIED',
            'navigation_allowed':False,'production_migration':'NO_GO'}
    report['evidence_identity']=version(report)
    (root/'evidence.json').write_text(json.dumps(report,sort_keys=True))
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jar',required=True)
    parser.add_argument('--output-parent',required=True,help='Existing scratch parent; a new private child is created')
    args=parser.parse_args()
    try:
        report=observe_synthetic_rebuild(args.jar,args.output_parent)
    except Exception:
        print(json.dumps({'status':'IMPORT_REFUSED','navigation_allowed':False,'production_migration':'NO_GO'}))
        return 1
    print(json.dumps(report,sort_keys=True))
    return 0 if report['status']=='TWO_IMPORTS_OBSERVED' else 2


if __name__=='__main__':
    raise SystemExit(main())
