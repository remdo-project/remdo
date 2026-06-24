# Dependency Maintenance

Used during dependency refresh work. This file holds only **standing policy** —
durable rules and self-healing mechanisms that change when a *mechanism* changes,
not when a version moves.

Individual workarounds are **not** listed here. They live as `TODO:`/`FIXME:`
comments at the code site (see `docs/contributing.md#code-comments`), each
stating the one-line probe that proves it obsolete (delete the shim / flip the
flag / run the suite). The comment is the tracker; don't duplicate it here. The
dependency-refresh skill scans those markers, runs the probe, and removes the
workaround when it passes — so a workaround with no runnable probe doesn't belong
in a comment either; make it a test assertion or a code-site guard that fails
loudly instead.

## Standing policy

### pnpm

- `minimumReleaseAge` defaults to `1440` (24h): newly published packages are not
  resolved until they are a day old (supply-chain buffer). We keep the default.
  The refresh `pnpm update --latest` naturally holds too-fresh bumps and applies
  each one automatically on the next run once it ages in — so packages held back
  *only* by this gate are never listed below; the gate tracks them, not us.
- Build-script approval uses the `allowBuilds` map in `pnpm-workspace.yaml`
  (`onlyBuiltDependencies` was removed in pnpm 11). With `strictDepBuilds: true`
  (enabled), an install fails (exit 1) when any in-tree dep has a build script
  not listed in `allowBuilds`, instead of just warning. When that happens — e.g.
  a refresh pulls in a new build-script dep — add the dep to `allowBuilds` with
  `true` (trusted to build) or `false` (blocked) before the install can proceed.
  Keep `allowBuilds` limited to deps actually in the tree; drop stale entries.

### Node / Docker base lag

Node may sit one or more minors behind the latest LTS. The `node:<minor>-alpine`
Docker base lags the nodejs.org release by a few days, and `docker/Dockerfile`
builds `FROM node:<minor>-alpine`, so pinning the newest LTS before its image
publishes breaks the docker e2e build. `bump-node-pins.sh` resolves the newest
LTS minor whose alpine image actually exists and auto-advances once the newer
image publishes — so do **not** hand-bump the Node pins to a newer LTS; that just
reintroduces the broken `FROM`.

### `vite-plugin-pwa` peer `workbox-build`

Keep the unmet `workbox-build@^7.4.1` peer warning rather than adding
`workbox-build` directly: it pulls
`@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1`, whose provenance trust
downgrade fails the workspace pnpm trust policy. Revisit only if the peer can be
satisfied without a trust downgrade (a mechanism change, not a version bump).
