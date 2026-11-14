#!/usr/bin/env python3
"""Real disposable Nginx TLS/auth/proxy checks; no host ports or production data."""
import base64
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
HOST = 'voyagr-phone-test.vibevoyager.org'


def docker(*args, data=None, check=True):
    result = subprocess.run(['docker', *args], input=data, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
    if check and result.returncode:
        raise RuntimeError('Test Docker operation failed: ' + args[0])
    return result


def main():
    name = 'voyagr-phone-edge-' + uuid.uuid4().hex[:12]
    containers = []
    network = None
    with tempfile.TemporaryDirectory(prefix=name) as directory:
        lab = Path(directory)
        lab.chmod(0o755)  # Public fixtures only; private key is separately 0600.
        try:
            for image in ('nginx:1.28-alpine', 'python:3.11-slim-bookworm'):
                if docker('image', 'inspect', image, check=False).returncode:
                    print('Downloading public test image ' + image, flush=True)
                    docker('pull', image)
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                            '-keyout', str(lab / 'key.pem'), '-out', str(lab / 'cert.pem'),
                            '-days', '1', '-subj', '/CN=' + HOST,
                            '-addext', 'subjectAltName=DNS:' + HOST],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            password = secrets.token_urlsafe(24)
            hashed = subprocess.run(['openssl', 'passwd', '-apr1', '-stdin'], input=password + '\n',
                                    text=True, capture_output=True, check=True).stdout.strip()
            (lab / 'test.htpasswd').write_text('lab:' + hashed + '\n')
            (lab / 'test.htpasswd').chmod(0o644)  # Throwaway synthetic credentials only.
            challenge = lab / 'acme/.well-known/acme-challenge'
            challenge.mkdir(parents=True)
            challenge.chmod(0o755)
            (challenge / 'synthetic').write_text('public-domain-proof-fixture')
            for parent in (lab / 'acme', lab / 'acme/.well-known'):
                parent.chmod(0o755)
            (challenge / 'synthetic').chmod(0o644)
            configs = []
            for filename in ('phone-test.http.conf', 'phone-test.https.conf'):
                text = (ROOT / 'deploy/phone-stage' / filename).read_text()
                text = text.replace('/etc/letsencrypt/live/' + HOST + '/fullchain.pem', '/lab/cert.pem')
                text = text.replace('/etc/letsencrypt/live/' + HOST + '/privkey.pem', '/lab/key.pem')
                text = text.replace('/etc/nginx/voyagr-phone-test.htpasswd', '/lab/test.htpasswd')
                text = text.replace('/var/lib/voyagr-phone-acme', '/lab/acme')
                text = text.replace('http://127.0.0.1:18081', 'http://app:5000')
                text = text.replace('http://127.0.0.1:8088', 'http://app:5000')
                configs.append(text)
            (lab / 'nginx.conf').write_text('worker_processes 1; pid /tmp/nginx.pid; events {} http {\n' + '\n'.join(configs) + '\n}')
            network = docker('network', 'create', '--internal', '--label', 'voyagr.phone-edge=' + name, name).stdout.strip()

            app_script = '''from http.server import BaseHTTPRequestHandler,HTTPServer
import json
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  data=json.dumps(dict(path=self.path,auth_present=bool(self.headers.get('Authorization')),ip_present=bool(self.headers.get('X-Forwarded-For') or self.headers.get('X-Real-IP')),scheme=self.headers.get('X-Forwarded-Proto'))).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
HTTPServer(('0.0.0.0',5000),Handler).serve_forever()
'''
            # Create before start so even a failed startup has a recorded cleanup ID.
            (lab / 'app.py').write_text(app_script)
            (lab / 'app.py').chmod(0o644)
            app = docker('create', '--pull=never', '--network', network, '--network-alias', 'app',
                         '--label', 'voyagr.phone-edge=' + name, '--memory', '128m', '--memory-swap', '128m',
                         '--cpus', '1', '--log-driver', 'none', '--mount', 'type=bind,src=' + str(lab) + ',dst=/lab,readonly',
                         'python:3.11-slim-bookworm', 'python', '/lab/app.py').stdout.strip()
            containers.append(app)
            docker('start', app)
            edge = docker('create', '--pull=never', '--network', network,
                          '--label', 'voyagr.phone-edge=' + name, '--memory', '256m', '--memory-swap', '256m',
                          '--cpus', '1', '--log-driver', 'none', '--mount', 'type=bind,src=' + str(lab) + ',dst=/lab,readonly',
                          '--entrypoint', 'nginx', 'nginx:1.28-alpine', '-c', '/lab/nginx.conf', '-g', 'daemon off;').stdout.strip()
            containers.append(edge)
            docker('start', edge)
            passed = 0

            def fetch(path, authenticated=False, scheme='https', extra=()):
                headers = ['Authorization: Basic ' + base64.b64encode(('lab:' + password).encode()).decode()] if authenticated else []
                args = ['exec', edge, 'curl', '--noproxy', '*', '--silent', '--show-error', '--max-time', '5',
                        '--cacert', '/lab/cert.pem', '--resolve', HOST + ':443:127.0.0.1',
                        '--resolve', HOST + ':80:127.0.0.1', '--write-out', '\n%{http_code}']
                for header in [*headers, *extra]:
                    args += ['--header', header]
                result = docker(*args, scheme + '://' + HOST + path, check=False)
                if result.returncode:
                    return 0, ''
                body, status = result.stdout.rsplit('\n', 1)
                return int(status), body

            def check(label, condition):
                nonlocal passed
                if not condition:
                    raise RuntimeError('FAILED: ' + label)
                passed += 1
                print('PASS: ' + label, flush=True)

            for attempt in range(30):
                if fetch('/')[0] == 401:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Disposable HTTPS listener not ready')
            docker('exec', edge, 'nginx', '-t', '-c', '/lab/nginx.conf')
            check('Both staging configuration blocks pass real nginx -t', True)
            for path in ('/', '/service-worker.js', '/static/app.js', '/_voyagr/assets/example', '/map/styles/liberty/style.json', '/fonts/example', '/data/example'):
                check('Anonymous denied: ' + path, fetch(path)[0] == 401)
            check('Wrong password denied', fetch('/', extra=('Authorization: Basic ' + base64.b64encode(b'lab:wrong').decode(),))[0] == 401)
            # Authentication can be ready before the separate upstream process.
            for attempt in range(30):
                if fetch('/', True)[0] == 200:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Disposable application upstream not ready')
            status, body = fetch('/', True, extra=('X-Forwarded-For: untrusted', 'X-Real-IP: untrusted'))
            data = json.loads(body)
            check('Password reaches candidate', status == 200)
            check('Password and user-IP headers never reach upstream', not data['auth_present'] and not data['ip_present'])
            check('HTTPS scheme forwarded', data['scheme'] == 'https')
            status, body = fetch('/map/styles/liberty/style.json', True)
            check('Map prefix stripped for local tile server', status == 200 and json.loads(body)['path'] == '/styles/liberty/style.json')
            for path in ('/__lab__/worker-revision', '/auth/v1/signup', '/rest/v1/rpc/example'):
                check('Fixture/gateway blocked: ' + path, fetch(path, True)[0] == 404)
            for path in ('/api/hazards/report', '/api/hazards/add-camera', '/api/speed-limit/feedback'):
                check('Report/feedback blocked: ' + path, fetch(path, True)[0] == 403)
            check('Plain HTTP redirects without serving app', fetch('/', scheme='http')[0] == 308)
            check('Only public ACME challenge is served over HTTP', fetch('/.well-known/acme-challenge/synthetic', scheme='http') == (200, 'public-domain-proof-fixture'))
            print(str(passed) + ' isolated phone-edge checks passed. No VPS configuration installed.', flush=True)
        finally:
            for identifier in reversed(containers):
                docker('rm', '-f', identifier, check=False)
            if network:
                docker('network', 'rm', network, check=False)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error))
