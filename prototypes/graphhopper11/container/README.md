# Reviewable isolated VPS2 package — NOT DEPLOYED

## Local result

A generated-graph Docker test passed with the real pinned GH11.1 runtime:
401 anonymous, 200 authenticated viewer/route, 422 blocked route, unchanged graph
hashes, and navigation disabled. The container used UID 10001, a read-only root,
no network, dropped capabilities, one CPU, 1 GiB memory and a 512 MiB Java heap.
It was stopped/removed and its disposable graph and secret were removed.

Tested local **image ID** (not a published registry digest):

```
sha256:e36e4b293f7522d96820f19dd60e1d9c3a3752aeb4f7747397f637e6bcfa3773
```

See `LOCAL_CONTAINER_EVIDENCE.json`. An offline transfer archive was exported in
the shared workspace as `/workspace/gh11-package-artifacts/gh11-app-e36e4b293f75.tar.gz`:

```
SHA256 901795d3bb0a2aa427dd3e11f513178b14aada11890a570953471f8bb5fe8562
```

The archive is not committed, published or uploaded to VPS2. Loading that archive
preserves the tested image ID. A rebuild can have a different ID due to build
metadata; inspect and review it rather than pretending it is the tested image.
No whole-image vulnerability scan or UK capacity benchmark is claimed.

## Reproduce locally

Linux/amd64, Docker and a host Python/pip with verified HTTPS are required:

```sh
python -m prototypes.graphhopper11.container.prepare_wheels
docker build --platform linux/amd64 --network none \
  -f prototypes/graphhopper11/container/Dockerfile \
  -t voyagr-gh11-app:local-test .
python -m prototypes.graphhopper11.container.smoke \
  --image voyagr-gh11-app:local-test --jar /path/to/pinned/graphhopper-web-11.1.jar
```

Both base images are digest-pinned. Every Python dependency and transitive wheel
is version/hash locked; wheels are generated locally and excluded from Git. The
build installation uses no network. TLS verification is never disabled. A strict
Docker build-context allowlist excludes .env, Git metadata, databases and datasets.
The JAR, graph, source and credentials are external mounts, not image layers.

The smoke test creates and deletes only its new generated-data directory and
container. Temporary permission helpers run as root with CHOWN/DAC_OVERRIDE/FOWNER
only on that disposable tree; the actual service drops all capabilities and runs
as UID 10001. The test must be run on a Docker host authorized for local testing.
CI repeats it on a disposable GitHub runner, never against VPS2.

## Proposed VPS2 actions — require approval before execution

Exact rendered commands are in `vps2-proposal.json`. To regenerate a plan without
executing anything:

```sh
python -m prototypes.graphhopper11.container.plan \
  --image sha256:e36e4b293f7522d96820f19dd60e1d9c3a3752aeb4f7747397f637e6bcfa3773
```

Prerequisites: current CI green; actual host `vmi3072171`, Linux/amd64 and rootful
Docker; the approved image ID installed; no existing container or staging path
named `voyagr-gh11-app-preview`; at least 8 GiB available RAM and disk at staging
and again before startup. The host/resource checks have NOT been run on VPS2.
Stop if any prerequisite differs. No remote command is executed by `plan.py`.

After approval, use a pinned export of this package on VPS2. The code directory
can be a new `git archive` extraction; do not switch existing app checkouts or
reuse their .env. The following module is a filesystem mutation, not a dry run:

```sh
# APPROVAL REQUIRED — root on VPS2 only, from the reviewed code export
python3 -m prototypes.graphhopper11.container.stage_vps2
```

It refuses wrong user/host/architecture, insufficient current resources, existing
staging paths, source/JAR checksum mismatches and graph symlinks. It creates only
`/opt/voyagr-gh11-app-preview`, copies about 3 GiB of existing public source/graph
artifacts, verifies graph copies against before/after hashes, and leaves originals
unchanged. No new dataset is downloaded. It merges preserved A61 success and exit
refusal cases without silently overwriting conflicting association IDs.

New staged files are owned by UID 10001 with read-only inputs; the outer directory
is root-private. A separate random 256-bit secret is created as mode 0400, owner
10001, inside the root-private directory. It is never printed, put in Git, placed
in command arguments/environment or stored in the image. Retrieve it only into
your own password manager through your private SSH session; never paste it into
chat or diagnostics. Username is `prototype`. The production owner password and
Nginx configuration are untouched.

Then, still after approval:

1. Run `manifest_prepare` from the rendered plan. It uses the approved image with
   read-only inputs, no network and a separate writable output directory. It does
   not start a WSGI service. It hashes the actual container-visible paths/code.
2. Run `manifest_finalize`, which refuses an existing manifest before installing
   the new private manifest. Check current available RAM and image ID again.
3. Run `start` exactly as rendered. It starts one new container, with no restart
   policy, no TCP ports, no network, read-only inputs/root, 6 GiB memory/no extra
   swap, 4 GiB Java heap, one CPU, 256 PIDs, bounded tmpfs/logs and one WSGI worker.
   These UK resource settings remain unbenchmarked, not guaranteed capacity.
4. Run `health` and `inspect`. Confirm NetworkMode none, UID 10001, ReadonlyRootfs
   true, no published ports, and the expected input/secret read-only mounts.
5. Open the rendered SSH tunnel from a trusted client, replacing `VPS2_HOST` with
   your existing SSH destination, then visit `http://127.0.0.1:18511/` on that
   client. The socket carries HTTP only through SSH; it is not publicly exposed.
   This is not yet a Pixel 6/browser acceptance result.
6. Verify anonymous 401, authenticated viewer, A61 route/alternatives/via/departure
   cases and both exit refusal controls. Every candidate must keep navigation
   unavailable. Capture only statuses, case IDs and version hashes, not passwords.

The Unix socket is `/opt/voyagr-gh11-app-preview/run/service.sock`; only its new
runtime directory is writable outside tmpfs. The app has no upload/history or
arbitrary filesystem-write API. Health is an authenticated versions-endpoint
check; graph integrity is rechecked during every calculation, not by health alone.

## Exact rollback

```sh
docker stop --time=15 voyagr-gh11-app-preview
docker rm voyagr-gh11-app-preview
```

Close the SSH tunnel. Keep staged snapshots for review; do not recursively delete
source data, old graphs, other containers or production files. There is no UK
routing switch, Nginx change, public port, account migration or GH8 restart to undo.
Milestone 2 remains IN PROGRESS until approved VPS2 service/viewer checks pass.
Production migration remains NO-GO.
