"""Content-addressed classic-script releases. No application/user storage is migrated."""
import base64
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading

_LOCK = threading.Lock()
_TAG = re.compile(r'<(script|link)\b[^>]*>', re.I)
_URL = re.compile(r'\b(src|href)="(/static/[^"?]+\.(?:js|css))(?:\?[^\"]*)?"', re.I)
_SCHEMA = 'voyagr-classic-chain-1'


class _PinnedTags(HTMLParser):
    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        url = fields.get('src') if tag == 'script' else fields.get('href') if tag == 'link' and fields.get('rel') == 'stylesheet' else None
        if url and url.startswith('/static/'):
            raise ValueError('Unpinned executable asset in release shell')


def freeze_project(project):
    """Pin the template and its public executable inputs for one worker lifetime."""
    project = Path(project)
    template = (project / 'templates/index.html').read_text(encoding='utf-8')
    paths = {m.group(2) for m in _URL.finditer(template)}
    paths.add('/static/js/modules/ar-navigation.js')
    for suffix in ('*.pv', '*.ppn'):
        paths.update('/' + p.relative_to(project).as_posix() for p in (project / 'static/vendor/picovoice').glob(suffix))
    return {'template': template, 'builder': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'assets': {p: (project / p.lstrip('/')).read_bytes() for p in paths}}


