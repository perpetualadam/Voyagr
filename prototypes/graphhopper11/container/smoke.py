"""Opt-in LOCAL Docker smoke test on a generated graph; never contacts VPS2."""
import argparse
import hashlib
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time


def docker(args, *, code=None, timeout=90):
    result = subprocess.run(['docker', *args], input=code, capture_output=True, text=True,
                            timeout=timeout)
    if result.returncode:
        raise RuntimeError('local_container_command_failed: ' + result.stderr[-4000:])
    return result.stdout


def ownership(image, root, *, freeze=False):
    uid, gid = 10001, 10001
    program = f'''import os
from pathlib import Path
root=Path('/stage')
for path in [root,*root.rglob('*')]:
 os.chown(path,{uid},{gid},follow_symlinks=False)
 if path.is_dir(): os.chmod(path,0o700)
 elif path.is_file(): os.chmod(path,0o600)
'''
    if freeze:
        program += '''
for path in (root/'inputs').rglob('*'):
 os.chmod(path,0o500 if path.is_dir() else 0o400)
os.chmod(root/'inputs',0o500)
os.chmod(root/'secret',0o400)
'''
    docker(['run', '--rm', '--pull=never', '-i', '--network=none', '--read-only', '--user=0:0',
            '--cap-drop=ALL', '--cap-add=CHOWN', '--cap-add=DAC_OVERRIDE', '--cap-add=FOWNER',
            '--security-opt=no-new-privileges', '--mount', f'type=bind,src={root},dst=/stage',
            '--entrypoint=python', image, '-'], code=program)


