# RemDo Agent Guidelines

## General

RemDo is a collaborative outliner for fast, structured note-taking. It’s
keyboard-first and built on Lexical, emphasizing clarity, composability, and
portability.

### Core ideas

- **Structure-first.** Notes form a hierarchical tree; every note is addressable
  and linkable.
- **Collaboration by default.** Real-time multi-user editing with clear
  attribution.
- **Small, composable primitives.** Predictable behaviors, minimal UI,
  consistent commands.

### What is a note?

Refer to `docs/concepts.md` for the canonical definition of a note, including
its invariants, structure, and adapter contracts. In short, notes are the
addressable, typed units that form RemDo’s ordered tree; the concepts document
captures the full model.

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

## Checks

- `pnpm run lint`: run after every code change before considering the work
  complete.
- `pnpm run test:unit`: run often, and always before staging or committing code
  changes.
- `pnpm run test:unit:collab`: run whenever you touch collaboration, Yjs, or
  syncing logic to exercise the full collaboration-enabled suite.

## Tools

- `pnpm run dev:init` is the one-shot workspace bootstrap. It runs
  `pnpm i --frozen-lockfile`, fetches the pinned Lexical sources, and hydrates
  `data/.vendor/lexical`. Use it when you clone RemDo for the first time—or if
  you blow away `node_modules`/`data/.vendor`. Skip it in workspaces that are
  already initialized so you don’t clobber local caches.
- `data/.vendor/lexical` is our read-only mirror of the upstream Lexical repo at
  the exact version declared in `package.json`. Consult it whenever you need to
  inspect canonical Lexical behavior without poking inside `node_modules`. Never
  edit files there; rerun `pnpm run dev:init` if you need a fresh copy.
- Use the GitHub CLI (gh) to check repository and Actions status on GitHub.
