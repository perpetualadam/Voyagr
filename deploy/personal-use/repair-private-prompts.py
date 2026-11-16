#!/usr/bin/env python3
"""Repair repeated background Basic challenges; dry-run unless --apply is given."""
import argparse
import grp
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

SITES = (Path('/etc/nginx/sites-enabled/vibevoyager.org'), Path('/etc/nginx/sites-enabled/voyagr'))
SNIPPET = Path('/etc/nginx/snippets/voyagr-personal-access.conf')
PASSWORD = Path('/etc/nginx/voyagr-personal.htpasswd')
VERIFIER_FILE = Path('/etc/nginx/conf.d/voyagr-private-auth.conf')
LEGACY = 'auth_basic "Voyagr private";\nauth_basic_user_file /etc/nginx/voyagr-personal.htpasswd;\n'
ACCESS = '''# Only the authentication subrequest may contact the local password verifier.
auth_basic off;
auth_request /__voyagr_private_auth;
location = /__voyagr_private_auth {
    internal;
    auth_request off;
    proxy_pass http://unix:/run/voyagr-private-auth.sock:/;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Authorization $http_authorization;
    proxy_intercept_errors on;
    error_page 401 = @voyagr_private_denied;
}
location @voyagr_private_denied {
    auth_basic off;
    auth_request off;
    if ($http_sec_fetch_mode ~ "^(cors|no-cors|same-origin)$") { return 403; }
    return 401;
}
'''
VERIFIER = '''# Local Nginx password verifier. No TCP listener or application upstream.
server {
    listen unix:/run/voyagr-private-auth.sock;
    server_name localhost;
    access_log off;
    location / {
        auth_basic "Voyagr private";
        auth_basic_user_file /etc/nginx/voyagr-personal.htpasswd;
        root /var/empty;
        try_files /__voyagr_private_auth_ok =204;
    }
}
'''


def validate_sites(text):
    """Refuse location overrides that could bypass the replacement server gate."""
    code = re.sub(r'(?m)#.*$', '', text)
    if re.search(r'\b(auth_basic|auth_request|satisfy|error_page)\s', code):
        raise ValueError('Existing access/error overrides need manual review; unchanged')
    if '__voyagr_private_' in code:
        raise ValueError('Conflicting internal location; unchanged')
    blocks = re.split(r'(?m)^server\s*\{', code)[1:]
    if not blocks:
        raise ValueError('Expected top-level server blocks; unchanged')
    count = 0
    for block in blocks:
        includes = re.findall(r'\binclude\s+([^;]+);', block)
        gated = includes.count(str(SNIPPET))
        if re.search(r'\blisten\s+[^;\n]*\bssl\b', block):
            if gated != 1:
                raise ValueError('Each TLS server must include the existing access snippet once')
            count += 1
        elif gated:
            raise ValueError('HTTP access rules need manual review; unchanged')
    if not count:
        raise ValueError('No protected TLS servers; unchanged')
    return count


def install_repair(snippet, verifier_file, backup):
    shutil.copy2(snippet, backup / snippet.name)
    created = False
    try:
        with verifier_file.open('x') as output:
            created = True
            output.write(VERIFIER)
        snippet.write_text(ACCESS)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except BaseException:
        shutil.copy2(backup / snippet.name, snippet)
        if created:
            verifier_file.unlink()
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if SNIPPET.is_symlink() or SNIPPET.read_text() != LEGACY or VERIFIER_FILE.exists():
        raise SystemExit('Expected the original access snippet and no verifier config; unchanged')
    for site in SITES:
        target = site.resolve(strict=True)
        if target.parent != Path('/etc/nginx/sites-available'):
            raise SystemExit('Unexpected site target; unchanged')
        print(target, ':', validate_sites(target.read_text()), 'protected TLS servers')
    stat = PASSWORD.stat()
    if stat.st_uid != 0 or stat.st_gid != grp.getgrnam('www-data').gr_gid or stat.st_mode & 0o777 != 0o640:
        raise SystemExit('Password file must remain root:www-data mode 640; unchanged')
    version = subprocess.run(['nginx', '-V'], check=True, capture_output=True, text=True)
    if '--with-http_auth_request_module' not in version.stderr + version.stdout:
        raise SystemExit('Nginx auth_request module required; unchanged')
    active = subprocess.run(['nginx', '-T'], check=True, capture_output=True, text=True)
    if not re.search(r'(?m)^\s*include\s+/etc/nginx/conf\.d/\*\.conf;', active.stdout):
        raise SystemExit('Expected /etc/nginx/conf.d/*.conf include; unchanged')
    if Path('/run/voyagr-private-auth.sock').exists():
        raise SystemExit('Verifier socket path already exists; unchanged')
    subprocess.run(['runuser', '-u', 'www-data', '--', 'test', '-r', str(PASSWORD)], check=True)
    subprocess.run(['nginx', '-t'], check=True)
    if not args.apply:
        print('Dry-run only. --apply backs up the snippet, validates and reloads Nginx.')
        return
    if os.geteuid() != 0:
        raise SystemExit('Apply as root')
    backup = Path(tempfile.mkdtemp(prefix='voyagr-prompt-backup-', dir='/root'))
    print('Backup:', backup, flush=True)
    install_repair(SNIPPET, VERIFIER_FILE, backup)
    print('Repair enabled. Verify document 401, background 403 without challenge, and owner 200.')


if __name__ == '__main__':
    main()
