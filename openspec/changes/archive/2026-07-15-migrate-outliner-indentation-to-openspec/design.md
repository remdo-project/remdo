## Context

The accepted indent and outdent contract lives primarily in
`docs/outliner/note-structure-rules.md`, with selection, body, zoom, popup, and
toolbar documents linking to it. Focused tests cover target ranges, subtree
movement, valid transformations, zoom boundaries, and structural no-ops. The
migration tracker names indentation as the next capability.

The current keyboard handler consumes `Tab` and `Shift+Tab` whenever it can
resolve a target note range, even when the structural operation cannot change
the outline. `docs/legacy-backlog.md` records that focus behavior as an
unresolved contract question; this change accepts the existing behavior.

## Goals / Non-Goals

**Goals:**

- Move the complete accepted indent and outdent contract to one durable
  `outliner-indentation` spec.
- Preserve the current target-range, subtree, zoom-boundary, and no-op behavior.
- Specify that a resolvable keyboard target keeps `Tab` and `Shift+Tab` inside
  the editor, including at structural boundaries.
- Remove the legacy owner, update inbound links, and advance the migration
  tracker atomically.

**Non-Goals:**

- Change indentation, selection, focus, zoom, popup, toolbar, or body behavior.
- Describe Lexical nodes, indentation metadata, plugins, commands, or tree
  helpers.
- Migrate selection, zoom, body, popup, toolbar, or adapter capabilities.

## Decisions

### Specify transformations independently of their input surface

The capability defines indent and outdent transformations on a target note
range, then separately defines how keyboard inputs resolve that range. This
lets keyboard, toolbar, and other maintained callers share one structural
contract without making their presentation surfaces part of indentation.

Alternative: specify only `Tab` and `Shift+Tab`. Rejected because the same
accepted structural operations are exposed through the mobile toolbar and note
SDK, and duplicating their outcomes at each surface would create competing
definitions.

### Preserve consumed boundary keys as focus behavior

When the editor can resolve a target note range, `Tab` and `Shift+Tab` remain
handled even if indentation or outdentation is structurally invalid. The
outline remains unchanged and focus stays inside the keyboard-first editor.

Alternative: let a structurally invalid key press fall through to browser focus
navigation. Rejected because it changes current user behavior and makes a
structural boundary unexpectedly leave the editor.

### Keep adjacent capability terms with their current owners

The indentation spec consumes target note range, subtree, body ownership, and
zoom boundary terms without redefining their capabilities. It links the current
authorities at first use. The existing migration-backlog entry continues to
preserve selection terminology until selection migrates.

Alternative: copy adjacent selection and zoom rules into indentation. Rejected
because that would create competing definitions during migration.

## Risks / Trade-offs

- The shared legacy document could leave a rule without an owner when removed.
  → Compare its complete contents and inbound links against the indentation,
  reordering, selection, concepts, deletion, and zoom owners.
- Current tests do not prove that a no-op boundary key preserves focus.
  → Add focused automated coverage for the accepted focus behavior.
- Links could keep targeting the removed document.
  → Search the repository and run Markdown validation after the ownership
  move.
