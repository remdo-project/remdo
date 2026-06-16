# RemDo Agent Guidelines

## General

RemDo is a collaborative outliner for fast, structured note-taking. It’s
keyboard-first and built on Lexical, emphasizing clarity, composability, and
portability.

Target runtimes and browser support are defined in `docs/contributing.md`. Rely
on those baselines—no legacy browser shims.

AGENTS.md is the only doc you must read at the start of every session. Do one
full pass through the `docs/` folder when you onboard, then revisit only the
sections relevant to your current task. For documentation navigation and
navigation (the map), use `docs/index.md`; for the doc workflow and invariants,
see `docs/contributing.md#documentation`.
When editing docs, keep external references in a final `References` section.

## Safety & Process

- Background processes started from the root workdir are controlled by the
  developer; do not start or kill them.
- Exception: agents may start the shared DevTools Chromium endpoint on
  `127.0.0.1:9222` when it is down; leave it running.
- Do not stop or clean up the shared DevTools endpoint on `127.0.0.1:9222`
  unless the user asks, or troubleshooting requires a restart.
- Background processes started from worktrees (by their unique ports) can be
  started or stopped by coding agents as needed without asking.
- Git worktrees are the standard tool for isolating parallel work (separate
  `data/`, separate `PORT_BASE` block) without colliding on the shared working
  dir; a fresh worktree gets a clean empty `data/` automatically. Keep them
  outside the main repo tree. The coordinating agent fully owns the worktrees it
  creates for the current working dir — create, modify, and drop them freely as
  useful. Their on-disk location and naming are machine-local agent config, not
  repo content (a Claude Code session, for example, reads its own pool location
  and naming scheme from `~/.claude`).
- When to isolate: the coordinating agent works in the shared working dir, and
  read-only parallel helpers (search, analysis, edits, typecheck) share it too.
  Any parallel agent that does non-read-only work (tests, tools, anything that
  writes `data/`) runs in its own disposable worktree — never sharing the working
  dir. Setup is ~3s and a full unit run there matches the main dir, so isolation
  is nearly free; keeping it the only mode means no shared-`data/` collisions to
  guard against.
- Assign a unique `PORT_BASE` per worktree (for example `5100`, `5200`) to
  avoid collisions across dev servers, tests, and collab services.
- Treat each repo/worktree as owning a 100-port block starting at its assigned
  `PORT_BASE`. Do not run commands with `PORT_BASE` outside the current
  repo/worktree's block unless the user explicitly approves.
- If a check/debugging run appears to hit a stale RemDo service, identify the
  process, command, port, and port block first. If it belongs to the current
  workdir/worktree and blocks the task, restart it instead of adding workaround
  wiring; report the restart and any follow-up tooling/HMR recommendation.
- If you cannot log in as a stable dev user (Alice/Bob), run
  `pnpm run dev:data-reset` to (re)provision them and seed the fixture
  documents. It is idempotent and dev-only; either of us may run it, but not
  while the other is mid-task. Pass `--fresh` to reset the seeded fixture docs.
- `.agent/` is per-working-dir agent scratch (plans, mid-task notes). It is
  gitignored and excluded from linting, so write throwaway working files here
  rather than under versioned paths like `docs/`. It is per-WD (not shared across
  worktrees); cross-WD agent state belongs under `~/.claude/` instead.
- Never stage or commit unless the user literally says “commit” (or explicitly
  agrees to your request to commit). When in doubt, assume the answer is “no”.
  Exception: the `feature-flow` skill is self-authorizing — within a
  `/feature-flow` run, commits on the confirmed task branch are allowed per that
  skill’s permission model (still never pushing without an explicit ask).
- The Git index may be used by the developer as private review bookkeeping.
  Treat staged vs unstaged state as semantically invisible: it does not mark
  files as done, final, approved, protected, or out of scope. When the agreed
  task requires it, freely edit files regardless of whether their current
  changes are staged, unstaged, or partially staged.
- Never stage, unstage, stash, reset, or otherwise rewrite index state unless
  explicitly asked. Do not mention that you preserved staging state unless the
  user asks about Git state or an operation cannot proceed without changing it.
- The project is in dev phase. Prefer the simplest permanent implementation
  that meets the request. Do not add speculative abstractions, feature flags,
  compatibility shims, or defensive guards unless the task, specs, or supported
  runtime baseline require them; propose optional hardening as follow-ups.
- For bug fixes, reproduce the issue with a focused test, command, or browser
  check when practical, then verify the fix with that focused reproducer plus
  the required final checks below.
