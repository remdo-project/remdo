# Test documents

Test documents are the fixtures tests start from and the outlines they expect.
They extend the [RemDo text format](../../format.md) with state the text
doesn't hold; the [testing policy](../../dev/testing.md#fixture-assumptions)
owns when tests use them.

- Fold:: a note's `folded::` lines, on any line among its children, state its
  fold state, not content: the first decides, and `true` folds the note while
  any other value leaves it unfolded. Production readers give them no meaning,
  since fold state belongs to [folding](../outliner/folding.md).
- Edge whitespace:: character references such as `&#32;` state whitespace at a
  note's edges, which production readers drop.
- Selection:: in an expected outline, `<selection />` marks a caret and
  `<selection>…</selection>` a range within one note's text, or whole notes
  when the tags stand on their own lines around them. A selected inline token,
  such as a date, is a range over its label.
