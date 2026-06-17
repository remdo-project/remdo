# Contributing

## Git Workflow

`origin/main` is the canonical review baseline; `dev` is the integration/staging
branch and does not need a perfectly linear history. Do the work on topic
branches kept to a single concern, and mark each branch's start with the
`wip-base` tag so reviews diff against the right base (see the
`remdo-feature-flow` skill for the mechanism).

Name topic branches with clear prefixes so intent is obvious:

- `feat/` for new user-facing capabilities.
- `fix/` for bug patches.
- `refactor/` for structural or technical debt cleanups that do not change
  behavior.
- `chore/` for maintenance tasks such as dependency bumps or tooling tweaks.
- `docs/` for documentation-only work.

## Runtime Baseline

RemDo only targets the runtimes declared in `package.json`:

- **Node.js:** see `package.json#engines.node`.
- **Browsers:** see `package.json#browserslist` (production + development
  targets).

### Implications

1. **No legacy shims.** Assume the DOM/JS APIs shipped in those engines are
   available. Don’t add defensive checks that only make sense for older browsers
   (for example `typeof selection.extend === 'function'`). Use the API directly
   or document a real compatibility issue before adding guards.
2. **Modern syntax is fine.** Feel free to use Stage-4 ECMAScript features
   supported by the browserslist (optional chaining, nullish coalescing, `??=`,
   etc.) without back-compat branches.
3. **Tests should reflect the baseline.** When reproducing bugs, rely on jsdom +
   the supported engines. Don’t introduce polyfills that mask incompatibilities
   outside the supported set.

Refer to this section whenever compatibility concerns come up; if you need to
support a new platform, update `package.json` first so the baseline stays
authoritative.

## Compatibility Policy (Pre-1.0)

RemDo is currently pre-1.0. Backward compatibility is not guaranteed unless a
task or spec explicitly says otherwise.

Default policy:

1. Do not preserve legacy persisted-data formats by default.
2. Do not preserve legacy ID, route, or internal-schema shapes by default.
3. Do not plan migration paths or compatibility shims unless explicitly
   requested.
4. Review feedback should not raise backward-compatibility-only concerns unless
   the task/spec explicitly requires compatibility.
5. If a change intentionally includes backward-compatible behavior, call that
   out in the task wrap-up message rather than as a review finding.

## Documentation

`docs/index.md` is the documentation map (every doc plus its summary); use it to
navigate. The doc workflow and invariants below govern how docs are written and
maintained. For RemDo's product principles (what the docs must stay faithful
to), see `docs/principles.md`.

### Doc Workflow

1. Before coding, identify the feature area and read the matching sections from
   the `docs/index.md` map; do not reread unrelated docs.
2. While working, deep-link to the authoritative doc (e.g.,
   `docs/contributing.md#git-workflow`) in discussions or PRs so others know the
   source of truth.
3. After modifying documentation, refresh the `docs/index.md` map so the
   pointers stay current. Do not add update-tracking sections to AGENTS.md.

### Documentation invariants

1. **Single source per topic.** Define each behavior once in the doc best suited
   to it; eliminate duplicates and replace any extra copies with pointers.
2. **Top-down linking.** Prefer links from higher-level docs into the detailed
   docs they summarize; same-level links only when they add clear value. Point to
   another doc once per section, not in every note — a single deferral covers the
   section.
3. **Self-contained behavior.** Behavior must be clear without external
   sources. Put external references in final `References`; keep useful internal
   links inline.
4. **Coherence checks.** When editing a doc, ensure the change aligns with
   existing resolutions and update related docs/maps if needed.
5. **Target behavior only.** Stable docs describe the intended/target behavior.
   Track everything provisional — gaps, partial status, implementation
   sequencing, current-vs-future notes, deferral decisions — in `docs/todo.md`.
6. **Behavior changes require doc updates.** When behavior changes, update the
   affected docs in the same change. If no doc update is needed, explicitly
   state why.
7. **Move/rename hygiene.** When moving or renaming docs, update all inbound
   references — including from code, skills, and AGENTS.md, not just doc-to-doc
   links — and the documentation map in the same change; do not leave temporary
   broken references.
8. **Minimal by default.** State the rule, not the inventory. Cut a clause unless
   its absence would let someone misuse the contract. Examples of what to cut:
   things the reader can confirm in code (component lists, constants/offsets,
   accessor or file names, "where X lives" pointers — good design makes that
   findable), rationale (why-not justifications, prior-art name-drops), and
   how-to-use steps (a feature one would reach through the app, not the docs).

## Editor Feature Modules

Use `src/client/editor/features/<feature>/` for cohesive editor features that
own their plugin entry points plus related nodes, helper modules, UI, and unit
tests. Colocated `*.spec.ts` and `*.spec.tsx` files in these feature folders are
part of the unit test inventory and should follow the same test rules as
`tests/unit`.

Keep durable product behavior in `docs/`; source feature folders should not
replace the stable behavior specs.

## Environment

See `docs/run-modes.md` for the canonical environment setup across dev, tests,
prod, backup machines, and CI.
