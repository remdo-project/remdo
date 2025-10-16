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
- Never push changes. Pushing must always be done manually outside of the
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
- When you propose/list a few things use an ordered list.

## Checks

- `pnpm run lint`: run after every code change before considering the work
  complete.
- `pnpm run test:unit`: run often, and always before staging or committing code
  changes.

## Tools

- Use the GitHub CLI (gh) to check repository and Actions status on GitHub.
- Lexical sources are available locally at `.data/lexical`. Refer to them
  whenever working on core editor functionalities. Their versions match the
  modules imported from `node_modules`. Run `pnpm run dev:init` to fetch them if
  not available.
