# Hints (Ideas Backlog)

## Purpose

Capture hint ideas we may want in the product later.

This file is intentionally lightweight: it tracks UX hint concepts before we
have a runtime hint system.

## Scope

All entries here are ideas and are not currently surfaced in the UI.

When a hint is implemented, move its behavioral details into the authoritative
feature doc (for example in `docs/outliner/*`) and keep only a short pointer
here if needed.

## Candidate Hints

### [Future] Search shortcut fallback

- Current behavior context: the app handles `Cmd/Ctrl+F` by focusing the
  document search input.
- When the app handles `Cmd/Ctrl+F` and focuses search, we may show a hint that
  pressing the shortcut again opens browser find.

### [Future] Note controls discoverability

- Briefly explain hover/caret activation for note controls when users interact
  with the outline for the first time.

### [Future] Structural selection guidance

- Explain why selection mode changed (caret vs structural) when users trigger
  structural-selection shortcuts.
