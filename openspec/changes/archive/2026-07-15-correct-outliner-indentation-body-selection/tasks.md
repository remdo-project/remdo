## 1. Correct the contract

- [x] 1.1 Confirm the maintained resolver treats body carets as owner-note
  targets and non-collapsed inline body selections as body-local.
- [x] 1.2 Synchronize the corrected target-resolution requirement into the main
  `outliner-indentation` spec without changing unrelated requirements.

## 2. Verify the correction

- [x] 2.1 Confirm the corrected contract matches the implementation and existing
  caret-in-body coverage without requiring a runtime or test change.
- [x] 2.2 Confirm the delta and main requirement are equivalent, run strict
  OpenSpec validation, and run the repository checks required for review.
