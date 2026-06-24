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
navigate. The invariants below govern how docs are written and maintained; the
agent-facing doc workflow (read before coding, deep-link to sources, fix
superseded docs in the same change) lives in `AGENTS.md`.

### Documentation invariants

These invariants apply to every doc in the corpus.

1. **Single source per topic.** Each behavior MUST be defined exactly once, in
   the doc best suited to it. Likewise, each precise term MUST be defined once —
   in concepts or the glossary — and MUST NOT be redefined or shadowed by any
   other doc.
2. **Top-down linking.** Links SHOULD point from higher-level docs into detailed
   ones. Same-level links SHOULD appear only where they add clear value.
3. **Self-contained behavior.** A doc's behavior MUST be clear without external
   sources. A final `References` section is for external sources only (specs,
   standards, third-party docs) and MUST contain all of them; cross-doc links
   within this corpus MUST be inline, never collected into `References`.
4. **Cross-doc consistency.** Two docs MUST NOT make contradictory claims about
   the intended system.
5. **Spec, not status.** A doc's normative spec MUST describe target behavior
   only. Gaps, partial status, sequencing, and deferral decisions MUST live in
   `docs/todo.md`. A doc MAY carry a `Future` section listing deferred
   long-horizon directions as brief triggers (not specs, not target behavior); a
   direction MAY instead live in `docs/todo.md` — either place is fine.
6. **No superseded contract.** A doc MUST NOT describe behavior the project has
   deliberately moved away from.
7. **No broken links.** Every inbound link MUST resolve, and the documentation
   map MUST be current.
8. **Minimal by default.** State the rule, not the inventory: a clause MUST be
   omitted unless its absence would let someone misuse the contract. This
   includes anything the reader can confirm in code, plus rationale and how-to
   steps.
9. **No untracked divergence.** Any divergence between a doc's claim and the code
   MUST be recorded in `docs/todo.md`. A recorded divergence that no longer
   exists MUST have its entry deleted.

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

Keep durable product behavior in `docs/`; source feature folders should not
replace the stable behavior specs.

## Environment

See `docs/run-modes.md` for the canonical environment setup across dev, tests,
prod, backup machines, and CI.
