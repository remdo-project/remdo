#!/usr/bin/env sh
# Lint every tracked Markdown file that still exists on disk.
#
# File selection is git-tracked (not a filesystem glob) so scratch dirs
# (.agent/, .remember/, .git/) and node_modules/data are excluded for free and
# no new top-level .md can silently escape the linter. Deleted-but-unstaged
# paths are filtered out: `git ls-files` still emits them, but feeding a missing
# path to markdownlint errors, which would break the normal (unstaged) workflow
# on any doc deletion or rename. See docs/todo.md "Markdown lint scope".
#
# Tracked Markdown paths contain no spaces or newlines, so newline-delimited
# iteration is safe here and keeps the script POSIX sh (dash) compatible.
set -eu

files=$(git ls-files '*.md' | while IFS= read -r f; do
  # Trailing `:` keeps the loop body's exit status 0 even when the last path is
  # a deleted-but-unstaged file (the `[ -e ]` test fails); otherwise the `while`
  # subshell would exit non-zero and `set -e` would abort before linting.
  [ -e "$f" ] && printf '%s\n' "$f"
  :
done)

[ -n "$files" ] || exit 0

# shellcheck disable=SC2086 # word-splitting is intentional: one arg per path.
printf '%s\n' "$files" | xargs -r markdownlint-cli2 --no-globs
