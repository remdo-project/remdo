# RemDo Agent Guidelines

## General

RemDo is a collaborative outliner for fast, structured note-taking. It’s
keyboard-first and built on Lexical, emphasizing clarity, composability, and
portability.

Target runtimes and browser support are defined in `docs/contributing.md`. Rely
on those baselines—no legacy browser shims.

AGENTS.md is the only doc you must read at the start of every session. Do one
full pass through the `docs/` folder when you onboard, then revisit only the
sections relevant to your current task—use edits, diffs, and the map below to
decide what matters.

## Documentation Map

Length buckets: Short (<300 words), Medium (300–800), Long (800–1500), Very long
(>1500). Update a doc’s bucket only when it crosses a boundary.
Map format: maintain alphabetical order and wrap entries at ~100 characters per
line (align continuation lines by two spaces).
Keep the map current—refresh summaries/buckets only when they are materially
outdated or a doc’s role materially changes.

- `docs/contributing.md` (Short). Runtime baselines and Git workflow/branch conventions.
- `docs/deployment-single-container.md` (Short). Single-container build/run (Caddy + Y-Sweet),
  `.env` overrides, `PORT`/`COLLAB_SERVER_PORT`, auth, and `DATA_DIR` mapping.
- `docs/environment.md` (Medium). Env setup for dev/test/prod/CI, defaults/overrides, worktrees,
  and blocked port guard.
- `docs/insertion.md` (Short). Caret-mode `Enter` behavior and focus rules.
- `docs/outliner/concepts.md` (Medium). Note model, root note, invariants, adapters, fixtures.
- `docs/outliner/deletion.md` (Medium). Caret/structural delete semantics, merge rules, spacing.
- `docs/outliner/drag-and-drop.md` (Short). Pointer reordering plan (not implemented).
- `docs/outliner/index.md` (Short). Entry point with links; single-source invariants rule.
- `docs/outliner/note-ids.md` (Medium). Note id invariants, normalization, cut-as-move, collab,
  `noteRef`.
- `docs/outliner/note-structure-rules.md` (Long). Structural invariants and indentation
  semantics; indent/outdent rules.
- `docs/outliner/reordering.md` (Short). Level-preserving reordering behavior and constraints.
- `docs/outliner/selection.md` (Long). Cursor/selection ladder and inline/structural rules.
- `docs/todo.md` (Medium). Active work scratchpad; move durable specs into docs;
  tracks the paste-placement e2e follow-up.
Whenever you edit any of these docs, update their summaries/buckets here so the
map stays trustworthy.

## Doc Workflow

1. Before coding, identify the feature area and read the matching sections from
   the map above; do not reread unrelated docs.
2. While working, deep-link to the authoritative doc (e.g.,
   `docs/contributing.md#git-workflow`) in discussions or PRs so others know the
   source of truth.
3. After modifying documentation, refresh this map so the pointers stay current.
   Do not add update-tracking sections to AGENTS.md.

### Documentation invariants

1. **Single source per topic.** Define each behavior once in the doc best suited
   to it; eliminate duplicates and replace any extra copies with pointers.
2. **Top-down linking.** Prefer links from higher-level docs (index, concepts)
   into detailed docs (selection, indent/outdent, reordering); same-level links
   only when they add clear value.
3. **Self-contained set.** Keep required context inside this doc set; avoid
   external references.
4. **Coherence checks.** When editing a doc, ensure the change aligns with
   existing resolutions and update related docs/maps if needed.
5. **Intentional gaps.** Stubs/placeholders are acceptable in dev—mark status
   clearly when a section is partial.
6. **[Future] markers.** Sections or bullets tagged `[Future]` are exploratory;
   do not design, code, or test against them until they are promoted into the
   main spec.

### Core ideas

- **Structure-first.** Notes form a hierarchical tree; every note is addressable
  and linkable.
- **Collaboration by default.** Real-time multi-user editing with clear
  attribution.
- **Small, composable primitives.** Predictable behaviors, minimal UI,
  consistent commands.

### What is a note?

Refer to `docs/outliner/concepts.md` for the canonical definition of a note,
including its invariants, structure, and adapter contracts. In short, notes are
the addressable, typed units that form RemDo’s ordered tree; the concepts
document captures the full model.

## Safety & Process

- Do not change any code before explicitly asked for it.
  - If asked how something can be solved, answer the question and suggest a
    solution, but do not change any code.
  - If asked to propose code, provide the snippet and wait for explicit approval
    before making changes.
- Background processes started from the root workdir are controlled by the
  developer; do not start or kill them.
- Background processes started from worktrees (by their unique ports) can be
  started or stopped by coding agents as needed without asking.
- Never stage or commit unless the user literally says “commit” (or explicitly
  agrees to your request to commit). When in doubt, assume the answer is “no”.
- The project is in dev phase, do not introduce temporary shims when refactoring
  or fixing bugs; aim for permanent solutions.
- Always focus on the simplest and shortest possible implementation that meets
  the request. Propose any additional guards, optimisations, checks, etc. as
  follow ups instead of adding them by default.
- If you spot any tradeoffs or pros and cons of alternative solutions always ask
  first before implementing one.
- Don't assume that the request is always clear, if in doubt ask before
  proceeding.
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

1. Run `pnpm run lint`, `pnpm run test:unit`, and other relevant checks after
   every non-trivial change and whenever it seems useful (e.g., debugging a
   failing test). Still use judgment to avoid redundant runs, but bias toward
   keeping these suites green regularly.
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
