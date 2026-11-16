#!/usr/bin/env python3
"""Disposable TLS/password/proxy checks for the real personal-access transformer."""
import base64
import importlib.util
from pathlib import Path
import runpy
import secrets
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
docker = runpy.run_path(str(ROOT / 'scripts/test-phone-stage-edge.py'))['docker']
spec = importlib.util.spec_from_file_location('access', ROOT / 'deploy/personal-use/enable-private-access.py')
access = importlib.util.module_from_spec(spec)
spec.loader.exec_module(access)
HOSTS = ('vibevoyager.org', 'vibevoyagr.duckdns.org')


def main():
    name = 'voyagr-personal-edge-' + uuid.uuid4().hex[:12]
    container = None
    with tempfile.TemporaryDirectory(prefix=name) as directory:
        lab = Path(directory)
        lab.chmod(0o755)  # Only synthetic fixtures; private key remains 0600.
        try:
            for image in ('nginx:1.28-alpine', 'python:3.11-slim-bookworm'):
                if docker('image', 'inspect', image, check=False).returncode:
                    docker('pull', image)
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                            '-keyout', str(lab / 'key.pem'), '-out', str(lab / 'cert.pem'),
                            '-days', '1', '-subj', '/CN=' + HOSTS[0], '-addext',
                            'subjectAltName=' + ','.join('DNS:' + h for h in HOSTS)],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            password = secrets.token_urlsafe(24)
            hashed = subprocess.run(['openssl', 'passwd', '-apr1', '-stdin'],
                                    input=password+'\n', text=True, capture_output=True, check=True).stdout.strip()
            (lab / 'password').write_text('owner:' + hashed + '\n')
            (lab / 'password').chmod(0o644)
            (lab / 'access.conf').write_text(access.ACCESS.replace(str(access.PASSWORD), '/lab/password'))
            config = '''server {
    listen 80;
    server_name _;
    location = /.well-known/acme-challenge/fixture { return 200 "domain-proof"; }
    location / { return 301 https://vibevoyager.org$request_uri; }
}
'''
            for host in HOSTS:
                config += '''server {
    listen 443 ssl;
    server_name ''' + host + ''';
    ssl_certificate /lab/cert.pem;
    ssl_certificate_key /lab/key.pem;
    location / {
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:8081;
    }
    location /map/ {
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:8081;
    }
}
'''
            config, count = access.protect(config, '/lab/access.conf')
            assert count == 2
            config += 'server { listen 8081; location / { return 200 "$http_authorization"; } }\n'
            (lab / 'nginx.conf').write_text('worker_processes 1; events {} http { access_log off;\n' + config + '\n}')
            mount = 'type=bind,src=' + str(lab) + ',dst=/lab,readonly'
            docker('run', '--rm', '--network=none', '--mount', mount,
                   '--entrypoint', 'nginx', 'nginx:1.28-alpine', '-t', '-c', '/lab/nginx.conf')
            container = docker('run', '-d', '--name', name, '--network=none',
                               '--label', 'voyagr.personal-edge=' + name, '--mount', mount,
                               '--entrypoint', 'nginx', 'nginx:1.28-alpine',
                               '-c', '/lab/nginx.conf', '-g', 'daemon off;').stdout.strip()
            time.sleep(.5)
            authorization = 'Basic ' + base64.b64encode(('owner:' + password).encode()).decode()
            client = '''import http.client,socket,ssl
context=ssl.create_default_context(cafile='/lab/cert.pem')
def request(host,path,authorization=None):
 c=http.client.HTTPSConnection(host,context=context,timeout=5)
 c.sock=context.wrap_socket(socket.create_connection(('127.0.0.1',443),timeout=5),server_hostname=host)
 c.request('GET',path,headers={'Host':host,**({'Authorization':authorization} if authorization else {})})
 r=c.getresponse();status=r.status;body=r.read();c.close();return status,body
for host in ''' + repr(HOSTS) + ''':
 for path in ('/','/api/config','/service-worker.js','/static/js/app.js','/map/styles/basic/style.json'):
  assert request(host,path)[0]==401, (host,path,'anonymous access')
  status,body=request(host,path,''' + repr(authorization) + ''')
  assert status==200 and body==b'', (host,path,'credential stripping')
  print('PASS: private TLS resource and stripped upstream credentials:',host,path)
 assert request(host,'/','Basic d3Jvbmc6d3Jvbmc=')[0]==401
 print('PASS: incorrect credentials denied:',host)
c=http.client.HTTPConnection('127.0.0.1',80,timeout=5)
c.request('GET','/.well-known/acme-challenge/fixture');r=c.getresponse()
assert r.status==200 and r.read()==b'domain-proof';c.close()
print('PASS: HTTP domain-proof path remains public')
c=http.client.HTTPConnection('127.0.0.1',80,timeout=5)
c.request('GET','/');r=c.getresponse();assert r.status==301 and not r.getheader('WWW-Authenticate');r.read();c.close()
print('PASS: HTTP redirects without a plaintext password challenge')
'''
            result = docker('run', '--rm', '--network', 'container:' + container,
                            '--mount', mount, 'python:3.11-slim-bookworm', 'python', '-c', client, check=False)
            print(result.stdout, end='')
            if result.returncode:
                raise RuntimeError('Private edge validation failed: ' + result.stderr[-1000:])
            print('14 disposable Nginx checks passed; not production verification.')
        finally:
            if container:
                docker('rm', '-f', container, check=False)


if __name__ == '__main__':
    main()