- The `docs/todo.md` summary in `docs/index.md` should remain as-is and should
  not be automatically updated like other doc entries.
- When writing tests against known fixtures, assume the fixture shape; avoid
  defensive assertions about expected structure unless the test is explicitly
  about validation.
- In fixture-based tests, do not add runtime guards (for example
  `if (!node) throw`) for known fixture nodes; use non-null assertions instead.
- If you spot any tradeoffs or pros and cons of alternative solutions always ask
  first before implementing one.
- Don't assume that the request is always clear, if in doubt ask before
  proceeding.
- Investigate before asking. If a question could be answered by reading the code,
  config, build, or docs in reasonable time, gather that data first and ask only
  the genuine residual doubt (or proceed if none remains). Don't surface a choice
  the codebase already settles. This refines—does not weaken—the "ask first on
  tradeoffs / when in doubt" rules above: ask about real forks the code can't
  answer, not ones you haven't yet checked.
- Land artifacts for review; don't paste them. When something is meant for the
  user to review—a doc, a spec, a config, a code change—edit it in the working
  dir (uncommitted by default) and point at it, rather than reproducing it as a
  long block in the chat. The user reviews changes directly in the repo with
  their own tooling and should not read the same content twice. Treat editing as
  cheap; the expensive thing is the user re-reading. "Ready for your review"
  means the artifact is in the WD, not that it has been described well enough in
  chat to approve. Chat carries decisions, questions, and pointers; the repo
  carries content. This does not silence genuine questions or confirmations for
  real forks—it changes the default from describe-then-maybe-write to
  write-then-review.
- For UI behavior or rendering questions, always use Chrome DevTools to verify the
  live page before concluding on layout, interaction, or accessibility.
- Use DevTools snapshots, screenshots, and in-page inspection as the primary source
  of truth when checking “what this looks like” or confirming browser-side
  changes.
- DevTools bootstrap (Playwright Chromium):
  1. Health check:
     `curl -fsS http://127.0.0.1:9222/json/version >/dev/null`
  2. If down, run:

     ```sh
     mkdir -p /tmp/pw-devtools-home/.config /tmp/pw-devtools-home/.cache /tmp/pw-cdp-profile
     setsid env HOME=/tmp/pw-devtools-home \
       XDG_CONFIG_HOME=/tmp/pw-devtools-home/.config \
       XDG_CACHE_HOME=/tmp/pw-devtools-home/.cache \
       /home/piotr/.cache/ms-playwright/chromium-1208/chrome-linux/chrome \
       --headless=new --no-sandbox --disable-dev-shm-usage --disable-breakpad \
       --disable-crash-reporter --disable-background-networking \
       --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
       --user-data-dir=/tmp/pw-cdp-profile --no-first-run \
       --no-default-browser-check about:blank >/tmp/pw-cdp.log 2>&1 < /dev/null &
     ```

  3. If this flow fails or drifts, report it.
- When presenting multiple options or a list of questions, format them as a
  numbered list.
- The shared test harness treats console warnings/errors as failures; if you
  need temporary instrumentation during debugging, prefer `console.log` or
  `console.info` and remove the statements before finishing a task.
- Code review: silently drop any finding already flagged in `docs/todo.md`
  (match only when the entry names the same file, symbol, or specific behavior,
  not just a topical overlap); add one tail line `Suppressed N finding(s)
  already tracked in docs/todo.md` (omit when `N` is 0). Forward this rule to any
  finder/reviewer subagents you spawn.

## Agent mode

Determine agent mode in this order:

1. If `CODEX_CI=1`, use Cloud agents rules.
2. Else if `CI=true`, use Cloud agents rules.
3. Otherwise, use Local agents rules.

## Checks

- Current timings on this machine (rounded with headroom): `pnpm run lint` about
  8–18s, `pnpm run test:unit:full` about 12–25s, `pnpm run test:collab:full`
  about 22–35s. Recent healthy runs measured roughly: lint 8.3s, unit full
  15.2s, collab full 31.8s. The default `test:unit` and `test:collab` scripts
  are Git-aware changed-only shortcuts, so their runtime varies with the
  working tree. If you ever hit the timeout guard, debug the failure (don’t
  extend); only adjust ranges if healthy runs consistently land outside them.
