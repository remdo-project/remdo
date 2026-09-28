import { $createTextNode } from 'lexical';
import { expect, it } from 'vitest';
import { meta } from '#tests';
import { $addNoteBody } from '#client/editor/features/note-body/note-body-ops';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { renderOutline } from './outline';

it('renders list types, checked state, bodies, and note links as nested Markdown', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    $addNoteBody($findNoteById('note3')!).append($createTextNode('- details'));
  });
  await remdo.updateNoteText('note5', 'see [ref]');
  await remdo.openDocument.noteRef('note3').toggleChecked();

  expect(renderOutline(remdo.openDocument.root, (noteId) => `https://remdo.example/n/doc_${noteId}`)).toBe([
    '- [note1](https://remdo.example/n/doc_note1)',
    '  1. [note2](https://remdo.example/n/doc_note2)',
    '- [x] [note3](https://remdo.example/n/doc_note3)',
    '  > - details',
    '  - [x] [note4](https://remdo.example/n/doc_note4)',
    String.raw`- [see \[ref\]](https://remdo.example/n/doc_note5)`,
    '  - [note6](https://remdo.example/n/doc_note6)',
  ].join('\n'));
});
