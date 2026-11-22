"""Operator-only snapshot preparation. No server, imports or service changes."""
import argparse
import json
import os
from pathlib import Path

from .isolated_app import build_manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("jar", "graph", "config", "registry", "source", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    manifest = build_manifest(**{name: getattr(args, name) for name in ("jar", "graph", "config", "registry", "source")})
    if args.output.resolve().is_relative_to(Path(manifest["paths"]["graph"])):
        raise ValueError("manifest_must_be_outside_graph")
    # A new private file only; never overwrite a graph, credential or old manifest.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(manifest, stream, indent=2)
        stream.write("\n")
    print(json.dumps({key: manifest[key] for key in ("graph_version", "source_version", "policy_version")}, indent=2))


if __name__ == "__main__":
    main()
