## MODIFIED Requirements

### Requirement: Keyboard indentation resolves a target note range

Users MUST be able to indent the current
[target note range](/docs/outliner/selection.md#note-ranges) with `Tab` and
outdent it with `Shift+Tab`. A caret in note content or a body, or an inline text
selection in note content, targets its owning note; a structural selection
targets its selected note range.

#### Scenario: Indent from a non-structural selection

- **WHEN** a user presses `Tab` from a caret in note content or a body, or from
  an inline text selection in note content
- **THEN** indentation targets that note and its subtree

#### Scenario: Outdent a structural selection

- **WHEN** a user presses `Shift+Tab` with a structural selection
- **THEN** outdentation targets its complete selected note range and subtrees
