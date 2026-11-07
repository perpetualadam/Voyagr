#!/usr/bin/env python3
"""Real nginx, isolated full-vhost tests. No production destinations are contacted.

NGINX_BINARY selects an unpacked/test binary; nothing is installed or reloaded.
TLS paths, listeners and upstreams are substituted only in a temporary copy.
"""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Backend(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        missing = 'missing.' in self.path
        body = json.dumps({'path': self.path, 'host': self.headers.get('Host'),
                           'proto': self.headers.get('X-Forwarded-Proto'),
                           'authenticated': self.headers.get('Authorization') == 'Bearer synthetic-test-only'}).encode()
        self.send_response(404 if missing else 200)
        self.send_header('Content-Type', 'application/json')
        if self.path.startswith(('/static/js/', '/static/css/')):
            # Both upstream policies and Expires must disappear, including errors.
            self.send_header('Cache-Control', 'public, max-age=604800, immutable')
            self.send_header('Cache-Control', 'private, max-age=120')
            self.send_header('Expires', 'Wed, 01 Jan 2031 00:00:00 GMT')
        elif self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'private, no-store')
            self.send_header('Set-Cookie', 'synthetic=test-only; Secure; HttpOnly')
        elif self.path in ('/', '/service-worker.js'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        else:
            self.send_header('Cache-Control', 'public, max-age=17')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class CachePolicy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nginx = os.getenv('NGINX_BINARY') or shutil.which('nginx')
        if not cls.nginx:
            raise RuntimeError('Real nginx required; set NGINX_BINARY. Tests are not silently skipped.')
        cls.temp = tempfile.TemporaryDirectory(prefix='voyagr-nginx-policy-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.base = Path(cls.temp.name)
        cls.backend = ThreadingHTTPServer(('127.0.0.1', 0), Backend)
        cls.thread = threading.Thread(target=cls.backend.serve_forever, daemon=True)
        cls.thread.start()
        cls.addClassCleanup(cls.backend.server_close)
        cls.addClassCleanup(lambda: cls.thread.join(timeout=2))
        cls.addClassCleanup(cls.backend.shutdown)
        cls.http, cls.https = free_port(), free_port()
        while cls.https == cls.http:
            cls.https = free_port()
        for folder in ('snippets', 'body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'):
            (cls.base / folder).mkdir()
        shutil.copyfile(ROOT / 'deploy/nginx-security-headers.snippet.conf', cls.base / 'snippets/voyagr-security-headers.conf')
        run = lambda args: subprocess.run(args, check=True, capture_output=True)
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
             '-subj', '/CN=vibevoyager.org', '-addext',
             'subjectAltName=DNS:vibevoyager.org,DNS:www.vibevoyager.org,IP:127.0.0.1',
             '-keyout', str(cls.base / 'key.pem'), '-out', str(cls.base / 'cert.pem')])
        run(['openssl', 'genpkey', '-genparam', '-algorithm', 'DH', '-pkeyopt',
             'group:ffdhe2048', '-out', str(cls.base / 'dh.pem')])
        (cls.base / 'ssl-options.conf').write_text('ssl_protocols TLSv1.2 TLSv1.3;\n')
        site = (ROOT / 'deploy/nginx-vibevoyager.org.conf').read_text()
        site = site.replace('/etc/letsencrypt/live/vibevoyager.org/fullchain.pem', str(cls.base / 'cert.pem'))
        site = site.replace('/etc/letsencrypt/live/vibevoyager.org/privkey.pem', str(cls.base / 'key.pem'))
        site = site.replace('/etc/letsencrypt/options-ssl-nginx.conf', str(cls.base / 'ssl-options.conf'))
        site = site.replace('/etc/letsencrypt/ssl-dhparams.pem', str(cls.base / 'dh.pem'))
        site = site.replace('127.0.0.1:5000', f'127.0.0.1:{cls.backend.server_port}')
        site = site.replace('149.102.131.27:8088', f'127.0.0.1:{cls.backend.server_port}')
        site = re.sub(r'listen (\[::\]:)?(80|443)\b', lambda m: 'listen ' + ('[::1]:' if m[1] else '127.0.0.1:') + str(cls.http if m[2] == '80' else cls.https), site)
        # Competing regex proves the ^~ prefixes actually win nginx selection.
        site = site.replace('    location /static/ {', '    location ~ ^/static/(js|css)/ { return 418; }\n    location /static/ {')
        assert not re.search(r'proxy_pass\s+https?://(?!127\.0\.0\.1:|voyagr_tileserver_gb)', site)
        assert not re.search(r'^\s*server\s+(?!127\.0\.0\.1:)[0-9.]+:', site, re.M)
        top = f'''daemon off;
master_process off;
pid {cls.base}/nginx.pid;
error_log {cls.base}/error.log;
events {{ worker_connections 128; }}
http {{
 access_log off;
 client_body_temp_path {cls.base}/body;
 proxy_temp_path {cls.base}/proxy;
 fastcgi_temp_path {cls.base}/fastcgi;
 uwsgi_temp_path {cls.base}/uwsgi;
 scgi_temp_path {cls.base}/scgi;
 {site}
}}
'''
        cls.config = cls.base / 'nginx.conf'
        cls.config.write_text(top)
        cls.args = [cls.nginx, '-p', str(cls.base) + '/', '-c', str(cls.config)]
        version = subprocess.run([cls.nginx, '-v'], capture_output=True, text=True, check=True)
        print(version.stderr.strip(), flush=True)
        checked = subprocess.run(cls.args + ['-t'], capture_output=True, text=True)
        if checked.returncode:
            raise RuntimeError(checked.stderr)
        print('Full canonical-vhost nginx -t: passed (synthetic TLS/listeners/upstreams)', flush=True)
        dumped = subprocess.run(cls.args + ['-T'], capture_output=True, text=True, check=True)
        assert 'location ^~ /static/js/' in dumped.stdout and 'location ^~ /static/css/' in dumped.stdout
        cls.process = subprocess.Popen(cls.args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        cls.addClassCleanup(cls.stop_nginx)
        cls.context = ssl.create_default_context(cafile=str(cls.base / 'cert.pem'))
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                raise RuntimeError(cls.process.stderr.read().decode())
            try:
                with socket.create_connection(('127.0.0.1', cls.https), timeout=.1):
                    return
            except OSError:
                time.sleep(.02)
        raise RuntimeError('Isolated nginx startup timeout')

    @classmethod
    def stop_nginx(cls):
        cls.process.terminate()
        try:
            cls.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            cls.process.kill()
            cls.process.wait(timeout=3)
        cls.process.stderr.close()

    def request(self, path, host='vibevoyager.org', tls=True, auth=False):
        connection = http.client.HTTPSConnection('127.0.0.1', self.https, context=self.context, timeout=3) if tls else http.client.HTTPConnection('127.0.0.1', self.http, timeout=3)
        try:
            headers = {'Host': host}
            if auth:
                headers['Authorization'] = 'Bearer synthetic-test-only'
            connection.request('GET', path, headers=headers)
            response = connection.getresponse()
            return response.status, response.getheaders(), response.read()
        finally:
            connection.close()

    def policy(self, path, status=200, cache_control='no-cache, must-revalidate'):
        result, headers, body = self.request(path)
        self.assertEqual(result, status)
        values = lambda name: [v for k, v in headers if k.lower() == name.lower()]
        self.assertEqual(values('Cache-Control'), [cache_control])
        self.assertEqual(values('Expires'), [])
        self.assertEqual(values('X-Content-Type-Options'), ['nosniff'])
        self.assertTrue(any('max-age=' in v for v in values('Strict-Transport-Security')))
        payload = json.loads(body)
        self.assertEqual(payload['path'], path)
        self.assertEqual(payload['host'], 'vibevoyager.org')
        self.assertEqual(payload['proto'], 'https')

    def test_javascript_nested_path_and_query(self):
        self.policy('/static/js/modules/navigation/avoidance-integrity.js?v=synthetic-a')

    def test_css_path_and_query(self):
        self.policy('/static/css/voyagr.css?v=synthetic-b')

    def test_query_changes_keep_one_policy(self):
        for query in ('a', 'b'):
            self.policy('/static/js/app/calculate-route-orchestration.js?v=' + query)

    def test_regex_cannot_override_specific_prefixes(self):
        self.policy('/static/js/test.js')
        self.policy('/static/css/test.css')

    def test_error_responses_do_not_reintroduce_upstream_policy(self):
        self.policy('/static/js/missing.js', 404)
        self.policy('/static/css/missing.css', 404)

    def test_unversioned_vendor_and_other_static_assets_revalidate(self):
        # The coherent-release draft deliberately stops treating mutable paths
        # as immutable. Exact headers still exclude upstream cache policy.
        for path in ('/static/images/icon.png', '/static/vendor/maplibre-gl.js'):
            self.policy(path, cache_control='no-cache, max-age=0, must-revalidate')

    def test_service_worker_stays_no_store(self):
        status, headers, _ = self.request('/service-worker.js')
        self.assertEqual(status, 200)
        cc = ', '.join(v for k, v in headers if k.lower() == 'cache-control')
        self.assertIn('no-store', cc)
        self.assertNotIn('immutable', cc)

    def test_html_stays_no_store(self):
        status, headers, _ = self.request('/')
        self.assertEqual(status, 200)
        self.assertTrue(any('no-store' in v for k, v in headers if k.lower() == 'cache-control'))

    def test_authenticated_api_remains_private(self):
        status, headers, body = self.request('/api/me', auth=True)
        self.assertEqual(status, 200)
        self.assertEqual([v for k, v in headers if k.lower() == 'cache-control'], ['private, no-store'])
        self.assertTrue(json.loads(body)['authenticated'])
        self.assertTrue(any(k.lower() == 'set-cookie' for k, _ in headers))

    def test_map_cache_and_prefix_stripping_unchanged(self):
        status, headers, body = self.request('/map/styles/test/style.json')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['path'], '/styles/test/style.json')
        self.assertTrue(any('max-age=86400' in v for k, v in headers if k.lower() == 'cache-control'))

    def test_http_and_www_redirects_remain_canonical(self):
        for tls, host in ((False, 'vibevoyager.org'), (True, 'www.vibevoyager.org')):
            status, headers, _ = self.request('/synthetic-test', host=host, tls=tls)
            self.assertEqual(status, 301)
            self.assertIn(('Location', 'https://vibevoyager.org/synthetic-test'), headers)


if __name__ == '__main__':
    unittest.main(verbosity=2)
