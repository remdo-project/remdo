## Context

The indentation spec groups carets and inline text selections across note
content and bodies as owner-note targets. The maintained selection resolver
instead treats a non-collapsed selection wholly inside one body as body-local;
only a collapsed body caret falls back to the owner note. The original
indentation migration explicitly excluded product behavior changes.

## Goals / Non-Goals

**Goals:**

- Make the target-resolution requirement match the maintained selection model.
- Preserve the existing distinction between a body caret and an inline body
  selection.

**Non-Goals:**

- Change indentation, selection, body, or browser focus behavior.
- Add command-specific selection fallbacks or tests for new behavior.

## Decisions

### Enumerate the supported non-structural targets

The corrected requirement names a caret in note content or a body and an inline
text selection in note content as owner-note targets. It does not include an
inline text selection wholly inside a body, which remains body-local.

Alternative: make indentation resolve inline body selections to their owner
note. Rejected because that introduces product behavior outside the
behavior-preserving migration and conflicts with the selection resolver's
deliberate body-local boundary.

## Risks / Trade-offs

- The correction could accidentally weaken caret-in-body behavior. → Keep body
  carets explicit in both the requirement and scenario.
- The delta could replace unrelated indentation rules. → Modify only the full
  target-resolution requirement and preserve every other main-spec requirement.
