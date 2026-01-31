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
   - ✅ Done: unit tests for breadcrumb model and zoom path emission.
   - ✅ Done: interaction test for bullet-click zooming (unit).
   - ✅ Done: E2E test for bullet hover/hit region alignment.
   - ✅ Done: URL sync tests (zoom param present/cleared/ignored when invalid).
2. **Implementation:**
   - ✅ Done: zoom state plumbing via route search param and zoom path
     resolution.
   - ✅ Done: bullet click zoom + breadcrumb navigation (document + ancestors).
   - ✅ Done: render zoomed view (filter visible outline to subtree while
     preserving relative indentation).
   - ✅ Done: ensure zoom-reset clears path immediately for UI sync.
3. **Review & cleanup:**
   - ✅ Done: refactor bullet hit testing into a shared helper.
   - Pending: re-scan for simpler/clearer logic once subtree filtering is
     implemented.
   - Pending: re-check doc alignment after subtree filtering lands and remove
     any leftover TODOs.
