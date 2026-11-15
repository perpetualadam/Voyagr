#!/usr/bin/env python3
"""Disposable HTTP integration lab. No production DSNs, keys, ports or volumes.

Requires Python 3 and Docker CLI/daemon. Downloads fixed-tag public images and
builds a test dependency image; all service traffic then stays on an internal
network. Always removes only resources whose IDs this process created.
"""
import argparse
import json
import re
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
IMAGES = {
    'db': 'postgres:15-bookworm',
    'auth': 'supabase/gotrue:v2.158.1',
    'rest': 'postgrest/postgrest:v12.2.3',
    'gateway': 'kong:2.8.1',
    'python': 'python:3.11-slim-bookworm',
}


def docker(*args, data=None, check=True):
    result = subprocess.run(['docker', *args], input=data, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=600)
    if check and result.returncode:
        # Never relay provider/container output: it can contain synthetic tokens.
        if args[0] in {'create', 'start'}:
            # Environment is supplied through a private file, never CLI secrets.
            raise RuntimeError('Container creation failed: ' + result.stderr[-1200:])
        raise RuntimeError('Docker operation failed: ' + args[0])
    return result


def main(ca_file=None, browser=False):
    if not shutil.which('docker'):
        raise RuntimeError('Docker CLI required')
    name = 'voyagr-privacy-http-' + uuid.uuid4().hex[:12]
    containers = []
    network = None
    image = None
    browser_image = None
    with tempfile.TemporaryDirectory(prefix=name + '-') as directory:
        temporary = Path(directory)
        temporary.chmod(0o700)
        try:
            print('Preparing isolated lab ' + name, flush=True)
            images = list(IMAGES.values())
            browser_base = 'mcr.microsoft.com/playwright:v1.58.2-noble'
            install_chromium = ''
            if browser:
                if docker('image', 'inspect', browser_base, check=False).returncode:
                    browser_base = 'node:24-bookworm-slim'
                    install_chromium = ('RUN apt-get update && apt-get install -y --no-install-recommends chromium '
                                        '&& rm -rf /var/lib/apt/lists/*\nENV CHROMIUM_BINARY=/usr/bin/chromium\n')
                images.append(browser_base)
            for source in images:
                if docker('image', 'inspect', source, check=False).returncode:
                    print('Downloading ' + source, flush=True)
                    docker('pull', source)
            build = temporary / 'build'
            build.mkdir()
            shutil.copyfile(ROOT / 'requirements-web.txt', build / 'requirements.txt')
            trust = ''
            if ca_file:
                shutil.copyfile(ca_file, build / 'test-ca.pem')
                trust = 'COPY test-ca.pem /tmp/test-ca.pem\nENV PIP_CERT=/tmp/test-ca.pem\n'
            (build / 'Dockerfile').write_text(
                'FROM ' + IMAGES['python'] + '\n'
                + trust +
                'COPY requirements.txt /tmp/requirements.txt\n'
                'RUN pip install --no-cache-dir -r /tmp/requirements.txt\n'
                'LABEL voyagr.privacy-lab="' + name + '"\n')
            print('Building test dependencies (no application secrets in context)', flush=True)
            built = docker('build', '--progress=plain', '--iidfile', str(temporary / 'image-id'), str(build), check=False)
            if built.returncode:
                # This context contains only public requirements and a Dockerfile.
                print(built.stderr[-5000:], flush=True)
                raise RuntimeError('Public test dependency build failed')
            image = (temporary / 'image-id').read_text().strip()
            network = docker('network', 'create', '--internal',
                             '--label', 'voyagr.privacy-lab=' + name, name).stdout.strip()
            secret = secrets.token_hex(32)
            password = secrets.token_hex(24)

            def start(service, source, env=None, mounts=(), command=(), memory='384m', network_mode=None):
                # Docker/build environments can inject host proxies. Internal
                # service traffic must never go through an external proxy.
                env = {**dict.fromkeys(('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
                                       'http_proxy', 'https_proxy', 'all_proxy'), ''),
                       'NO_PROXY': '*', 'no_proxy': '*', **(env or {})}
                envfile = temporary / (service + '.env')
                envfile.write_text(''.join(k + '=' + v + '\n' for k, v in env.items()))
                envfile.chmod(0o600)
                args = ['create', '--pull=never', '--network', network_mode or network,
                        '--name', name + '-' + service,
                        '--label', 'voyagr.privacy-lab=' + name,
                        '--memory', memory, '--memory-swap', memory, '--cpus', '1',
                        '--log-driver', 'local', '--log-opt', 'max-size=1m',
                        '--log-opt', 'max-file=2', '--env-file', str(envfile)]
                if not network_mode:
                    args += ['--network-alias', service]
                for mount in mounts:
                    args += ['--mount', mount]
                args += [source, *command]
                identifier = docker(*args).stdout.strip()
                containers.append(identifier)
                docker('start', identifier)
                return identifier

            db = start('db', IMAGES['db'], {
                'POSTGRES_PASSWORD': password, 'POSTGRES_DB': 'privacy_lab',
            }, mounts=('type=tmpfs,dst=/var/lib/postgresql/data,tmpfs-size=536870912',),
                       memory='768m')
            for attempt in range(90):
                if docker('exec', db, 'pg_isready', '-U', 'postgres', '-d', 'privacy_lab', check=False).returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Disposable database readiness timed out')

            def sql(statement):
                return docker('exec', '-i', db, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                              '-U', 'postgres', '-d', 'privacy_lab', data=statement).stdout.strip()

            sql("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; "
                "CREATE ROLE service_role NOLOGIN BYPASSRLS; "
                "CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '" + password + "'; "
                "GRANT anon,authenticated,service_role TO authenticator; "
                "CREATE SCHEMA auth; CREATE EXTENSION IF NOT EXISTS pgcrypto; "
                "GRANT USAGE ON SCHEMA public,auth TO authenticated,anon; "
                "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS "
                "$$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$; "
                "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS "
                "$$ SELECT (auth.jwt()->>'sub')::uuid $$;")
            start('auth', IMAGES['auth'], {
                'GOTRUE_API_HOST': '0.0.0.0', 'GOTRUE_API_PORT': '9999',
                'API_EXTERNAL_URL': 'http://gateway:8000/auth/v1',
                'GOTRUE_SITE_URL': 'http://app:5000',
                'GOTRUE_DB_DRIVER': 'postgres',
                'GOTRUE_DB_NAMESPACE': 'auth',
                # Privileged fixture DB connection only, never a production template.
                'GOTRUE_DB_DATABASE_URL': 'postgres://postgres:' + password + '@db:5432/privacy_lab?sslmode=disable&search_path=auth',
                'GOTRUE_JWT_SECRET': secret, 'GOTRUE_JWT_EXP': '3600',
                'GOTRUE_JWT_AUD': 'authenticated',
                'GOTRUE_JWT_DEFAULT_GROUP_NAME': 'authenticated',
                'GOTRUE_DISABLE_SIGNUP': 'false', 'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true',
                'GOTRUE_MAILER_AUTOCONFIRM': 'true',
                'GOTRUE_RATE_LIMIT_EMAIL_SENT': '100',
            })
            # Wait for the real GoTrue schema migration, not a synthetic sessions table.
            for attempt in range(90):
                if sql("SELECT to_regclass('auth.sessions') IS NOT NULL;") == 't':
                    break
                time.sleep(1)
            else:
                raise RuntimeError('GoTrue auth.sessions migration timed out')
            for filename in ('01-voyagr-schema.sql', '02-dashcam-session-check.sql', '03-privacy-consent.sql'):
                sql((ROOT / 'supabase-selfhost/volumes/db/init' / filename).read_text())
            start('rest', IMAGES['rest'], {
                'PGRST_DB_URI': 'postgres://authenticator:' + password + '@db:5432/privacy_lab',
                'PGRST_DB_SCHEMAS': 'public', 'PGRST_DB_ANON_ROLE': 'anon',
                'PGRST_JWT_SECRET': secret, 'PGRST_DB_USE_LEGACY_GUCS': 'false',
            })
            # Kong runs unprivileged; copy its non-secret config into a traversable
            # directory rather than exposing the private temporary credentials folder.
            kong_config = temporary / 'kong'
            kong_config.mkdir(mode=0o755)
            kong_config.chmod(0o755)
            shutil.copyfile(ROOT / 'supabase-selfhost/volumes/kong/kong.yml', kong_config / 'kong.yml')
            (kong_config / 'kong.yml').chmod(0o644)
            start('gateway', IMAGES['gateway'], {
                'KONG_DATABASE': 'off', 'KONG_DECLARATIVE_CONFIG': '/lab/kong.yml',
                'KONG_DNS_ORDER': 'LAST,A,CNAME',
                'KONG_PROXY_ACCESS_LOG': 'off', 'KONG_ADMIN_ACCESS_LOG': 'off',
                'KONG_ADMIN_LISTEN': 'off',
                'KONG_NGINX_WORKER_PROCESSES': '1', 'KONG_MEM_CACHE_SIZE': '32m',
            }, mounts=('type=bind,src=' + str(kong_config) + ',dst=/lab,readonly',))
            # Copy tracked code/public assets only. Never mount an operator checkout containing
            # .env files, existing databases, recordings, browser storage or Git keys.
            source = temporary / 'source'
            source.mkdir()
            tracked = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z'],
                                     capture_output=True, check=True).stdout.decode().split('\0')
            for relative in filter(None, tracked):
                path = Path(relative)
                allowed = (path.parts[0] in {'templates', 'static'} or
                           path.suffix == '.py' and (len(path.parts) == 1 or path.parts[0] == 'voyagr') or
                           relative in {'service-worker.js', 'manifest.json', 'camera_areas.geojson'})
                if not allowed:
                    continue
                original = ROOT / path
                if original.is_symlink() or not original.resolve().is_relative_to(ROOT):
                    raise RuntimeError('Unexpected symlink in lab source')
                target = source / path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(original, target)
            shutil.copytree(HERE, source / 'scripts/privacy-http-lab',
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            app = start('app', image, {
                'PYTHONPATH': '/source', 'PYTHONDONTWRITEBYTECODE': '1',
                'SUPABASE_URL': 'http://gateway:8000', 'SUPABASE_JWT_SECRET': secret,
                'SUPABASE_ANON_KEY': 'synthetic-lab-key', 'PYTHON_DOTENV_DISABLED': '1',
                'API_KEYS': secrets.token_hex(24),
            }, mounts=(
                'type=bind,src=' + str(source) + ',dst=/source,readonly',
            ), command=('python', '/source/scripts/privacy-http-lab/app.py'), memory='512m')
            print('Testing real GoTrue → Kong → PostgREST → Flask boundaries', flush=True)
            # Each probe is a genuine HTTP request. Only synthetic fixture seeding uses SQL.
            result = docker('exec', app, 'python', '/source/scripts/privacy-http-lab/probe.py',
                            'signup', check=False)
            if result.returncode:
                print(result.stdout, end='', flush=True)
                for identifier in containers:
                    state = docker('inspect', '--format', '{{.State.Status}} exit={{.State.ExitCode}}', identifier, check=False)
                    print('Lab container: ' + state.stdout.strip(), flush=True)
                    output = docker('logs', '--tail', '12', identifier, check=False)
                    diagnostic = output.stdout + output.stderr
                    diagnostic = diagnostic.replace(secret, '[JWT secret]').replace(password, '[DB secret]')
                    diagnostic = re.sub(r'eyJ[\w-]+\.[\w-]+\.[\w-]+', '[token]', diagnostic)
                    diagnostic = re.sub(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', '[test UUID]', diagnostic)
                    diagnostic = re.sub(r'[\w.+-]+@[\w.-]+', '[test email]', diagnostic)
                    print(diagnostic[-2000:], flush=True)
                raise RuntimeError('HTTP signup/readiness probe failed')
            users = json.loads(result.stdout)
            for number, user in enumerate(users, 1):
                owner = str(uuid.UUID(user['id']))
                sql("INSERT INTO public.voyagr_profile_snapshots(user_id,profile_id,snapshot) VALUES "
                    "('" + owner + "','lab','{\"marker\":\"owner-" + str(number) + "\"}');")
                if number == 1:
                    sql("INSERT INTO public.voyagr_profile_snapshots(user_id,profile_id,snapshot) VALUES "
                        "('" + owner + "','retained','{\"marker\":\"revocation-fixture\"}');")
            result = docker('exec', app, 'python', '/source/scripts/privacy-http-lab/probe.py',
                            'verify', check=False)
            # Probe deliberately prints named checks only, never request/response contents.
            print(result.stdout, end='', flush=True)
            if result.returncode:
                raise RuntimeError('HTTP privacy integration checks failed')
            print('PASS: isolated HTTP integration. Not production or phone verification.', flush=True)
            if browser:
                browser_build = temporary / 'browser-build'
                browser_build.mkdir()
                browser_trust = ''
                if ca_file:
                    shutil.copyfile(ca_file, browser_build / 'test-ca.pem')
                    browser_trust = 'COPY test-ca.pem /tmp/test-ca.pem\nENV NODE_EXTRA_CA_CERTS=/tmp/test-ca.pem\n'
                (browser_build / 'Dockerfile').write_text(
                    'FROM ' + browser_base + '\n' + browser_trust + install_chromium +
                    'RUN npm install --prefix /opt/browser-runner --ignore-scripts --no-audit --no-fund playwright@1.58.2\n'
                    'ENV NODE_PATH=/opt/browser-runner/node_modules\n'
                    'LABEL voyagr.privacy-lab="' + name + '"\n')
                print('Preparing isolated Chromium dependencies', flush=True)
                browser_build_result = docker('build', '--progress=plain', '--iidfile',
                                             str(temporary / 'browser-image-id'), str(browser_build), check=False)
                if browser_build_result.returncode:
                    print(browser_build_result.stderr[-3000:], flush=True)
                    raise RuntimeError('Public browser dependency build failed')
                browser_image = (temporary / 'browser-image-id').read_text().strip()
                if not (source / 'voyagr_web.py').is_file():
                    raise RuntimeError('Candidate entry point missing before container mount')
                candidate = start('candidate', image, {
                    'PYTHONPATH': '/tmp/browser-candidate', 'PYTHONDONTWRITEBYTECODE': '1',
                    'SUPABASE_URL': 'http://gateway:8000', 'SUPABASE_JWT_SECRET': secret,
                    'SUPABASE_ANON_KEY': 'synthetic-lab-key', 'API_KEYS': secrets.token_hex(24),
                    'PYTHON_DOTENV_DISABLED': '1',
                }, mounts=('type=bind,src=' + str(source) + ',dst=/source,readonly',),
                    command=('python', '/source/scripts/privacy-http-lab/full_app.py'), memory='1g')
                for attempt in range(60):
                    if docker('inspect', '--format', '{{.State.Running}}', candidate).stdout.strip() != 'true':
                        output = docker('logs', '--tail', '18', candidate, check=False)
                        diagnostic = (output.stdout + output.stderr).replace(secret, '[JWT secret]').replace(password, '[DB secret]')
                        print(diagnostic[-3000:], flush=True)
                        raise RuntimeError('Full candidate startup failed')
                    response = docker('exec', candidate, 'python', '-c',
                                      "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:5000/',timeout=3).status)", check=False)
                    if response.returncode == 0:
                        break
                    time.sleep(1)
                else:
                    raise RuntimeError('Full candidate readiness timeout')
                chromium = start('browser', browser_image, {
                    'NODE_PATH': '/opt/browser-runner/node_modules',
                }, mounts=('type=bind,src=' + str(source) + ',dst=/source,readonly',),
                    command=('node', '/source/scripts/privacy-http-lab/browser.cjs'),
                    memory='1536m', network_mode='container:' + candidate)
                result = docker('wait', chromium)
                output = docker('logs', chromium, check=False)
                print(output.stdout, end='', flush=True)
                if result.stdout.strip() != '0':
                    diagnostic = output.stderr.replace(secret, '[JWT secret]').replace(password, '[DB secret]')
                    diagnostic = re.sub(r'eyJ[\w-]+\.[\w-]+\.[\w-]+', '[token]', diagnostic)
                    diagnostic = re.sub(r'[\w.+-]+@[\w.-]+', '[test email]', diagnostic)
                    print(diagnostic[-2000:], flush=True)
                    raise RuntimeError('Candidate browser privacy checks failed')
        finally:
            for identifier in reversed(containers):
                docker('rm', '-f', identifier, check=False)
            if network:
                docker('network', 'rm', network, check=False)
            if image:
                # Keep downloaded base images, remove only the lab-built dependency image.
                docker('image', 'rm', image, check=False)
            if browser_image:
                docker('image', 'rm', browser_image, check=False)
            print('Lab cleanup attempted; production services were never selected.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ca-file', type=Path, help='Optional trusted public CA bundle for dependency download')
    parser.add_argument('--browser', action='store_true', help='Also test the full candidate in isolated Chromium')
    args = parser.parse_args()
    try:
        main(args.ca_file, args.browser)
    except KeyboardInterrupt:
        raise SystemExit('Interrupted; lab cleanup attempted.')
    except Exception as error:
        raise SystemExit('Lab stopped: ' + str(error))
