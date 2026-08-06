#!/usr/bin/env bash
#
# The one deploy command.
#
# server/ is a subdirectory of this repo, but Heroku builds from the repo root.
# `git subtree split` rewrites server/ as its own root commit, which is what
# makes the subdirectory disappear without a monorepo buildpack.
#
# Step 3 is why deploys cannot go stale: reza is the deploy source, and
# deploying is what syncs it. It can never be older than the last deploy.
#
# DRY_RUN=1 prints the mutating commands instead of running them.

set -euo pipefail

APP="hr-payroll-server"
HEALTH_URL="https://hr-payroll-server-06ee1f4f0f0f.herokuapp.com/health"
REPO_ROOT="$(git rev-parse --show-toplevel)"

run() {
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "DRY_RUN: $*"
  else
    "$@"
  fi
}

cd "$REPO_ROOT"

# 1. Guard ------------------------------------------------------------------
# Tracked changes only: this script deploys origin/main via `git subtree
# split` and never reads the working tree, so untracked files cannot affect
# what ships. This is a hygiene check that your committed work is what gets
# deployed, not a check on the working tree in general — an untracked
# scratch file (e.g. local editor/tooling state) is noise, not a reason to
# refuse to deploy.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree is dirty. Commit or stash before deploying." >&2
  exit 1
fi

echo "==> Fetching remotes"
git fetch --multiple origin reza --quiet

# 2. Test -------------------------------------------------------------------
echo "==> Running the server test suite"
( cd "$REPO_ROOT/server" && npm test )

# 3. Sync the deploy source -------------------------------------------------
# Deliberately NOT forced: if reza has diverged, fail loudly rather than
# silently discarding whatever is on it.
echo "==> Fast-forwarding reza/main from origin/main"
run git push reza origin/main:refs/heads/main

# 4. Deploy -----------------------------------------------------------------
echo "==> Splitting server/ and pushing to Heroku"
SPLIT_SHA="$(git subtree split --prefix server origin/main)"
echo "    subtree commit: $SPLIT_SHA"
run git push heroku "$SPLIT_SHA:refs/heads/main" --force

# 5. Verify -----------------------------------------------------------------
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN: skipping health check"
  exit 0
fi

echo "==> Waiting for /health"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "$HEALTH_URL" | grep -q '"status":"ok"'; then
    echo "    healthy after ${attempt} attempt(s)"
    heroku releases -a "$APP" -n 1
    exit 0
  fi
  sleep 5
done

echo "error: /health did not report ok within 150s. Check: heroku logs -a $APP --tail" >&2
exit 1