- E2E (Playwright): run `pnpm test:e2e`. In sandboxed environments, accessing
  the local dev server (localhost) may require network escalation; without it,
  Playwright can’t reach the server and will fail to start.
  The dev bootstrap (`dev-init.sh`) does not install browsers by default, so
  resolve them on demand before running `test:e2e:*`:
  1. If `PLAYWRIGHT_BROWSERS_PATH` is set and already contains the required
     chromium build, use it as-is—do nothing.
  2. Otherwise, check the standard cache locations (`/opt/playwright-browsers`,
     `$HOME/.cache/ms-playwright`); if a build is present, point
     `PLAYWRIGHT_BROWSERS_PATH` at it.
  3. If no browser is found anywhere, install into a writable cache. If
     `PLAYWRIGHT_BROWSERS_PATH` points at a read-only or missing-cache location
     such as `/opt/playwright-browsers`, unset it or override it with
     `$HOME/.cache/ms-playwright` before running
     `pnpm exec playwright install chromium`; then export
     `PLAYWRIGHT_BROWSERS_PATH` to the cache that received the install.

  `playwright install` is idempotent, so re-running it when a browser already
  exists is a cheap no-op.

### Scoped check runs (prefer these during iteration)

1. Typecheck project: `pnpm run typecheck` (uses incremental cache from
   `tsconfig.json`). Healthy run is usually ~1.8s in this workspace.
2. Code lint per path: `pnpm run lint:code -- <path ...>` keeps scripted
   `eslint` caching and is usually quick on a small set of files.
3. Code lint for changed JS/TS files from git diff:
   `git diff --name-only --diff-filter=ACMRTUXB HEAD | rg '\.(c|m)?(j|t)sx?$' | xargs -r pnpm run lint:code --`
4. CSS lint for changed files from git diff:
   `git diff --name-only --diff-filter=ACMRTUXB HEAD | rg '\.css$' | xargs -r pnpm exec stylelint`
5. CSS syntax validation for changed files:
   `git diff --name-only --diff-filter=ACMRTUXB HEAD | rg '\.css$' | xargs -r -n1 pnpm exec csstree-validator`
   (`csstree-validator` accepts one file per invocation).
6. Markdown lint per file: `pnpm run lint:md:file -- <file ...>`.
7. Full unit test filter via script:
   `pnpm run test:unit:full <file> -t "<full test name>"` (don’t add an extra
   `--`, or Vitest will ignore the filter). Example:
   `tests/unit/smoke.spec.tsx -t "loads basic outline structure from JSON"` ran
   only that file in ~1.3s.
8. Full collab test filter via script:
   `pnpm run test:collab:full tests/unit/collab/<file> -t "<full test name>"`;
   example
   `smoke.collab.spec.tsx -t "lexical helpers operate in collaboration mode"`
   passed in ~1.4s with collab server auto-started.

### Local agents

1. During iteration, prefer scoped checks from the section above on the files
   you touched instead of repeatedly running full suites. The default
   `test:unit` and `test:collab` scripts are also suitable as changed-only
   smoke checks during iteration.
2. Before handing the current task back:
   1. Always run `pnpm run lint`.
   2. Run `pnpm run test:unit` for behavior/code changes (skip for docs-only or
      purely cosmetic style changes).
   3. Run `pnpm run test:collab` only when collaboration risk exists.
      Collaboration risk includes changes under
      `src/editor/plugins/collaboration/**`, `tests/unit/collab/**`, or editor
      state/synchronization/persistence paths that can affect shared behavior.
   4. Do not run `pnpm run test:unit:full` or `pnpm run test:collab:full`
      unless the user explicitly asks, or debugging requires full-suite
      confirmation.
3. If a check fails because of your changes, either fix the regression or
   clearly report the failure before handing the task back.

### Cloud agents

1. Always run these checks before declaring a task done:
   1. `pnpm run lint`
   2. `pnpm run test:unit:full`
   3. `pnpm run test:collab:full`

   These suites must pass at the end of every cloud-task unless the user
   explicitly asks to skip a specific suite.

2. When any of the required checks fail, fix the issue (or state why it cannot
   be fixed) before finishing the task. Do not return success while a mandated
   check is red.

## Tools

- `pnpm run dev:init` is the one-shot workspace bootstrap. It runs
  `pnpm i --frozen-lockfile`. Use it when you clone RemDo for the first time—or
  if you blow away `node_modules`. Skip it in workspaces that are already
  initialized so you don’t clobber local caches.
- To inspect Lexical sources, read `node_modules/lexical/src/` — the pinned
  package ships readable TypeScript source (not just bundles).
- Use the GitHub CLI (gh) to check repository and Actions status on GitHub.
