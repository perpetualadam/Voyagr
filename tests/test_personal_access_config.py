"""Transformation only: never read or modify host Nginx/password configuration."""
import importlib.util
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('personal_access', ROOT / 'deploy/personal-use/enable-private-access.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

HTTP = '''server {
    listen 80;
    server_name example.test;
    return 301 https://example.test$request_uri;
}
'''
TLS = '''server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name example.test;
    location / {
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:5000;
    }
    location /map/ {
        proxy_pass http://127.0.0.1:8088;
    }
}
'''


def test_gates_every_tls_server_without_touching_http_or_duplicate_ipv6_rules():
    result, count = module.protect(HTTP + TLS + TLS.replace('example.test', 'alias.test'))
    assert result.startswith(HTTP)
    assert count == 2
    assert result.count('include ' + str(module.SNIPPET)) == 2
    assert result.count('proxy_set_header Authorization "";') == 4
    assert result.count('proxy_set_header Host $host;') == 2


@pytest.mark.parametrize('header', ['Authorization', 'authorization', '"Authorization"', "'AUTHORIZATION'"])
def test_replaces_explicit_authorization_forwarding_instead_of_adding_duplicates(header):
    config = TLS.replace('        proxy_set_header Host', '        proxy_set_header ' + header + ' $http_authorization;\n        proxy_set_header Host')
    result, _ = module.protect(config)
    assert '$http_authorization' not in result
    assert result.count('proxy_set_header Authorization "";') == 2


@pytest.mark.parametrize('text', [HTTP, TLS.replace('server {', ' server {'),
                                 TLS.replace('    listen 443 ssl;', '    auth_basic off;\n    listen 443 ssl;'),
                                 HTTP.replace('return 301 https://example.test$request_uri;', 'proxy_pass http://127.0.0.1:5000;'),
                                 TLS.replace('    location /map/ {\n        proxy_pass http://127.0.0.1:8088;\n    }', '    location /map/ { proxy_pass http://127.0.0.1:8088; }')])
def test_ambiguous_or_unsafe_layout_requires_review(text):
    with pytest.raises(ValueError):
        module.protect(text)


def test_refuses_to_reapply_over_existing_private_access():
    result, _ = module.protect(TLS)
    with pytest.raises(ValueError):
        module.protect(result)


@pytest.mark.parametrize('failure', ['validation', 'reload'])
def test_install_failure_restores_both_sites_and_removes_only_new_snippet(tmp_path, monkeypatch, failure):
    import subprocess
    sites = [tmp_path / 'site-one', tmp_path / 'site-two']
    for site in sites:
        site.write_text('original ' + site.name)
    prepared = {site: (site.read_text(), 'private candidate') for site in sites}
    backup = tmp_path / 'backup'
    backup.mkdir(mode=0o700)
    snippet = tmp_path / 'access.conf'
    commands = []
    failed = False
    def run(command, **kwargs):
        nonlocal failed
        commands.append(command)
        should_fail = command == (['nginx', '-t'] if failure == 'validation' else ['systemctl', 'reload', 'nginx'])
        if should_fail and not failed:
            failed = True
            assert all(site.read_text() == 'private candidate' for site in sites)
            raise subprocess.CalledProcessError(1, command)
        return subprocess.CompletedProcess(command, 0)
    monkeypatch.setattr(module.subprocess, 'run', run)
    with pytest.raises(subprocess.CalledProcessError):
        module.install_prepared(prepared, backup, snippet)
    assert not snippet.exists()
    for site in sites:
        assert site.read_text() == 'original ' + site.name
        assert (backup / site.name).read_text() == site.read_text()
    assert commands[-2:] == [['nginx', '-t'], ['systemctl', 'reload', 'nginx']]


def test_other_authorization_forwarding_requires_review():
    with pytest.raises(ValueError):
        module.protect(TLS.replace('proxy_set_header Host $host;', 'proxy_set_header X-Old-Auth $http_authorization;'))


repair = __import__('runpy').run_path(str(ROOT / 'deploy/personal-use/repair-private-prompts.py'))


def test_prompt_repair_accepts_only_existing_gated_tls_servers():
    protected, _ = module.protect(HTTP + TLS)
    assert repair['validate_sites'](protected) == 1
    for invalid in (HTTP + TLS, protected.replace('location /map/', 'auth_request off;\n    location /map/'),
                    protected.replace('location /map/', 'error_page 401 /other;\n    location /map/')):
        with pytest.raises(ValueError):
            repair['validate_sites'](invalid)


@pytest.mark.parametrize('failure', ['validation', 'reload'])
def test_prompt_repair_rolls_back_without_touching_password_or_site_files(tmp_path, monkeypatch, failure):
    import subprocess
    snippet = tmp_path / 'access.conf'
    snippet.write_text(repair['LEGACY'])
    verifier = tmp_path / 'verifier.conf'
    backup = tmp_path / 'backup'
    backup.mkdir()
    failed = False
    def run(command, **kwargs):
        nonlocal failed
        expected = ['nginx', '-t'] if failure == 'validation' else ['systemctl', 'reload', 'nginx']
        if command == expected and not failed:
            failed = True
            raise subprocess.CalledProcessError(1, command)
    monkeypatch.setattr(subprocess, 'run', run)
    with pytest.raises(subprocess.CalledProcessError):
        repair['install_repair'](snippet, verifier, backup)
    assert snippet.read_text() == repair['LEGACY']
    assert not verifier.exists()
    assert (backup / snippet.name).read_text() == repair['LEGACY']


def test_prompt_repair_installs_only_verifier_and_replacement_snippet(tmp_path, monkeypatch):
    import subprocess
    snippet = tmp_path / 'access.conf'
    snippet.write_text(repair['LEGACY'])
    verifier = tmp_path / 'verifier.conf'
    backup = tmp_path / 'backup'
    backup.mkdir()
    calls = []
    monkeypatch.setattr(subprocess, 'run', lambda command, **kwargs: calls.append(command))
    repair['install_repair'](snippet, verifier, backup)
    assert snippet.read_text() == repair['ACCESS']
    assert verifier.read_text() == repair['VERIFIER']
    assert (backup / snippet.name).read_text() == repair['LEGACY']
    assert calls == [['nginx', '-t'], ['systemctl', 'reload', 'nginx']]
