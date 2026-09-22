#!/usr/bin/env sh
set -eu

if [ -n "$(git status --porcelain=v1 --untracked-files=normal)" ]; then
  echo "Working tree must be clean before deploying test." >&2
  exit 1
fi

git fetch --no-tags origin +refs/heads/deploy-test:refs/remotes/origin/deploy-test
expected="$(git rev-parse refs/remotes/origin/deploy-test)"
git push --force-with-lease="refs/heads/deploy-test:${expected}" origin HEAD:refs/heads/deploy-test

printf 'Test deployment requested for %s: https://test.remdo.com\n' "$(git rev-parse --short HEAD)"
