"""Print proposed VPS2 commands only. Does not start, stop or inspect a service."""
import argparse
import json
from pathlib import Path
import re
import shlex


def service_command(image, root, name):
    root = Path(root)
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image):
        raise ValueError('immutable_local_image_id_required')
    if not root.is_absolute() or root.parent != Path('/opt') or not re.fullmatch(r'voyagr-gh11-app-[a-z0-9-]+', root.name):
        raise ValueError('dedicated_opt_directory_required')
    if not re.fullmatch(r'voyagr-gh11-app-[a-z0-9-]+', name):
        raise ValueError('dedicated_container_name_required')
    return ['docker','run','-d','--pull=never','--name',name,'--init','--network=none','--read-only',
            '--user=10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges',
            '--memory=6g','--memory-swap=6g','--cpus=1','--pids-limit=256','--stop-timeout=15',
            '--tmpfs=/tmp:rw,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700',
            '--env=GH11_HEAP_MB=4096','--log-opt=max-size=1m','--log-opt=max-file=2',
            '--mount',f'type=bind,src={root/"inputs"},dst=/inputs,readonly',
            '--mount',f'type=bind,src={root/"run"},dst=/run/gh11',
            '--mount',f'type=bind,src={root/"secret"},dst=/run/secrets/gh11-password,readonly',image]


def proposal(image, root, name):
    start = service_command(image,root,name)
    root = Path(root)
    common = ['--pull=never','--network=none','--read-only','--user=10001:10001','--cap-drop=ALL',
              '--security-opt=no-new-privileges','--memory=1g','--memory-swap=1g','--cpus=1',
              '--pids-limit=128','--tmpfs=/tmp:rw,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=0700']
    prepare = ['docker','run','--rm',*common,'--mount',f'type=bind,src={root/"inputs"},dst=/inputs,readonly',
               '--mount',f'type=bind,src={root/"prepared"},dst=/prepared','--entrypoint=python',image,
               '-m','prototypes.graphhopper11.prepare_app_manifest','--jar','/inputs/gh.jar',
               '--graph','/inputs/graph','--config','/inputs/config.yml','--registry','/inputs/registry.json',
               '--source','/inputs/source.osm.pbf','--output','/prepared/manifest.json']
    return {
        'status':'PROPOSED_NOT_EXECUTED','host':'vmi3072171','image_id':image,
        'preflight':['hostname','uname -m','free -h','df -h /opt',
                     shlex.join(['docker','image','inspect',image]),
                     shlex.join(['docker','inspect',name])+' # must report no such container'],
        'staging':'Run stage_vps2.py only after approval; it refuses existing directories and wrong host/resources.',
        'manifest_prepare':shlex.join(prepare),
        'manifest_finalize':'test ! -e '+shlex.quote(str(root/'inputs/manifest.json'))+' && '+shlex.join(['install','-m','0400','-o','10001','-g','10001',
                                      str(root/'prepared/manifest.json'),str(root/'inputs/manifest.json')]),
        'start':shlex.join(start),
        'health':shlex.join(['docker','exec',name,'python','-m','prototypes.graphhopper11.container.healthcheck']),
        'inspect':shlex.join(['docker','inspect',name]),
        'tunnel':shlex.join(['ssh','-N','-L',f'127.0.0.1:18511:{root}/run/service.sock','root@VPS2_HOST']),
        'browser':'http://127.0.0.1:18511/ on the SSH client; username prototype and the separate private secret',
        'stop':shlex.join(['docker','stop','--time=15',name]),
        'remove_container':shlex.join(['docker','rm',name]),
        'rollback_note':'Close the tunnel. Keep staged files and original GH8/graph/source unchanged. No recursive deletion.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image',required=True)
    parser.add_argument('--root',type=Path,default=Path('/opt/voyagr-gh11-app-preview'))
    parser.add_argument('--name',default='voyagr-gh11-app-preview')
    args=parser.parse_args()
    print(json.dumps(proposal(args.image,args.root,args.name),indent=2))


if __name__=='__main__':
    main()
