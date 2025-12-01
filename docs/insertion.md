# Insertion (Enter) Semantics

Defines how RemDo inserts new notes when `Enter` is pressed in **caret mode**.
Structural mode still treats `Enter` as a no-op; see `docs/selection.md` for
mode definitions.

## Scope

1. Caret is inside a single note (expanded parent unless stated otherwise).
2. Actions apply to the active note’s text; structural selection rules are
   unchanged.
3. Folded/collapsed parents are called out separately; all other cases assume
   the parent is expanded.

## Default behavior (caret mode)

1. **Start of note** – create a previous sibling immediately above. Focus moves
   to the new sibling so typing continues there. Children of the original note
   stay attached to it.
2. **Middle of note** – split into two siblings at the caret. Text **before**
   the caret becomes a new sibling inserted immediately above the original; the
   original note keeps the text after the caret and all of its children (the
   note after the caret remains the parent of its subtree).
3. **End of note** – create a new first child of the current note. Focus moves
   to that child. Use this when the parent is expanded; see the collapsed case
   below.

## Focus rules

1. **Start of note:** place the caret in the new sibling above so typing
   continues there.
2. **Middle of note:** keep the caret in the original note (the one after the
   caret) so the trailing text remains the active line.
3. **End of note:** place the caret at the start of the new child so typing
   immediately fills it.
