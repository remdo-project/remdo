# Test documents

Test documents are the fixtures tests start from and the outlines they expect.
They extend the [RemDo text format](../../format.md) with state the text
doesn't hold; the [testing policy](../../dev/testing.md#fixture-assumptions)
owns when tests use them.

- Fold:: `folded` is a [property](../../format.md#properties) holding a note's
  fold state: `true` folds the note. Production readers give it no meaning,
  since fold state belongs to [folding](../outliner/folding.md).
- Edge whitespace:: character references such as `&#32;` state whitespace at a
  note's edges, which production readers drop.
- Fixture IDs:: in a fixture, a note without an `id::` line takes its text as
  its ID when that is a valid ID no `id::` line or earlier note claims, and a
  generated ID otherwise.
- Check lists:: a bulleted list whose notes all have a checkbox is a check
  list, and `[x]` checks a note in any list.
- Other documents:: while fixtures load into editor documents, a link to a
  note in another one is `note:<documentId>_<noteId>`.
- Selection:: in an expected outline, `<selection />` marks a caret and
  `<selection>…</selection>` a range within one note's text, or whole notes
  when the tags stand on their own lines around them. A selected inline token,
  such as a date, is a range over its label.
