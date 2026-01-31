# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Zoom view implementation plan (tests → implementation → review)

1. **Tests (start here):**
   - Add unit tests for zoom state resolution (document root as default; missing
     or invalid zoom target falls back to document root).
   - Add unit tests for breadcrumb model: document-only at root, full ancestor
     path when zoomed, and zoom-root crumb is non-clickable.
   - Add tests for URL sync: zoom target present when zoomed; removed when
     zooming to document root; invalid target ignored.
   - Add interaction tests for bullet-click zooming and breadcrumb navigation
     (choose unit or e2e based on existing harness coverage).
2. **Implementation:**
   - Add zoom state plumbing (defaulting to document root noteId) and keep it
     synced with route state.
   - Render zoomed view by filtering the visible outline to the zoom root
     subtree while preserving relative indentation.
   - Wire bullet click to set zoom target; wire breadcrumb clicks to zoom
     target changes (document root + ancestor notes).
   - Clear breadcrumb path immediately when zoom resets so UI stays in sync
     even without an editor update.
3. **Review & cleanup:**
   - Remove any temporary helpers or debug code; confirm no redundant state or
     duplicate calculations remain.
   - Re-scan for simpler/clearer logic, especially in zoom-to-route syncing and
     subtree filtering.
   - Run lint/tests, then re-check doc alignment and remove any leftover TODOs
     that are no longer needed.
