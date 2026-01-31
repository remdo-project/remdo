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
   - Pending: add tests for URL sync (zoom param present/cleared/ignored when
     invalid), aligned with the new router implementation.
2. **Implementation:**
   - ✅ Done: zoom state plumbing via route search param and zoom path
     resolution.
   - ✅ Done: bullet click zoom + breadcrumb navigation (document + ancestors).
   - Pending: render zoomed view (filter visible outline to subtree while
     preserving relative indentation).
   - Pending: ensure zoom-reset clears path immediately if needed for UI sync
     (confirm after subtree filtering work).
3. **Review & cleanup:**
   - ✅ Done: refactor bullet hit testing into a shared helper.
   - Pending: re-scan for simpler/clearer logic once subtree filtering is
     implemented.
   - Pending: re-check doc alignment after subtree filtering lands and remove
     any leftover TODOs.
