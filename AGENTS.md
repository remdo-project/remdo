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

- `docs/contributing.md` (~272 words). Runtime baselines, Git workflow, and
  branch conventions—check before touching tooling or process.
- `docs/outliner/index.md` (~197 words). Single entry point for outlining docs
  with links to model, selection, indent/outdent, insertion, and reordering specs.
- `docs/outliner/concepts.md` (~485 words). Canonical definition of notes,
  invariants, and adapters—skim when working on data modeling or serialization.
- `docs/outliner/note-structure-rules.md` (~1.01k words). Structural invariants
  and indent/outdent semantics—consult when editing tree transforms or note
  mutations.
- `docs/outliner/selection.md` (~1.45k words). Cursor/selection semantics for
  the editor runtime—reference for UX or Lexical selection work.
- `docs/outliner/reordering.md` (~99 words). Level-preserving reordering
  behavior and placement invariants.
- `docs/outliner/drag-and-drop.md` (~100 words). Pointer-based reordering (drag
  and drop) – not supported yet; future plan lives there.
- `docs/insertion.md` (~251 words). Caret-mode `Enter` behavior
  (start/middle/end) and focus rules; mid-note splits keep pre-caret text in
  place and move post-caret text to a sibling below; end-of-note inserts a
  child only when children already exist, otherwise a sibling.
- `docs/todo.md` (~0.91k words). Project roadmap plus outstanding design
  questions—review when planning new features; now includes the Render
  deployment plan.
- `docs/deployment-single-container.md` (~269 words). How to build and run the
  single-container image (Caddy + Y-Sweet) and its env knobs, including basic
  auth requirements.

Whenever you edit any of these docs, update their summaries/word counts here so
the map stays trustworthy.

## Doc Workflow

1. Before coding, identify the feature area and read the matching sections from
   the map above; do not reread unrelated docs.
2. While working, deep-link to the authoritative doc (e.g.,
   `docs/contributing.md#git-workflow`) in discussions or PRs so others know the
   source of truth.
3. After modifying documentation, refresh this map and note significant changes
   in AGENTS.md so future sessions have the latest pointers.

### Documentation invariants

1. **Single source per topic.** Define each behavior once in the doc best suited
   to it; eliminate duplicates and replace any extra copies with pointers.
2. **Top-down linking.** Prefer links from higher-level docs (index, concepts)
   into detailed docs (selection, indent/outdent, reordering); same-level links
   only when they add clear value.
3. **Self-contained set.** Keep required context inside this doc set; avoid external references.
4. **Coherence checks.** When editing a doc, ensure the change aligns with
   existing resolutions and update related docs/maps if needed.
5. **Intentional gaps.** Stubs/placeholders are acceptable in dev—mark status
   clearly when a section is partial.

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
- Never stage or commit unless the user literally says “commit” (or explicitly
  agrees to your request to commit). When in doubt, assume the answer is “no”.
  assistant session.
- The project is in dev phase, do not introduce temporary shims when refactoring
  or fixing bugs; aim for permanent solutions.
- Always focus on the simplest and shortest possible implementation that meets
  the request. Propose any additional guards, optimisations, checks, etc. as
  follow ups instead of adding them by default.
- If you spot any tradeoffs or pros and cons of alternative solutions always ask
  first before implementing one.
- Don't assume that the request is always clear, if in doubt ask before
  proceeding.
- Whenever you present more than one item (thoughts, plans, recommendations,
  etc.), format it as an ordered list (1., 2., …) instead of bullets.
- The shared test harness treats console warnings/errors as failures; if you
  need temporary instrumentation during debugging, prefer `console.log` or
  `console.info` and remove the statements before finishing a task.

## Checks

- Guard every test command with a 60s timeout; if it times out, treat the test
  as broken and investigate instead of extending the timeout.

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
   3. `pnpm run test:unit:collab`

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
