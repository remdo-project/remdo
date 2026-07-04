# Contributing

The conventions RemDo changes must follow: Git workflow, runtime and
compatibility baselines, and rules for comments and editor feature modules.
How docs themselves are written lives in [docs/documentation.md](documentation.md).

## Git Workflow

`origin/main` is the canonical **PR/review baseline** — what work is ultimately
diffed against to merge; `dev` is the integration/staging branch and does not
need a perfectly linear history. Do the work on topic branches kept to a single
concern, forked from `origin/main`. Local reviews diff against the branch's own
work with the three-dot merge-base range **`origin/main...HEAD`** (or
`git diff "$(git merge-base origin/main HEAD)"` to include uncommitted work) — no
tag to maintain, since the merge-base is recomputed from the two refs and stays
correct even after merging `origin/main` in (see the `remdo-feature-flow` skill).

Name topic branches with clear prefixes so intent is obvious:

- `feat/` for new user-facing capabilities.
- `fix/` for bug patches.
- `refactor/` for structural or technical debt cleanups that do not change
  behavior.
- `perf/` for performance-related work.
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
2. **Modern syntax is fine.** Stage-4 ECMAScript features supported by the
   browserslist (optional chaining, nullish coalescing, `??=`, etc.) need no
   back-compat branches.
3. **Tests should reflect the baseline.** When reproducing bugs, rely on jsdom +
   the supported engines. Don’t introduce polyfills that mask incompatibilities
   outside the supported set.

## Compatibility Policy (Pre-1.0)

Backward compatibility is not guaranteed unless a task or spec explicitly says
otherwise.

Default policy:

1. Do not preserve legacy persisted-data formats by default.
2. Do not preserve legacy ID, route, or internal-schema shapes by default.
3. Do not plan migration paths or compatibility shims unless explicitly
   requested.
4. Review feedback should not raise backward-compatibility-only concerns unless
   the task/spec explicitly requires compatibility.
5. If a change intentionally includes backward-compatible behavior, call that
   out in the task wrap-up message rather than as a review finding.

## Code Comments

`TODO:` and `FIXME:` are the only tracked comment markers — use them for any
comment worth tracking (a workaround, a deferred fix, a known gap), and don't
invent other prefixes (`WORKAROUND:`, `HACK:`, `NOTE:` to-do, etc.). `FIXME:`
marks something wrong that should be fixed; `TODO:` marks intentional,
working-but-revisit code. State the rationale and, where one exists, the
one-line probe that proves the comment obsolete (delete the shim / flip the flag
/ run the suite) right there in the comment.

Because these markers are scanned and tracked (e.g. the dependency-refresh skill
reviews `TODO:`/`FIXME:` at dependency-related sites), trust them as the record:
once a workaround is a tracked marker at its code site, do **not** add a second
tracker for it elsewhere (a `docs/` list, a `docs/todo.md` line). The comment
travels with the code and is seen on deletion; a duplicate note only drifts.

## Editor Feature Modules

Use `src/client/editor/features/<feature>/` for cohesive editor features that
own their plugin entry points plus related nodes, helper modules, UI, and unit
tests. Colocated `*.spec.ts` and `*.spec.tsx` files in these feature folders are
part of the unit test inventory and should follow the same test rules as
`tests/unit`.

Dependencies point one way: a feature MAY import from the shared base
(`runtime/`, `outline/`) and from other features, but the shared base MUST NOT
import a feature. A capability that is genuinely one feature's concern is owned
by that feature and other modules ask it by name — for example zoom owns the
current zoom root (`features/zoom/zoom-root.ts`) and selection/editing code asks
zoom for it, while the generic "is this within a bounding subtree" check stays in
`outline/` (`isWithinBoundary`). Known exception to repay: several `outline/`
modules still import note-body primitives from `features/note-body/` (see
`docs/todo.md`); do not add new shared→feature imports.

Keep durable product behavior in `docs/`; source feature folders should not
replace the stable behavior specs.

## Environment

See `docs/run-modes.md` for the canonical environment setup across dev, tests,
prod, backup machines, and CI.