def prepare_html(html, project, store, snapshot=None):
    project, store = Path(project), Path(store)
    tags = []
    for match in _TAG.finditer(html):
        url = _URL.search(match.group())
        if url and (match.group(1).lower() == 'script' or 'stylesheet' in match.group()):
            path = url.group(2)
            source = (project / path.lstrip('/')).resolve()
            source.relative_to((project / 'static').resolve())
            tags.append((match.group(), path, snapshot['assets'][path] if snapshot else source.read_bytes()))
    if not tags:
        raise ValueError('Executable asset list is empty')
    extras = ['/static/js/modules/ar-navigation.js']
    if snapshot:
        extras += sorted(p for p in snapshot['assets'] if p.endswith(('.pv', '.ppn')))
    else:
        for suffix in ('*.pv', '*.ppn'):
            extras += sorted('/' + p.relative_to(project).as_posix() for p in (project / 'static/vendor/picovoice').glob(suffix))
    for path in extras:
        source = project / path.lstrip('/')
        if snapshot or source.is_file():
            tags.append((None, path, snapshot['assets'][path] if snapshot else source.read_bytes()))
    identity = json.dumps([_SCHEMA, snapshot['builder'] if snapshot else hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                           hashlib.sha256(snapshot['template'].encode()).hexdigest() if snapshot else (hashlib.sha256((project / 'templates/index.html').read_bytes()).hexdigest() if (project / 'templates/index.html').exists() else ''), [(p, hashlib.sha256(raw).hexdigest()) for _, p, raw in tags]], separators=(',', ':')).encode()
    release = hashlib.sha256(identity).hexdigest()
    assets, replacements, number = [], {}, 0
    destination = store / release
    with _LOCK:
        store.mkdir(parents=True, exist_ok=True)
        staging = None if destination.is_dir() else Path(tempfile.mkdtemp(prefix='.building-', dir=store))
        try:
            for tag, path, raw in tags:
                is_script = tag is not None and path.endswith('.js')
                if is_script:
                    # Prefix/suffix stay in the classic script's global lexical scope.
                    prefix = f"if(!window.VoyagrAssetRelease||!window.VoyagrAssetRelease.enter('{release}',{number}))throw Error('Voyagr update required: incomplete asset release');\n"
                    suffix = f"\n;window.VoyagrAssetRelease.complete('{release}',{number});\n"
                    # Keep a source-level strict directive effective after instrumentation.
                    strict = bool(re.match(rb'(?:\s|/\*.*?\*/|//[^\n]*\n)*([\'\"])use strict\1\s*;', raw, re.S))
                    raw = (b"'use strict';\n" if strict else b'') + prefix.encode() + raw + suffix.encode()
                    number += 1
                digest = hashlib.sha256(raw).hexdigest()
                name = f'{len(assets):03d}-' + re.sub(r'[^A-Za-z0-9_.-]', '_', Path(path).name)
                url = f'/_voyagr/assets/{release}/{digest}/{name}'
                if staging:
                    (staging / name).write_bytes(raw)
                assets.append({'url': url, 'sha256': digest, 'name': name, 'bytes': len(raw), 'source': path, 'module': tag is None and path.endswith('.js')})
                if tag is None:
                    continue
                sri = 'sha256-' + base64.b64encode(bytes.fromhex(digest)).decode()
                rewritten = _URL.sub(lambda m: f'{m.group(1)}="{url}"', tag, count=1)
                rewritten = rewritten[:-1] + f' integrity="{sri}" crossorigin="anonymous" onerror="window.VoyagrAssetRelease.fail()">'
                replacements[tag] = rewritten
            manifest = {'schema': 1, 'release': release, 'assets': assets}
            if staging:
                (staging / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')), encoding='utf-8')
            if staging:
                os.rename(staging, destination)
            # Another Gunicorn process can publish the same deterministic release.
        except OSError:
            if not destination.is_dir() or (destination / 'manifest.json').read_text() != json.dumps(manifest, separators=(',', ':')):
                raise
        finally:
            if staging and staging.exists():
                shutil.rmtree(staging)
    for old, new in replacements.items():
        html = html.replace(old, new)
    _PinnedTags().feed(html)
    guard = """<script>
(function(){var next=0,failed=false,assets=ASSETS;
function fail(){if(failed)return;failed=true;function show(){if(document.getElementById('voyagr-asset-error'))return;var e=document.createElement('div');e.id='voyagr-asset-error';e.setAttribute('role','alert');e.textContent='Voyagr update is incomplete. Finish any existing navigation in its original tab. Reconnect and reopen this page when safe. Saved data has not been cleared.';document.body.prepend(e);}if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});}
window.VoyagrAssetRelease={assetURL:function(source){var a=assets.find(function(a){return a.source===source;});if(!a)throw Error('Release asset unavailable');return a.url;},loadModule:async function(source){var asset=assets.find(function(a){return a.module&&a.source===source;});if(failed||!asset)throw Error('Verified module unavailable');var response=await fetch(asset.url,{cache:'reload',credentials:'same-origin'});if(!response.ok)throw Error('Verified module unavailable');var bytes=await response.arrayBuffer();var digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(function(x){return x.toString(16).padStart(2,'0');}).join('');if(digest!==asset.sha256)throw Error('Module identity mismatch');var url=URL.createObjectURL(new Blob([bytes],{type:'application/javascript'}));try{return await import(url);}finally{URL.revokeObjectURL(url);}},enter:function(r,i){if(failed||r!==RELEASE||i!==next){fail();return false;}return true;},complete:function(r,i){if(failed||r!==RELEASE||i!==next){fail();return;}next++;},fail:fail};
window.addEventListener('error',function(e){if(e.filename&&e.filename.indexOf('/_voyagr/assets/')>=0)fail();},true);
})();</script>""".replace('RELEASE', json.dumps(release)).replace('ASSETS', json.dumps(assets, separators=(',', ':')))
    metadata = '<script type="application/json" id="voyagr-asset-manifest">' + json.dumps(manifest, separators=(',', ':')) + '</script>'
    return html.replace('<head>', '<head>\n' + guard + metadata, 1), release


def read_asset(store, release, digest, name):
    if not re.fullmatch('[a-f0-9]{64}', release) or not re.fullmatch('[a-f0-9]{64}', digest) or not re.fullmatch(r'\d{3}-[A-Za-z0-9_.-]+\.(js|css|pv|ppn)', name):
        return None
    base = Path(store) / release
    try:
        manifest = json.loads((base / 'manifest.json').read_text())
        if not any(x['name'] == name and x['sha256'] == digest for x in manifest['assets']):
            return None
        raw = (base / name).read_bytes()
        return raw if hashlib.sha256(raw).hexdigest() == digest else None
    except (OSError, ValueError, KeyError, TypeError):
        return None
