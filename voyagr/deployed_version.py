"""
Which commit the running server was deployed from.

Production is a git checkout on a VPS that an operator updates by hand
(``deploy/deploy-pull.sh``); GitHub Actions only prints a reminder. Nothing in the
app reported the running commit, so "is this fix live yet?" could not be answered
without SSH access — and a merged, green-CI change looks identical to one that was
never pulled.

Read straight from ``.git`` rather than shelling out to git: no subprocess on a
request path, and it still works on hosts without a git binary.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

#: Repo root (this file lives in voyagr/, so one level up).
DEFAULT_REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SHORT_COMMIT_LENGTH = 8
HEADS_REF_PREFIX = 'refs/heads/'


def _read_text(path: str) -> Optional[str]:
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            return handle.read().strip()
    except OSError:
        return None


def _resolve_packed_ref(git_dir: str, ref: str) -> Optional[str]:
    """Find ``ref`` in .git/packed-refs, used once loose refs have been packed."""
    packed = _read_text(os.path.join(git_dir, 'packed-refs'))
    if not packed:
        return None
    for line in packed.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('^'):
            continue
        parts = line.split(' ', 1)
        if len(parts) == 2 and parts[1].strip() == ref:
            return parts[0].strip()
    return None


def read_deployed_version(repo_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolve the checked-out commit and branch.

    Returns ``commit``/``branch``/``short_commit``, each None when it cannot be
    determined (a source tarball rather than a checkout, or an unreadable .git).
    """
    root = repo_dir or DEFAULT_REPO_DIR
    git_dir = os.path.join(root, '.git')

    # A worktree or submodule has a .git *file* pointing at the real directory.
    if os.path.isfile(git_dir):
        pointer = _read_text(git_dir) or ''
        if pointer.startswith('gitdir:'):
            target = pointer.split('gitdir:', 1)[1].strip()
            git_dir = target if os.path.isabs(target) else os.path.join(root, target)

    head = _read_text(os.path.join(git_dir, 'HEAD'))
    if not head:
        return {'commit': None, 'branch': None, 'short_commit': None}

    if head.startswith('ref:'):
        ref = head.split('ref:', 1)[1].strip()
        # Strip only the refs/heads/ prefix: branch names contain slashes of their own.
        branch = ref[len(HEADS_REF_PREFIX):] if ref.startswith(HEADS_REF_PREFIX) else ref
        commit = _read_text(os.path.join(git_dir, *ref.split('/')))
        if not commit:
            commit = _resolve_packed_ref(git_dir, ref)
    else:
        # Detached HEAD holds the commit itself.
        branch = None
        commit = head

    if commit and not _looks_like_commit(commit):
        commit = None

    return {
        'commit': commit,
        'branch': branch,
        'short_commit': commit[:SHORT_COMMIT_LENGTH] if commit else None,
    }


def _looks_like_commit(value: str) -> bool:
    return len(value) == 40 and all(c in '0123456789abcdef' for c in value.lower())


def read_service_worker_cache_version(repo_dir: Optional[str] = None) -> Optional[str]:
    """The service worker's CACHE_VERSION, so a stale worker is visible too."""
    root = repo_dir or DEFAULT_REPO_DIR
    source = _read_text(os.path.join(root, 'service-worker.js'))
    if not source:
        return None
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith('const CACHE_VERSION'):
            _, _, rhs = stripped.partition('=')
            return rhs.strip().rstrip(';').strip('\'"') or None
    return None


def build_deployed_version_payload(repo_dir: Optional[str] = None) -> Dict[str, Any]:
    """`/api/deployed-version` body: enough to compare against origin/main at a glance."""
    version = read_deployed_version(repo_dir)
    return {
        'success': True,
        'commit': version['commit'],
        'short_commit': version['short_commit'],
        'branch': version['branch'],
        'service_worker_cache_version': read_service_worker_cache_version(repo_dir),
    }
