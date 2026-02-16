import { describe, it, expect } from 'vitest';
import { placeCaretAtNote, selectNoteRange, readOutline, meta } from '#tests';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';

describe('keyboard reordering (command path)', () => {
  it('move down swaps with next sibling within the same parent', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });

  it('move up swaps with previous sibling within the same parent', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });

  it('move down from root-level tail is a no-op at document boundary', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('move up from root-level head is a no-op at document boundary', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note1');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('move down from only child outdents when parent has no next sibling', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('move up from only child reparents as last child of the parent previous sibling', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', children: [{ noteId: 'note3', text: 'note3' }] },
      { noteId: 'note2', text: 'note2' },
    ]);
  });

  it('move commands act on contiguous selection blocks', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note1', 'note2');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline([
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });

  it('moving a note carries its subtree intact', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1'); // note1 has no children, note3 is nested under note2
    await selectNoteRange(remdo, 'note2', 'note2'); // move note2 which has child note3
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    expect(remdo).toMatchOutline([
      {
        noteId: 'note2', text: 'note2',
        children: [{ noteId: 'note3', text: 'note3' }],
      },
      { noteId: 'note1', text: 'note1' },
    ]);
  });

  it('moving a mixed-depth contiguous range down reparents under the parent next sibling as first children', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note2', 'note4'); // includes descendant note3
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note5', text: 'note5', children: [
          {
            noteId: 'note2', text: 'note2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('deep nested boundary move down reparents under the parent next sibling as first child', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note3', 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note4', text: 'note4', children: [{ noteId: 'note3', text: 'note3' }] },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('deep nested boundary move up outdents before parent when parent has no previous sibling', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note3', 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note3', text: 'note3' },
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('ancestor-only selection swaps intact with sibling within parent list', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note2', 'note2'); // select ancestor with child note3
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [{ noteId: 'note4', text: 'note4' }, { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] }],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('moving a mixed-depth contiguous range up outdents before the former parent when reparent is not possible', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note2', 'note4'); // includes descendant note3
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    expect(remdo).toMatchOutline([
      {
        noteId: 'note2', text: 'note2',
        children: [{ noteId: 'note3', text: 'note3' }],
      },
      { noteId: 'note4', text: 'note4' },
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('repeated move down on note3 follows reparent -> outdent -> reparent cascade', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5', children: [{ noteId: 'note3', text: 'note3' }] },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('move up reparents as the last child of the parent previous sibling', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);

    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note4', text: 'note4' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('move down outdent from final nested tail keeps former parent children attached', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      { noteId: 'note3', text: 'note3' },
    ]);

    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('move up no-ops at absolute document head after cascade outdents', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);

    expect(remdo).toMatchOutline([
      { noteId: 'note3', text: 'note3' },
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);

    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('ignores selections spanning different parents', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note1', 'note3'); // crosses root note and nested child
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
      },
      {
        noteId: 'note2', text: 'note2',
        children: [{ noteId: 'note3', text: 'note3' }],
      },
    ]);
  });
});
