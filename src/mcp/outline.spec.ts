import { $createTextNode } from 'lexical';
import { expect, it } from 'vitest';
import type { OpenDocumentNote } from '#note-sdk';
import { meta } from '#tests';
import { $addNoteBody } from '#client/editor/features/note-body/note-body-ops';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { renderOutline } from './outline';

const url = (noteId: string) => `https://remdo.example/n/doc_${noteId}`;

it('renders list types, checked state, bodies, and note links as nested Markdown', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    $addNoteBody($findNoteById('note3')!).append($createTextNode('- details'));
  });
  await remdo.updateNoteText('note5', 'see [ref]');
  await remdo.openDocument.noteRef('note3').toggleChecked();

  expect(renderOutline(remdo.openDocument.root.getChildren(), url)).toBe([
    '- [note1](https://remdo.example/n/doc_note1)',
    '  1. [note2](https://remdo.example/n/doc_note2)',
    '- [x] [note3](https://remdo.example/n/doc_note3)',
    '  > - details',
    '  - [x] [note4](https://remdo.example/n/doc_note4)',
    String.raw`- [see \[ref\]](https://remdo.example/n/doc_note5)`,
    '  - [note6](https://remdo.example/n/doc_note6)',
  ].join('\n'));
});

it('leaves notes without a URL unlinked', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.updateNoteText('note2', 'see [ref]');
  expect(renderOutline(remdo.openDocument.root.getChildren(), (noteId) => noteId === 'note2' ? null : url(noteId))).toBe([
    '- [note1](https://remdo.example/n/doc_note1)',
    String.raw`- see \[ref\]`,
    '- [note3](https://remdo.example/n/doc_note3)',
  ].join('\n'));
});

it('renders one note with its descendants', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
  expect(renderOutline([remdo.openDocument.noteRef('note3')], url)).toBe([
    '- [note3](https://remdo.example/n/doc_note3)',
    '  - [ ] [note4](https://remdo.example/n/doc_note4)',
  ].join('\n'));
});

it('cuts the outline off at the depth limit and reports the children it hides', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
  await remdo.openDocument.noteRef('note1').appendChildren([{ text: 'extra' }]);

  expect(renderOutline(remdo.openDocument.root.getChildren(), url, { depth: 1 })).toBe([
    '- [note1](https://remdo.example/n/doc_note1) *(2 children not shown)*',
    '- [note3](https://remdo.example/n/doc_note3) *(1 child not shown)*',
    '- [note5](https://remdo.example/n/doc_note5) *(1 child not shown)*',
  ].join('\n'));
});

it('renders outlines nested deeper than the call stack', () => {
  const depth = 20_000;
  let children: OpenDocumentNote[] = [];
  for (let level = depth - 1; level >= -1; level--) {
    const nested = children;
    children = [{
      getId: () => `n${level}`,
      getText: () => `n${level}`,
      getChecked: () => false,
      getBody: () => null,
      getChildListType: () => null,
      getChildren: () => nested,
    } as unknown as OpenDocumentNote];
  }
  const lines = renderOutline(children[0]!.getChildren(), () => null).split('\n');
  expect(lines).toHaveLength(depth);
  expect(lines.at(-1)).toBe(`${'  '.repeat(depth - 1)}- n${depth - 1}`);
});
