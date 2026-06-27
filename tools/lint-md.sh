#!/usr/bin/env sh
# Lint every Markdown file git considers project content — tracked files plus
# new untracked files that are not gitignored — that still exists on disk.
#
# Selection is git-based, not a filesystem glob: `--exclude-standard` honours
# every .gitignore (root and nested), so scratch dirs are excluded for free
# (.agent/ via root .gitignore, .remember/ via its own .gitignore, .git/ always,
# plus node_modules/data) with no hand-maintained ignore list. Including
# untracked-but-not-ignored files means a brand-new .md is linted before it is
# staged, so a new doc cannot silently escape the linter.
#
# Deleted-but-unstaged paths are filtered out: `git ls-files` still emits them,
# but feeding a missing path to markdownlint errors, which would break the normal
# (unstaged) workflow on any doc deletion or rename.
#
# Markdown paths in this repo contain no spaces or newlines, so newline-delimited
# iteration is safe here and keeps the script POSIX sh (dash) compatible.
set -eu

list_md() {
  git ls-files '*.md'                      # tracked
  git ls-files --others --exclude-standard '*.md'  # new, not gitignored
}

files=$(list_md | while IFS= read -r f; do
  # Trailing `:` keeps the loop body's exit status 0 even when the last path is
  # a deleted-but-unstaged file (the `[ -e ]` test fails); otherwise the `while`
  # subshell would exit non-zero and `set -e` would abort before linting.
  [ -e "$f" ] && printf '%s\n' "$f"
  :
done)

[ -n "$files" ] || exit 0

# shellcheck disable=SC2086 # word-splitting is intentional: one arg per path.
printf '%s\n' "$files" | xargs -r markdownlint-cli2 --no-globs
