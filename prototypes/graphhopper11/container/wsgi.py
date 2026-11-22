"""Unix-socket-only service entrypoint; credentials come from a private file."""
import json
import os
from pathlib import Path
import re
import stat

from prototypes.graphhopper11.isolated_app import create_app


def load_app():
    secret = Path('/run/secrets/gh11-password')
    info = secret.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o400:
        raise RuntimeError('secret_file_permissions_invalid')
    password = secret.read_text().strip()
    if not re.fullmatch('[0-9a-f]{64}', password):
        raise RuntimeError('secret_file_format_invalid')
    manifest = json.loads(Path('/inputs/manifest.json').read_text())
    return create_app(manifest, password=password, heap_mb=int(os.environ.get('GH11_HEAP_MB', '4096')))


app = load_app()
