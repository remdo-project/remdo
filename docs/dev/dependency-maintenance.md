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
  *only* by this gate are never listed below; the gate tracks them, not us. On
  every install pnpm's lockfile verification pass also re-applies the gate to each
  existing lockfile entry (independent of `minimumReleaseAgeStrict`, which only
  governs *resolution*), so even `--frozen-lockfile` in CI hard-fails
  (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`) on a committed entry younger than the
  window — which is what the Dependabot cooldown below works around.
- Build-script approval uses the `allowBuilds` map in `pnpm-workspace.yaml`
  (`onlyBuiltDependencies` was removed in pnpm 11). With `strictDepBuilds: true`
  (enabled), an install fails (exit 1) when any in-tree dep has a build script
  not listed in `allowBuilds`, instead of just warning. When that happens — e.g.
  a refresh pulls in a new build-script dep — add the dep to `allowBuilds` with
  `true` (trusted to build) or `false` (blocked) before the install can proceed.
  Keep `allowBuilds` limited to deps actually in the tree; drop stale entries.

### Dependabot

Dependabot drives two separate signals, on clocks independent of each other and of
the pnpm release-age gate above: version-update PRs as a *staleness nag* (here),
and security alerts as a *vulnerability* alarm (next section). Keep them separate.

Version-update PRs are alerts to run the refresh skill, never merged
per-dependency. The intent shapes the config in `.github/dependabot.yml` (which
carries the exact values and their arithmetic — not repeated here):

- **A grace-period nag, not a merge queue.** The cooldown is set wider than the
  refresh interval, so a repo kept up on cadence clears every mergeable bump
  before it ages into nag range and shows **no** version-update PR at all. An open
  PR is therefore real signal: a version has been available longer than the grace
  window — the refresh is genuinely overdue. (The grace also absorbs the pnpm
  release-age edge from the gate above; that's why it was never as low as a day.)
- **Prompt once overdue.** The cooldown gates *eligibility*; the check schedule
  gates *latency-to-nag*. A short check interval surfaces an overdue version
  quickly instead of holding it for a weekly slot.
- **Self-labelling.** PRs are tagged so an open one reads as "trigger the refresh
  skill," not "merge me."

Tradeoff (accepted): a grace window wider than the refresh interval means that if
the cadence lapses, the first nag arrives that much later than a minimal cooldown
would give. That is fine because routine staleness and security are decoupled —
security never waits on this window (next section).

### Security alerts

Known-vulnerability response is **independent of the version-update grace window
above** and runs on GitHub's native, default mechanism — no custom config, no CI
gate. Repo settings keep **Dependabot alerts** and **Dependabot security updates**
enabled (Settings → Security & analysis): advisories reach us as soon as GitHub
knows, and security-update PRs bypass the cooldown entirely (it gates version
updates only). So the wide grace window delays routine bumps without ever slowing
a fix for a real vulnerability.

The alert and the email are the alarm — not any PR. A Dependabot security-update
PR inherits the same `deps-refresh-trigger` label as a staleness PR (the label is
ecosystem-wide), and that is fine: the refresh skill reconciles every Dependabot
PR regardless of kind, and the real-time alarm has already fired through the alert
channel, so the shared label never masks a vulnerability.

The `audit:security` script remains a local/manual cross-check; it is
intentionally **not** wired into CI — GitHub's alerts are the source of truth, and
a CI audit gate would block unrelated work on an advisory that the refresh skill,
not the failing PR, is responsible for.

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
