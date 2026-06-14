@AGENTS.md

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
