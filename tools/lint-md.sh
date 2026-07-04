#!/usr/bin/env sh
# Lint every Markdown file git considers project content — tracked files plus
# new untracked files that are not gitignored — that still exists on disk:
# markdownlint for style, then tools/check-doc-links.ts (links, anchors, prose
# rules) over the same list, so the selection is defined once.
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
# The whole pipeline is NUL-delimited. Untracked paths are arbitrary user-created
# files, so — unlike tracked paths — they may contain spaces or newlines; a
# whitespace-split pipeline would feed split fragments to markdownlint, which
# silently lints nothing for them and lets a misnamed new doc bypass the linter.
set -eu

# Tracked plus new-not-gitignored Markdown, NUL-delimited.
list_md() {
  git ls-files -z '*.md'
  git ls-files -z --others --exclude-standard '*.md'
}

# Keep only paths that still exist on disk; batched (one `sh` for the whole set),
# re-emitting NUL-delimited so spaces/newlines in paths survive to the linters.
# shellcheck disable=SC2016 # $f must expand in the child sh -c, not here.
existing_md() {
  list_md \
    | xargs -0 -r sh -c 'for f do [ -e "$f" ] && printf "%s\0" "$f"; done' _
}

existing_md | xargs -0 -r markdownlint-cli2 --no-globs
existing_md | xargs -0 -r tsx ./tools/check-doc-links.ts
