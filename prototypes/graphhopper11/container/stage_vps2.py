"""APPROVAL REQUIRED: create new private public-data snapshots on VPS2; no service starts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import secrets
import shutil

from .plan import service_command

JAR = Path('/opt/voyagr-gh11-prototype-EUPjEU1Q/graphhopper-web-11.1.jar')
GRAPH_ROOT = Path('/opt/voyagr-gh11-uk-GPa4t2W3')
SOURCE = Path('/opt/voyagr-routing-lab/refresh-uk-261113-kdcUne/united-kingdom-261113.osm.pbf')
JAR_HASH = '8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33'
SOURCE_HASH = '20d0e39cb555b457126d47903a084cc9b7b79d49345b601b3c4e1887fda385cf'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def merge_registry(first, second):
    result={'scope':'Registered public UK selected-record experiments only; no navigation authority.',
            'source_pbf_sha256':SOURCE_HASH,'associations':[],'cases':[]}
    sources,cases={},{}
    for fixture in (first,second):
        if fixture.get('source_pbf_sha256') != SOURCE_HASH:
            raise ValueError('registry_source_mismatch')
        for source in fixture['associations']:
            if source['id'] in sources and sources[source['id']] != source:
                raise ValueError('association_identity_collision')
            sources[source['id']]=source
        for case in fixture['cases']:
            if case['id'] in cases:
                raise ValueError('case_identity_collision')
            cases[case['id']]=case
    result['associations']=list(sources.values()); result['cases']=list(cases.values())
    if not 1 <= len(cases) <= 10 or not 1 <= len(sources) <= 10:
        raise ValueError('registry_limit')
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path('/opt/voyagr-gh11-app-preview'))
    args=parser.parse_args(); root=args.root
    service_command('sha256:'+'0'*64,root,'voyagr-gh11-app-preview')  # validate dedicated path
    if os.geteuid()!=0 or platform.node()!='vmi3072171' or platform.machine()!='x86_64':
        raise SystemExit('Refusing wrong user, host or architecture')
    if root.exists() or root.is_symlink():
        raise SystemExit('Refusing existing staging path')
    available=int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
                       if line.startswith('MemAvailable:')))*1024
    if available < 8*1024**3 or shutil.disk_usage('/opt').free < 8*1024**3:
        raise SystemExit('Require at least 8 GiB currently available RAM and disk before staging')
    if digest(JAR)!=JAR_HASH or digest(SOURCE)!=SOURCE_HASH:
        raise SystemExit('Pinned artifact/source checksum mismatch')
    graph=GRAPH_ROOT/'graph'
    if not graph.is_dir() or graph.is_symlink() or any(path.is_symlink() for path in graph.rglob('*')):
        raise SystemExit('Missing graph or graph symlinks refused')
    graph_snapshot={path.relative_to(graph).as_posix():digest(path) for path in graph.rglob('*') if path.is_file()}
    if not graph_snapshot:
        raise SystemExit('Empty graph refused')
    package=Path(__file__).resolve().parents[1]
    registry=merge_registry(json.loads((package/'uk-a61-regression-cases.json').read_text()),
                            json.loads((package/'uk-slip-road-refusal-controls.json').read_text()))
    root.mkdir(mode=0o700)
    try:
        inputs=root/'inputs'; inputs.mkdir(mode=0o700)
        for name in ('run','prepared'):
            path=root/name; path.mkdir(mode=0o700); os.chown(path,10001,10001)
        shutil.copytree(GRAPH_ROOT/'graph',inputs/'graph',copy_function=shutil.copyfile)
        for source,target in ((JAR,'gh.jar'),(SOURCE,'source.osm.pbf'),(GRAPH_ROOT/'config.yml','config.yml')):
            shutil.copyfile(source,inputs/target)
        (inputs/'registry.json').write_text(json.dumps(registry,indent=2))
        for path in [inputs,*inputs.rglob('*')]:
            os.chown(path,10001,10001)
            os.chmod(path,0o500 if path.is_dir() else 0o400)
        fd=os.open(root/'secret',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o400)
        with os.fdopen(fd,'w') as stream:
            stream.write(secrets.token_hex(32)+'\n')
        os.chown(root/'secret',10001,10001)
        copied={path.relative_to(inputs/'graph').as_posix():digest(path)
                for path in (inputs/'graph').rglob('*') if path.is_file()}
        current={path.relative_to(graph).as_posix():digest(path) for path in graph.rglob('*') if path.is_file()}
        if copied!=graph_snapshot or current!=graph_snapshot:
            raise RuntimeError('graph_changed_during_copy')
        if digest(inputs/'gh.jar')!=JAR_HASH or digest(inputs/'source.osm.pbf')!=SOURCE_HASH:
            raise RuntimeError('staged_copy_checksum_mismatch')
    except Exception:
        # Keep the dedicated partial tree for inspection; never delete original data.
        raise SystemExit('Staging failed; inspect only the new staging directory. No service started.')
    print(json.dumps({'status':'STAGED_NO_SERVICE_STARTED','root':str(root),'case_count':len(registry['cases']),
                      'secret_printed':False,'original_graph_modified':False},indent=2))


if __name__=='__main__':
    main()
