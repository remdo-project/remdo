# TODO

This file is the authoritative **new TODO** for temporary work state, known gaps,
unresolved decisions, and follow-up work. It does not define or override
accepted target behavior. Until the legacy [`docs/todo.md`](../docs/todo.md) is
retired, requests naming the new TODO refer here.

Reviewers treat explicitly recorded gaps as intended temporary state rather than
new findings. Group related notes under short topic headings. Remove rejected or
obsolete notes and empty sections.

## Retire the "new TODO" transition

Retire `docs/todo.md` and its live references, migrate its remaining useful
entries, then refer to this file simply as the TODO.

## Implement `remdo-verify-change`

The [`remdo-verify-change`](skills/remdo-verify-change.md) contract is not
implemented yet.

## Propagate nested results

- Components report facts through their results; their callers decide what
  happens next.
- A future change flow should include the verifier's unavailable or failed
  reviewers in its user-facing task result.
