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
governance (map, workflow, invariants, and update rules), use `docs/index.md`.

## Safety & Process

- Background processes started from the root workdir are controlled by the
  developer; do not start or kill them.
- Exception: agents may start the shared DevTools Chromium endpoint on
  `127.0.0.1:9222` when it is down; leave it running.
- Do not stop or clean up the shared DevTools endpoint on `127.0.0.1:9222`
  unless the user asks, or troubleshooting requires a restart.
- Background processes started from worktrees (by their unique ports) can be
  started or stopped by coding agents as needed without asking.
- For parallel option exploration, keep worktrees outside the main repo tree
  under a dedicated sibling directory `../remdo-wts/` and use a predictable
  naming pattern based on base port (for example
  `../remdo-wts/remdo-7000`, `../remdo-wts/remdo-7000-wt-optA`).
- Assign a unique `PORT` per worktree (for example base `PORT + 100`, `+200`)
  to avoid collisions across dev servers, tests, and collab services.
- Never stage or commit unless the user literally says “commit” (or explicitly
  agrees to your request to commit). When in doubt, assume the answer is “no”.
- The project is in dev phase, do not introduce temporary shims when refactoring
  or fixing bugs; aim for permanent solutions.
- Always focus on the simplest and shortest possible implementation that meets
  the request. Propose any additional guards, optimisations, checks, etc. as
  follow ups instead of adding them by default.
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
  `pnpm i --frozen-lockfile`, fetches the pinned Lexical sources, and hydrates
  `data/.vendor/lexical`. Use it when you clone RemDo for the first time—or if
  you blow away `node_modules`/`data/.vendor`. Skip it in workspaces that are
  already initialized so you don’t clobber local caches.
- `data/.vendor/lexical` is our read-only mirror of the upstream Lexical repo at
  the exact version declared in `package.json`. **Always inspect Lexical sources
  here first** (avoid `node_modules`, which may contain minified bundles). Never
  edit files in `.vendor`; rerun `pnpm run dev:init` if you need a fresh copy.
- Use the GitHub CLI (gh) to check repository and Actions status on GitHub.
