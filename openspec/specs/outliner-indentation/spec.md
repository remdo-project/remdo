# Outliner Indentation Specification

## Purpose

Define how indent and outdent operations restructure target note ranges while
preserving editor focus and structural boundaries.

## Requirements

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

### Requirement: Indent nests beneath the preceding sibling

Indenting a target note range MUST make the range the children of its immediate
preceding sibling while preserving its order and internal structure. When the
range has no preceding sibling, indentation MUST leave the outline unchanged.

#### Scenario: Preceding sibling is available

- **WHEN** a target note range has an immediate preceding sibling
- **THEN** the complete range nests beneath that sibling as one unit

#### Scenario: Preceding sibling is unavailable

- **WHEN** a target note range has no preceding sibling
- **THEN** indentation leaves the outline unchanged

### Requirement: Outdent promotes beside the former parent

Outdenting a target note range MUST move the range up one level immediately
after its former parent while preserving its order and internal structure. When
the range is top-level, outdentation MUST leave the outline unchanged.

#### Scenario: Parent is available

- **WHEN** a target note range has a parent other than the document root
- **THEN** the complete range moves immediately after that parent as one unit

#### Scenario: Range is top-level

- **WHEN** a target note range is already top-level
- **THEN** outdentation leaves the outline unchanged

### Requirement: Indentation stays within the zoom boundary

When [zoom](/docs/outliner/zoom.md) is active, indenting or outdenting MUST
change the outline only when the complete result remains inside the zoom
boundary. An operation that would cross the boundary MUST leave the outline
unchanged.

#### Scenario: Operation remains inside zoom

- **WHEN** an indent or outdent result keeps every targeted note inside the
  active zoom boundary
- **THEN** the operation applies normally

#### Scenario: Operation would cross zoom

- **WHEN** an indent or outdent result would move any targeted note outside the
  active zoom boundary
- **THEN** the operation leaves the outline unchanged

### Requirement: Boundary indentation keys keep editor focus

When a target note range resolves, the editor MUST consume `Tab` or `Shift+Tab`
and retain focus even when the requested structural operation leaves the
outline unchanged.

#### Scenario: Keyboard operation is a structural no-op

- **WHEN** a user presses `Tab` or `Shift+Tab` with a resolvable target note
  range but the requested operation cannot change the outline
- **THEN** the outline remains unchanged and focus stays inside the editor
