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
- Background processes started from worktrees (by their unique ports) can be
  started or stopped by coding agents as needed without asking.
- For parallel option exploration, keep worktrees as sibling directories (not
  nested inside the main repo) and use a predictable naming pattern based on
  base port (for example `remdo-7000`, `remdo-7000-wt-optA`).
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
- When presenting multiple options or a list of questions, format them as a
  numbered list.
- The shared test harness treats console warnings/errors as failures; if you
  need temporary instrumentation during debugging, prefer `console.log` or
  `console.info` and remove the statements before finishing a task.

## Checks

- Current timings on this machine (rounded with headroom): `pnpm run lint` about
  5–10s, `pnpm run test:unit` about 10–20s, `pnpm run test:collab` about
  12–25s. If you ever hit the 60s guard, debug the failure (don’t extend); only
  adjust ranges if healthy runs consistently land outside them.
- E2E (Playwright): run `pnpm test:e2e`. In sandboxed environments, accessing
  the local dev server (localhost) may require network escalation; without it,
  Playwright can’t reach the server and will fail to start.

### Scoped check runs (validated 2025-12-09; commands trimmed to tool defaults and pnpm scripts where they behave)

1. Typecheck tests project: `pnpm run typecheck:tests` (uses
   `noEmit`/`incremental` from configs). Ran in ~1.7s.
2. Code lint per path: `pnpm run lint:code -- <path ...>` keeps the scripted
   `eslint` defaults/caching; validated on `tests/unit/smoke.spec.tsx` in ~2s.
3. Markdown lint per file: `pnpm run lint:md:file -- <file ...>` to avoid the
   script’s built-in `docs/**` globs; single-file `AGENTS.md` run completed in
   ~0.6s.
4. Unit test filter via script:
   `pnpm run test:unit <file> -t "<full test name>"` (don’t add an extra `--`,
   or Vitest will ignore the filter). Example:
   `tests/unit/smoke.spec.tsx -t "loads basic outline structure from JSON"` ran
   only that file in ~1.3s.
5. Collab test filter via script:
   `pnpm run test:collab tests/unit/collab/<file> -t "<full test name>"`;
   example
   `smoke.collab.spec.tsx -t "lexical helpers operate in collaboration mode"`
   passed in ~1.4s with collab server auto-started.

### Local agents

1. For every file edit, run the relevant lint check (if one exists for that file
   type). Run `pnpm run lint`, `pnpm run test:unit`, and other relevant checks
   after every non-trivial change. After any behavior change (even small), also
   run `pnpm run lint` plus the most relevant test suite (default to
   `pnpm run test:unit` if unsure). Still use judgment to avoid redundant runs,
   but bias toward keeping these suites green regularly.
2. If you do run a check and it fails because of your code, either fix the
   regression or clearly report the failure before handing the task back.

### Cloud agents

1. Always run these checks before declaring a task done:
   1. `pnpm run lint`
   2. `pnpm run test:unit`
   3. `pnpm run test:collab`

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
