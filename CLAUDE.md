@AGENTS.md

## Agent memory location (per-VM cache, not repo content)

Cross-session "memory" notes — derived facts, gotchas, hold-back rationale, and
anything written via the memory/remember workflows — are a per-machine cache,
**not** repository content. Store and read them under `~/.claude/memory/`
(create it if missing), and treat that directory as the memory root (it holds
`MEMORY.md` plus one file per memory). Do **not** write them under this repo's
`.claude/` (e.g. `.claude/projects/.../memory/`) or under any worktree.

Rationale: this project is developed from several working dirs and git worktrees
on the same dev VM (e.g. `remdo-5000`, `remdo-7000`, `../remdo-wts/*`). A single
user-level store is shared across all of them, stays out of version control, and
is disposable — safe to lose on machine reinstall and not transferred between dev
machines. Override any default that points memory at a per-project path.

## Superpowers plan/spec output location

When a superpowers skill (or any planning/brainstorming workflow) saves an
implementation plan or design spec, write it under `.agent/` in the current
working dir, not the skill's default `docs/superpowers/`: plans to
`.agent/plans/<YYYY-MM-DD>-<feature>.md` and specs to
`.agent/specs/<YYYY-MM-DD>-<topic>-design.md`. These are per-WD scratch (see the
`.agent/` rule in AGENTS.md), not versioned docs.

## `/code-review` output format (Claude Code)

Interactive runs (no `--comment`, no `--fix`) render findings as the readable
list below instead of the JSON array; `--comment`/`--fix` keep JSON, which they
parse for `file`/`line`. Build each finding from the verification already done —
don't re-investigate to fill the format. Severity glyphs: 🔺 High, 🔸 Medium,
🔹 Low. `Status` is `Confirmed` (cite the line) or `Plausible`. `Repro`: write
`as above` when the trigger is obvious from **What happens**, else user-level
steps if UI-reachable, else the exact technical conditions (say so if no user
can hit it). Close with `Suppressed N finding(s) already tracked in docs/todo.md`
(omit when `N` is 0).

> Code review — 2 findings (1 high, 1 low)

**1. — 🔺 High · Confirmed**
Missing `await` on token refresh → request sent with expired token
`src/server/auth/session.ts:142`
**What happens:** `refreshToken()` returns an un-awaited promise, so `headers.authorization` is built from the old token; after it expires mid-session, every later request 401s until reload.
**Repro:** Line 142 reads `session.token` before the awaited refresh resolves — stay in one session past the token TTL (~15 min), then trigger any fetch → 401.

**2. — 🔹 Low · Plausible**
Rollback `catch` can mask the original error
`tools/snapshot/backup.ts:144`
**What happens:** If the restore rename inside the `catch` throws, it shadows the real publish error.
**Repro:** Not user-reproducible — needs the publish rename to fail and the rollback rename to also fail (e.g. a leftover `documents/` dir).
