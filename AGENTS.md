# Development workflow

For every development task in perpetualadam/Voyagr:

1. Fetch the latest main and create a dedicated feature branch. Preserve existing work; never overwrite unrelated changes or use destructive Git operations.
2. Preserve working functionality and add focused regression tests for modified behavior.
3. Run relevant Python and JavaScript tests. Investigate failures; do not weaken assertions or security checks to force a passing build. Resolve conflicts safely and rerun affected tests.
4. Commit all intended task changes, push the feature branch, and create a non-draft pull request targeting main.
5. Check repository merge rules and required checks. Enable GitHub auto-merge with squash only when supported, authorized, and gated by required status checks. Never bypass branch protection, required reviews or checks, use an administrator bypass, or force a direct merge.
6. Let GitHub perform the merge only after its required checks pass. Do not merge changes that expose secrets, weaken authentication, or introduce known security vulnerabilities.
7. Report the pull request URL, test results, merge/auto-merge status and unresolved issues. If permissions, network policy or repository configuration block a step, report the precise blocker instead of claiming success.

Never deploy to production automatically or modify production configuration/data as part of this workflow.

## Local validation

Use the existing isolated checkout; do not create additional worktrees unless explicitly requested. Python web dependencies are in .venv; JavaScript uses Node 24 and the existing npm lockfile.

Run the backend file list in the "Run Python behaviour tests" step of .github/workflows/ci.yml with .venv/bin/python -m pytest -q. The full tests directory also contains desktop/Kivy, custom-router and live-service tests; distinguish blocked/unrun suites from the passing web selection.

Run npm run lint:tests and npm run test:ci -- --maxWorkers=2. Session-policy SQL validation uses scripts/test-dashcam-session-sql.py with isolated pgserver/psycopg2 tools, as declared by its CI job. It must never target a production DSN.