def run(image, jar, *, workspace=Path('/workspace')):
    import os
    image = json.loads(docker(['image', 'inspect', image]))[0]['Id']
    if hashlib.sha256(Path(jar).read_bytes()).hexdigest() != '8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33':
        raise ValueError('pinned_jar_required')
    root = Path(tempfile.mkdtemp(prefix='gh11-container-smoke-', dir=workspace))
    original_uid, original_gid = os.getuid(), os.getgid()
    name = root.name
    started = False
    try:
        inputs, runtime = root/'inputs', root/'run'
        inputs.mkdir(); runtime.mkdir()
        shutil.copyfile(jar, inputs/'gh.jar')
        (root/'secret').write_text(secrets.token_hex(32)+'\n')
        (inputs/'source.osm').write_text('''<osm version="0.6">
<node id="1" lat="0" lon="0"/><node id="2" lat="0" lon="0.02"/>
<node id="3" lat="0" lon="0.01"/><node id="4" lat="0.003" lon="0.01"/>
<node id="5" lat="0.004" lon="0.01"/>
<way id="10"><nd ref="1"/><nd ref="3"/><nd ref="2"/><tag k="highway" v="primary"/></way>
<way id="11"><nd ref="1"/><nd ref="4"/><nd ref="2"/><tag k="highway" v="residential"/></way>
<way id="12"><nd ref="4"/><nd ref="5"/><tag k="highway" v="residential"/></way>
</osm>''')
        (inputs/'config.yml').write_text('''graphhopper:
  datareader.file: /inputs/source.osm
  graph.location: /inputs/graph
  graph.dataaccess.default_type: MMAP
  prepare.min_network_size: 0
  import.osm.ignored_highways: footway,construction,cycleway,path,steps
  graph.encoded_values: car_access,car_average_speed,road_access,max_speed,road_class,osm_way_id
  profiles:
    - name: car
      custom_model_files: [car.json]
      turn_costs:
        vehicle_types: [motorcar, motor_vehicle]
        u_turn_costs: 60
  profiles_ch: []
  profiles_lm: []
''')
        main = {'id':'main','points':[[0,0],[0,.02]],'expected_osm_way_ids':[10],'max_snap_distance_m':1}
        upper = {'id':'upper','points':[[0,0],[.003,.01],[0,.02]],'expected_osm_way_ids':[11],'max_snap_distance_m':1}
        case = {'id':'detour','points':[[0,0],[0,.02]],'blocked_associations':['main'],'block_both_directions':True,'max_snap_distance_m':1}
        (inputs/'registry.json').write_text(json.dumps({'associations':[main,upper], 'cases':[
            case,dict(case,id='refused',blocked_associations=['main','upper'])]}))
        ownership(image,root)
        common = ['--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
                  '--memory=1g','--memory-swap=1g','--cpus=1','--pids-limit=256',
                  '--tmpfs=/tmp:rw,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700']
        # Only this newly generated graph is imported, into the new test directory.
        mount = ['--mount',f'type=bind,src={inputs},dst=/inputs']
        docker(['run','--rm',*common,*mount,'--entrypoint=java',image,'-Xmx512m',
                '-XX:ActiveProcessorCount=1','-jar','/inputs/gh.jar','import','/inputs/config.yml'])
        docker(['run','--rm',*common,*mount,'--entrypoint=python',image,'-m',
                'prototypes.graphhopper11.prepare_app_manifest','--jar','/inputs/gh.jar',
                '--graph','/inputs/graph','--config','/inputs/config.yml','--registry','/inputs/registry.json',
                '--source','/inputs/source.osm','--output','/inputs/manifest.json'])
        ownership(image,root,freeze=True)
        docker(['run','-d','--name',name,'--init',*common,'--env=GH11_HEAP_MB=512',
                '--mount',f'type=bind,src={inputs},dst=/inputs,readonly',
                '--mount',f'type=bind,src={runtime},dst=/run/gh11',
                '--mount',f'type=bind,src={root/"secret"},dst=/run/secrets/gh11-password,readonly',image])
        started = True
        ready = False
        for _ in range(40):
            try:
                docker(['exec',name,'python','-m','prototypes.graphhopper11.container.healthcheck'],timeout=6)
                ready = True
                break
            except RuntimeError:
                time.sleep(.25)
        if not ready:
            raise RuntimeError('container_not_ready')
        inspection = json.loads(docker(['inspect',name]))[0]
        assert inspection['HostConfig']['NetworkMode']=='none'
        assert inspection['HostConfig']['ReadonlyRootfs'] is True
        assert inspection['Config']['User']=='10001:10001'
        assert inspection['HostConfig']['Privileged'] is False
        program = '''import base64,json
from pathlib import Path
from prototypes.graphhopper11.container.healthcheck import UnixConnection
secret=Path('/run/secrets/gh11-password').read_text().strip()
auth={'Authorization':'Basic '+base64.b64encode(('prototype:'+secret).encode()).decode()}
def call(method,path,body=None,authenticated=True):
 c=UnixConnection('localhost',timeout=60)
 try:
  headers=dict(auth) if authenticated else {}
  if body is not None: headers['Content-Type']='application/json'
  c.request(method,path,body=json.dumps(body) if body is not None else None,headers=headers)
  r=c.getresponse(); raw=r.read(); return r.status,raw
 finally: c.close()
assert call('GET','/',authenticated=False)[0]==401
assert call('GET','/')[0]==200
assert call('GET','/prototype-viewer.js')[0]==200
for asset in ('strict-route-policy.js','avoidance-integrity.js','navigation-safety-ux.js'):
 assert call('GET','/strict-assets/'+asset)[0]==200
status,raw=call('GET','/api/prototype/versions'); assert status==200
versions=json.loads(raw)
status,raw=call('GET','/api/prototype/cases'); assert status==200
settings=json.loads(raw)['case_settings']
request={**{k:versions[k] for k in ('graph_version','source_version','policy_version')},'case_id':'detour','selected_settings':settings['detour']}
status,raw=call('POST','/api/prototype/route',request); assert status==200
result=json.loads(raw); assert result['navigation_allowed'] is False
assert result['candidates'] and all(set(r['directed_edge_keys']).isdisjoint(result['blocked_edge_keys']) for r in result['candidates'])
assert result['selected_settings']==settings['detour'] and len(result['request_binding'])==64
status,raw=call('POST','/api/prototype/route',request); assert status==200
assert json.loads(raw)==result
changed={**request,'selected_settings':{**settings['detour'],'mandatory_associations':[]}}
assert call('POST','/api/prototype/route',changed)[0]==400
request['case_id']='refused'
request['selected_settings']=settings['refused']
status,raw=call('POST','/api/prototype/route',request); assert status==422
assert json.loads(raw)['navigation_allowed'] is False
from prototypes.graphhopper11.isolated_app import LocalJavaBridge
LocalJavaBridge(json.loads(Path('/inputs/manifest.json').read_text())).verify(check_source=True)
print(json.dumps({'anonymous_http':401,'authenticated_viewer_http':200,'route_http':200,'refusal_http':422,'settings_mismatch_http':400,'repeat_route_http':200,'graph_unchanged':True,'navigation_allowed':False}))
'''
        result = json.loads(docker(['exec','-i',name,'python','-'],code=program,timeout=90))
        result.update(image_id=image,network='none',uid=10001,read_only_root=True)
        return result
    finally:
        if started:
            docker(['stop','--time=10',name],timeout=30)
            docker(['rm',name])
        # Restore only the disposable test tree to its invoking owner for removal.
        program = f'''import os
from pathlib import Path
root=Path('/stage')
for path in [root,*root.rglob('*')]:
 os.chown(path,{original_uid},{original_gid},follow_symlinks=False)
 if path.is_dir(): os.chmod(path,0o700)
'''
        docker(['run','--rm','--pull=never','-i','--network=none','--read-only','--user=0:0','--cap-drop=ALL',
                '--cap-add=CHOWN','--cap-add=DAC_OVERRIDE', '--cap-add=FOWNER','--security-opt=no-new-privileges',
                '--mount',f'type=bind,src={root},dst=/stage','--entrypoint=python',image,'-'],code=program)
        shutil.rmtree(root)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image',required=True)
    parser.add_argument('--jar',required=True,type=Path)
    parser.add_argument('--workspace',default=Path('/workspace'),type=Path)
    args=parser.parse_args()
    print(json.dumps(run(args.image,args.jar,workspace=args.workspace),indent=2))


if __name__=='__main__':
    main()
