# Test documents

Test documents are the fixtures tests start from and the outlines they expect.
They extend the [RemDo text format](../../format.md) with state the text
doesn't hold; the [testing policy](../../dev/testing.md#fixture-assumptions)
owns when tests use them.

- Fold:: a `folded:: true` line after a note's ID and before its children
  folds the note. Production readers give it no meaning, since fold state
  belongs to [folding](../outliner/folding.md).
- Selection:: in an expected outline, `<selection />` marks a caret and
  `<selection>…</selection>` a range within one note's text, or whole notes
  when the tags stand on their own lines around them. A selected inline token,
  such as a date, is a range over its label.
