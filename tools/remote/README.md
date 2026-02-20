# Remote Script Contract

Scripts in `tools/remote/` are intended to run on plain hosts without project
toolchain setup.

Guidelines:

- Keep them ultra-minimal and self-contained.
- Do not add Node/pnpm/TypeScript or other project-runtime dependencies.
- Prefer baseline shell and common host tools only (for example `ssh`, `scp`,
  `tar`, `git`).
- Use `PROD_APP_ADDR` as the default remote location source (`user@host:/path`).
- For extra backup hosts, define `PROD_APP_ADDR_<suffix>` vars; `make-backup.sh` auto-discovers them and uses only alphanumeric suffixes.
- Use fail-fast required vars (`${VAR:?...}`) instead of defensive guard code.
- Do not source broader repo env/tooling scripts; keep remote wiring local to
  this directory.
