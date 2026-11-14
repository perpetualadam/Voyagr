"""Disposable full candidate, without production files or startup monitors."""
import os
from pathlib import Path
import shutil

for proxy in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'):
    os.environ.pop(proxy, None)
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'
destination = Path('/tmp/browser-candidate')
shutil.copytree('/source', destination)
os.chdir(destination)
if not (destination / 'voyagr_web.py').is_file():
    raise RuntimeError('Candidate entry point missing from isolated source copy')
# Import instead of __main__ to avoid starting routing monitors. Actual page,
# registration, immutable assets, service worker and API handlers are retained.
import sys
sys.path.insert(0, str(destination))
import importlib
# PYTHONPATH names this directory before it exists at interpreter startup.
# Recheck its contents now that the disposable copy has been created.
importlib.invalidate_caches()
from voyagr_web import app


@app.post('/__lab__/worker-revision')
def worker_revision():
    # Test-only endpoint in the unreachable-from-host fixture server. Change the
    # worker bytes to exercise actual browser update staging, not a fake event.
    with (destination / 'service-worker.js').open('a') as worker:
        worker.write('\n// Disposable browser-lab worker revision.\n')
    return {'success': True}


app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
