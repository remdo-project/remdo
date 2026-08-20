#!/usr/bin/env sh
# Source from a launcher; do not exec. Mutates `"$@"`.
#
# `pnpm run <script> -- <args>` forwards a literal `--` (npm consumes it).
# Vitest and Playwright treat that `--` as the end of file filters and run the
# whole suite. Drop the first exact `--` so extra args match npm's delimiter.

_remdo_npm_delim_dropped=
for _remdo_npm_delim_arg in "$@"; do
  shift
  if [ "${_remdo_npm_delim_arg}" = "--" ] && [ -z "${_remdo_npm_delim_dropped}" ]; then
    _remdo_npm_delim_dropped=1
    continue
  fi
  set -- "$@" "${_remdo_npm_delim_arg}"
done
unset _remdo_npm_delim_dropped _remdo_npm_delim_arg
