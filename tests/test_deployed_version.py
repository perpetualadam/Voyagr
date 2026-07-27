"""
Tests for reporting the commit the running server was deployed from.

Production is a hand-updated checkout, so a merged change and an undeployed one are
indistinguishable from the outside without this. The reader must therefore cope with
the shapes a real .git directory takes rather than only the common one.
"""

import os

import pytest

from voyagr.deployed_version import (
    build_deployed_version_payload,
    read_deployed_version,
    read_service_worker_cache_version,
)

COMMIT = 'b1acfadaa8201bfb7bd0bcd26c5db13972373e8a'
OTHER_COMMIT = '1dda2e72fc9d7df3a9ab5b7b28e8dade972c7dc6'


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        handle.write(text)


def test_reads_branch_and_commit_from_a_loose_ref(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    _write(os.path.join(root, '.git', 'refs', 'heads', 'main'), COMMIT + '\n')

    version = read_deployed_version(root)

    assert version['commit'] == COMMIT
    assert version['branch'] == 'main'
    assert version['short_commit'] == COMMIT[:8]


def test_falls_back_to_packed_refs(tmp_path):
    """A long-lived checkout packs its refs, leaving no loose ref file to read."""
    root = str(tmp_path)
    _write(os.path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    _write(os.path.join(root, '.git', 'packed-refs'),
           '# pack-refs with: peeled fully-peeled sorted\n'
           f'{OTHER_COMMIT} refs/heads/other\n'
           f'{COMMIT} refs/heads/main\n'
           f'^{OTHER_COMMIT}\n')

    version = read_deployed_version(root)

    assert version['commit'] == COMMIT
    assert version['branch'] == 'main'


def test_keeps_slashes_in_the_branch_name(tmp_path):
    """Deploy branches like cursor/fix-thing must not be reported as just "fix-thing"."""
    root = str(tmp_path)
    _write(os.path.join(root, '.git', 'HEAD'), 'ref: refs/heads/cursor/fix-thing-7ba7\n')
    _write(os.path.join(root, '.git', 'refs', 'heads', 'cursor', 'fix-thing-7ba7'), COMMIT + '\n')

    version = read_deployed_version(root)

    assert version['branch'] == 'cursor/fix-thing-7ba7'
    assert version['commit'] == COMMIT


def test_reads_a_detached_head(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, '.git', 'HEAD'), COMMIT + '\n')

    version = read_deployed_version(root)

    assert version['commit'] == COMMIT
    assert version['branch'] is None


def test_follows_a_gitdir_pointer_file(tmp_path):
    """Worktrees and submodules replace .git with a file pointing elsewhere."""
    root = tmp_path / 'checkout'
    real_git = tmp_path / 'real-git'
    _write(str(root / '.git'), f'gitdir: {real_git}\n')
    _write(str(real_git / 'HEAD'), 'ref: refs/heads/main\n')
    _write(str(real_git / 'refs' / 'heads' / 'main'), COMMIT + '\n')

    assert read_deployed_version(str(root))['commit'] == COMMIT


def test_reports_nothing_when_there_is_no_checkout(tmp_path):
    version = read_deployed_version(str(tmp_path))

    assert version == {'commit': None, 'branch': None, 'short_commit': None}


def test_rejects_a_ref_that_is_not_a_commit(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    _write(os.path.join(root, '.git', 'refs', 'heads', 'main'), 'not-a-sha\n')

    assert read_deployed_version(root)['commit'] is None


def test_reads_the_service_worker_cache_version(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, 'service-worker.js'),
           "// header\nconst CACHE_VERSION = 'v42';\nconst OTHER = 1;\n")

    assert read_service_worker_cache_version(root) == 'v42'


def test_service_worker_cache_version_is_none_without_the_file(tmp_path):
    assert read_service_worker_cache_version(str(tmp_path)) is None


def test_payload_reports_this_repos_own_checkout():
    """Against the real repo, so the wiring is exercised, not just tmp fixtures."""
    payload = build_deployed_version_payload()

    assert payload['success'] is True
    assert payload['commit'] and len(payload['commit']) == 40
    assert payload['short_commit'] == payload['commit'][:8]
    assert payload['service_worker_cache_version']


def test_endpoint_reports_the_running_commit():
    import voyagr_web as vw

    response = vw.app.test_client().get('/api/deployed-version')

    assert response.status_code == 200
    body = response.get_json()
    assert body['success'] is True
    assert body['commit'] == build_deployed_version_payload()['commit']
    # Must never be answered from a cache, or it would report a past deploy.
    assert 'no-store' in response.headers.get('Cache-Control', '')
