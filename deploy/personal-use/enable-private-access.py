#!/usr/bin/env python3
"""Protect the two existing Voyagr HTTPS sites; dry-run unless --apply is given."""
import argparse
import grp
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

SITES = (Path('/etc/nginx/sites-enabled/vibevoyager.org'),
         Path('/etc/nginx/sites-enabled/voyagr'))
PASSWORD = Path('/etc/nginx/voyagr-personal.htpasswd')
SNIPPET = Path('/etc/nginx/snippets/voyagr-personal-access.conf')
ACCESS = ('auth_basic "Voyagr private";\n'
          'auth_basic_user_file /etc/nginx/voyagr-personal.htpasswd;\n')


def protect(text, snippet=str(SNIPPET)):
    """Keep HTTP blocks unchanged; gate HTTPS and strip upstream credentials."""
    if re.search(r'(?m)^\s*(auth_basic|satisfy)\s', text) or snippet in text:
        raise ValueError('Existing access rules require manual review; unchanged')
    starts = list(re.finditer(r'(?m)^server\s*\{', text))
    if not starts:
        raise ValueError('Expected top-level server blocks; unchanged')
    result = text[:starts[0].start()]
    count = 0
    for index, start in enumerate(starts):
        block = text[start.start():starts[index+1].start() if index+1 < len(starts) else len(text)]
        code = re.sub(r'(?m)#.*$', '', block)
        if not re.search(r'\blisten\s+[^;\n]*\bssl\b', code):
            if re.search(r'\b(proxy_pass|root|alias|try_files)\s', code):
                raise ValueError('HTTP may serve content; review renewal/redirect paths first')
            result += block
            continue
        names = list(re.finditer(r'(?m)^(\s*)server_name\s+[^;\n]+;[^\n]*\n', block))
        if len(names) != 1:
            raise ValueError('Expected one single-line server_name per HTTPS block')
        name = names[0]
        block = block[:name.end()] + '    include ' + snippet + ';\n' + block[name.end():]
        # Locations with their own proxy_set_header do not inherit server headers.
        block = re.sub(r"(?m)^[ \t]*proxy_set_header\s+['\"]?Authorization['\"]?\s+[^;\n]*;[^\n]*\n", '', block, flags=re.IGNORECASE)
        remaining = re.sub(r'(?m)#.*$', '', block)
        if re.search(r"proxy_set_header\s+['\"]?Authorization", remaining, re.IGNORECASE) or '$http_authorization' in remaining.lower():
            raise ValueError('Other/inline Authorization forwarding requires manual review')
        expected = len(re.findall(r'\bproxy_pass\s', re.sub(r'(?m)#.*$', '', block)))
        block, inserted = re.subn(r'(?m)^([ \t]*)proxy_pass\s',
                                 r'\1proxy_set_header Authorization "";\n\1proxy_pass ', block)
        if expected != inserted:
            raise ValueError('Inline proxy syntax requires manual review; unchanged')
        result += block
        count += 1
    if not count:
        raise ValueError('No HTTPS server found; unchanged')
    return result, count


def install_prepared(prepared, backup, snippet):
    for target in prepared:
        shutil.copy2(target, backup / target.name)
    (backup / 'targets.json').write_text(json.dumps([str(p) for p in prepared]))
    print('Backup:', backup, flush=True)
    created = False
    try:
        with snippet.open('x') as output:
            created = True
            output.write(ACCESS)
        for target, (_, candidate) in prepared.items():
            target.write_text(candidate)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except BaseException:
        for target in prepared:
            shutil.copy2(backup / target.name, target)
        if created:
            snippet.unlink()
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Back up, validate and reload Nginx')
    args = parser.parse_args()
    prepared = {}
    for site in SITES:
        target = site.resolve(strict=True)
        if target.parent != Path('/etc/nginx/sites-available'):
            raise SystemExit('Unexpected site target; unchanged')
        original = target.read_text()
        candidate, count = protect(original)
        prepared[target] = (original, candidate)
        print(target, ':', count, 'HTTPS block(s); HTTP unchanged')
    if not args.apply:
        print('Dry-run only. --apply creates backups, validates, and reloads Nginx.')
        return
    if os.geteuid() != 0:
        raise SystemExit('Apply as root')
    if not PASSWORD.is_file() or SNIPPET.exists():
        raise SystemExit('Password file missing or access snippet already exists; unchanged')
    password_stat = PASSWORD.stat()
    if (password_stat.st_uid != 0 or password_stat.st_gid != grp.getgrnam('www-data').gr_gid
            or password_stat.st_mode & 0o777 != 0o640):
        raise SystemExit('Password file must be root:www-data with mode 640; unchanged')
    subprocess.run(['runuser', '-u', 'www-data', '--', 'test', '-r', str(PASSWORD)], check=True)
    subprocess.run(['nginx', '-t'], check=True)
    backup = Path(tempfile.mkdtemp(prefix='voyagr-personal-backup-', dir='/root'))
    install_prepared(prepared, backup, SNIPPET)
    print('HTTPS protection enabled. Verify anonymous 401 and owner login on both domains.')


if __name__ == '__main__':
    main()
