@AGENTS.md

## Agent memory location (per-VM cache, not repo content)

Cross-session "memory" notes — derived facts, gotchas, hold-back rationale, and
anything written via the memory/remember workflows — are a per-machine cache,
**not** repository content. Store and read them under `~/.claude/memory/`
(create it if missing), and treat that directory as the memory root (it holds
`MEMORY.md` plus one file per memory). Do **not** write them under this repo's
`.claude/` (e.g. `.claude/projects/.../memory/`) or under any worktree.

## Response economy (Claude Code)

Optimize for the user's reading time, not for word count. The goal is not
"shorter" uniformly — it is that each piece of information appears exactly once
and nothing is present purely for tone.

- Prefer the shortest form that carries the same information: when two phrasings
  lose nothing relative to each other, choose the briefer one. This is a
  constraint, not a target — never shorten by dropping information, caveats, or
  uncertainty (see the last bullet). The bullets below are instances of this
  principle.

- Single-source every fact. Do not state the same point as a summary, then an
  expansion, then a bullet to choose from. Say each thing in the one place it
  belongs. This targets *accidental* restatement, not a fact appearing in two
  genuinely different functional roles (e.g. a recommendation in prose and as
  the first `AskUserQuestion` option, where the tool requires the option).
- No closing recap that merely restates the body. Keep a final line only when it
  carries something new — a status, a next action, or a caveat.
- Cut tone-only content. Apply the test: would removing this sentence lose any
  fact, option, or caveat? If no, drop it. This bans crediting/blaming or
  re-litigating who was right, reassurance, throat-clearing, and re-affirming
  that the request will be done. Politeness that costs no extra sentence (neutral
  tone, an inline "thanks") is fine; spending a sentence or clause on tone is not.
- Never trim for brevity at the cost of trust. Removing redundancy and tone is
  the lever; caveats, uncertainty, and disagreement are never cut to look
  concise.
