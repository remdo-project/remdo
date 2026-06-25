import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { REDO_COMMAND, UNDO_COMMAND, $createTextNode, $getRoot, $getSelection, $isTextNode  } from 'lexical';
import {
  collapseDomSelectionAtNode,
  copySelection,
  copySelectionClipboardData,
  extendDomSelectionToNode,
  getNoteBodyTextNode,
  pastePayload,
  placeCaretAtNote,
  pressKey,
  readCaretNoteId,
  selectEntireNote,
  selectStructuralNotes,
  typeText,
  meta,
} from '#tests';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getBodyWrapper } from '#client/editor/outline/list-structure';
import { getSubtreeTail } from '#client/editor/outline/selection/tree';
import { $createBodyWrapper, $isNoteBodyNode, isBodyWrapper } from './note-body-node';
import { $getNoteId } from '#client/editor/runtime/note-id-state';
import { $normalizeNoteIdsOnLoad } from '#client/editor/plugins/note-id-normalization';
import { getNoteBody, $skipBodyForVerticalNav } from './note-body-ops';
import { $resolveLinkPickerOptions } from '#client/editor/plugins/note-link/options';

describe('note body (docs/outliner/body.md)', () => {
  it('shift+Enter on a note adds a body and moves the caret into it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'a body');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'a body' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('shift+Enter on a note that already has a body focuses the existing body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'first');

    // Move the caret back to the note, then Shift+Enter again.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'Xfirst' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('the body is not a note: it carries no noteId and is not a separate outline note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body text');

    // The body content attaches to note1 as its body, never as its own note.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'body text' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('backspace on an empty body removes it and returns the caret to the note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A freshly created body is empty; Backspace on it removes the body.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('delete on an empty body removes it and returns the caret to the note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pressKey(remdo, { key: 'Delete' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('select-all + Delete inside a non-empty body removes the body in one step', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'some body text');

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'Delete' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('delete on an empty label whose note has a non-empty body keeps the body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // note2 gets a body, then its label is emptied. Pressing Delete at the end of
    // the empty label must not drop the note as an empty leaf (that would remove
    // the body-wrapper and lose the text). Instead it merges with the next note
    // per the body merge contract (docs/outliner/body.md "Note merge", case 2):
    // the survivor keeps the single body.
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'keepme');

    await remdo.mutate(() => {
      const note = $findNoteById('note2')!;
      for (const child of note.getChildren()) {
        if ($isTextNode(child)) {
          child.remove();
        }
      }
      note.selectEnd();
    });
    await pressKey(remdo, { key: 'Delete' });

    // note2 (empty label, one body) merges into note3; the body survives on the
    // surviving note rather than being silently deleted.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3', body: 'keepme' },
    ]);
  });

  it('backspace at the start of a non-empty body is a no-op and never merges into the note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'bodytext');

    // Caret at the very start of the body, then Backspace.
    await remdo.mutate(() => {
      getNoteBody($findNoteById('note1')!)!.selectStart();
    });
    await pressKey(remdo, { key: 'Backspace' });

    // Body and note both intact — no merge.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'bodytext' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('pasting a copied note inside a body inserts its text, never list nodes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A body is rich text. Pasting a RemDo-copied note while the caret is in a
    // body must drop the note's plain text into the body, not insert list items
    // (which would break the outline). Regression: the inline-paste detection
    // ignored body selections and fell through to the structural insert.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);

    await remdo.mutate(() => {
      getNoteBody($findNoteById('note1')!)!.selectEnd();
    });
    await pastePayload(remdo, clipboardPayload);

    // Outline stays valid: note2's text landed in note1's body; no extra note.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'bodynote2' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('delete at a trailing blank body line is a no-op and never pulls in the next note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A trailing Enter leaves the caret on the body element (offset === child
    // count), not on a text descendant. Delete there must stay a no-op and not
    // merge note2 into the body.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'one');
    await pressKey(remdo, { key: 'Enter' });
    await pressKey(remdo, { key: 'Delete' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'one\n' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('backspace at the start of a child whose parent has a body merges into the parent, not the body', meta({ fixture: 'tree' }), async ({ remdo }) => {
    // tree: note1; note2 > note3. Give note2 (the parent) a body.
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'pbody');

    // Backspace at the start of the child note3 must merge it into note2 (its
    // real parent), leaving note2's body intact — never into the body-wrapper.
    await placeCaretAtNote(remdo, 'note3', 0);
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2 note3', body: 'pbody' },
    ]);
  });

  it('the subtree tail of a note skips a trailing body on its deepest last child', meta({ fixture: 'tree' }), async ({ remdo }) => {
    // tree: note1; note2 > note3. Give note3 (note2's deepest last child) a body.
    // getSubtreeTail(note2) must return note3 (the deepest content note), not its
    // body-wrapper — otherwise document-order merges target the wrapper and
    // corrupt the outline.
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'cbody');

    const tail = remdo.validate(() => {
      const note2 = $findNoteById('note2')!;
      const tailItem = getSubtreeTail(note2);
      return { isBody: getBodyWrapper(tailItem) !== null, isWrapper: isBodyWrapper(tailItem), text: tailItem.getTextContent() };
    });
    // The tail is note3's content item (it has a body), never the body-wrapper.
    expect(tail.isWrapper).toBe(false);
    expect(tail.isBody).toBe(true);
    expect(tail.text).toBe('note3');
  });

  it('load-time note-id normalization leaves the body-wrapper id-less (no missing-note-id)', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'bodytext');

    // Simulate a fresh document load. The body-wrapper must not be treated as a
    // note: it keeps no noteId and the normalizer reports no missing-note-id
    // invariant (which the harness would surface as a console error → failure).
    // Run via editor.update directly since a correct normalize is a no-op here.
    await act(async () => {
      remdo.editor.update(() => {
        $normalizeNoteIdsOnLoad($getRoot(), remdo.getCollabDocId());
      });
    });

    const wrapperHasNoId = remdo.validate(() => {
      const wrapper = getBodyWrapper($findNoteById('note1')!)!;
      return $getNoteId(wrapper) === null;
    });
    expect(wrapperHasNoId).toBe(true);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'bodytext' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  // Note-merge body contract (docs/outliner/body.md "Note merge"). Backspace at
  // note2's start merges note2 into note1.
  it('merging two notes with no bodies works as usual', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('merging carries the body when only the merged-away note has one', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Body on note2 (the note that gets merged away).
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Backspace' });

    // note2 merges into note1; its body survives on the result note1.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 note2', body: 'note2 body' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('merging keeps the body when only the surviving note has one', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Body on note1 (the surviving note).
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note1 body');

    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 note2', body: 'note1 body' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('merging two notes that both have a body is a no-op', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note1 body');
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Backspace' });

    // Nothing merges — both notes and both bodies are intact.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'note1 body' },
      { noteId: 'note2', text: 'note2', body: 'note2 body' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('reconciles duplicate body-wrappers (concurrent Shift+Enter under collab) into one body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // One body via the normal gesture.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'first');

    // Simulate the collab merge end-state: a second body-wrapper inserted after
    // the first (each collaborator's Shift+Enter passed the local body check
    // before syncing). The body node transform must fold them back into one body
    // so the at-most-one-body invariant holds and the second body is not orphaned.
    await act(async () => {
      remdo.editor.update(() => {
        const firstWrapper = getBodyWrapper($findNoteById('note1')!)!;
        const second = $createBodyWrapper();
        const body = second.getFirstChild();
        if ($isNoteBodyNode(body)) {
          body.append($createTextNode('second'));
        }
        firstWrapper.insertAfter(second);
      });
    });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'firstsecond' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('indenting a note carries its body under the new parent', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Tab' });

    // note2 indents under note1 with its body intact (not left behind at root).
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [{ noteId: 'note2', text: 'note2', body: 'note2 body' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('outdenting a note carries its body back to the outer level', meta({ fixture: 'tree' }), async ({ remdo }) => {
    // tree: note1; note2 > note3. Body on the child note3, then outdent it.
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note3 body');

    await placeCaretAtNote(remdo, 'note3', 0);
    await pressKey(remdo, { key: 'Tab', shift: true });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3', body: 'note3 body' },
    ]);
  });

  it('undo restores a deleted body and its text as one step; redo removes it again', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body text');
    await remdo.waitForSynced();

    // Separate creating the body from deleting it past the collab undo capture
    // window (Yjs UndoManager coalesces create+delete within ~500ms into a
    // no-op step), so this exercises the real "create, later delete, undo" flow.
    await new Promise((resolve) => setTimeout(resolve, 600));

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'Delete' });
    await remdo.waitForSynced();

    const withBody = [
      { noteId: 'note1', text: 'note1', body: 'body text' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];
    const withoutBody = [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];
    expect(remdo).toMatchOutline(withoutBody);

    // One undo brings the body and its text back (selection is not asserted:
    // undo restores structure/content, not the caret).
    await remdo.dispatchCommand(UNDO_COMMAND);
    await remdo.waitForSynced();
    expect(remdo).toMatchOutline(withBody);

    await remdo.dispatchCommand(REDO_COMMAND);
    await remdo.waitForSynced();
    expect(remdo).toMatchOutline(withoutBody);
  });

  it('a body travels with its note: structural delete removes the note and its body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    // Structurally select note2 (which now carries a body) and delete it.
    await selectStructuralNotes(remdo, 'note2', 'note2');
    await pressKey(remdo, { key: 'Delete' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('structural selection of a note with a body never selects the body as a note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');

    // Selecting note1 + note2 structurally must yield exactly those two notes;
    // the body is not an additional structural note.
    await selectStructuralNotes(remdo, 'note1', 'note2');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  });

  it('copy/paste of a note with a body reproduces the body and never leaks it as a standalone note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    await selectStructuralNotes(remdo, 'note2', 'note2');
    const payload = await copySelection(remdo);

    await selectStructuralNotes(remdo, 'note3', 'note3');
    await pastePayload(remdo, payload);

    // The body is content the note owns, so the pasted copy carries it — and the
    // body never appears as its own standalone note (it stays attached as a body).
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', body: 'note2 body' },
      { noteId: null, text: 'note2', body: 'note2 body' },
    ]);
  });

  it('copying a multi-note structural range carries each note with its own body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Give note1 and note2 each a body, select both, copy, paste after note3.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'b1');
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'b2');

    await selectStructuralNotes(remdo, 'note1', 'note2');
    const payload = await copySelection(remdo);

    // Paste over a structural selection replaces it, so the two pasted copies
    // take note3's place. Both carry their own bodies.
    await selectStructuralNotes(remdo, 'note3', 'note3');
    await pastePayload(remdo, payload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'b1' },
      { noteId: 'note2', text: 'note2', body: 'b2' },
      { noteId: null, text: 'note1', body: 'b1' },
      { noteId: null, text: 'note2', body: 'b2' },
    ]);
  });

  it('copying a note with a body includes the body text in the plain-text flavor (paste outside RemDo)', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    await selectStructuralNotes(remdo, 'note2', 'note2');
    const clipboard = await copySelectionClipboardData(remdo);

    // Plain text = the note line, then the body line — what the user sees.
    expect(clipboard.getData('text/plain')).toBe('note2\nnote2 body');
  });

  it('inline copy of body text is plain text only and creates no note structure', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'bodytext');

    // Select a few characters inside the body (an inline, non-structural range).
    await remdo.mutate(() => {
      getNoteBody($findNoteById('note1')!)!.select(0, 0);
    });
    const bodyTextNode = getNoteBodyTextNode(remdo, 'note1');
    await collapseDomSelectionAtNode(bodyTextNode, 0);
    await extendDomSelectionToNode(bodyTextNode, 4);

    const clipboard = await copySelectionClipboardData(remdo);
    // Inline copy is just text — the rich payload is Lexical's default text copy,
    // not a whole-note structure; plain text is the selected characters.
    expect(clipboard.getData('text/plain')).toBe('body');
  });

  it('pasting a copied body-note over an inline selection keeps the body text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    await selectStructuralNotes(remdo, 'note2', 'note2');
    const payload = await copySelection(remdo);

    // Paste over an inline selection of note3: the note text replaces note3's
    // text and the body text follows as a child note — the body is not dropped.
    await selectEntireNote(remdo, 'note3');
    await pastePayload(remdo, payload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', body: 'note2 body' },
      { noteId: 'note3', text: 'note2', children: [{ noteId: null, text: 'note2 body' }] },
    ]);
  });

  it('enter inside a body inserts a line break instead of creating a note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'one');
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'two');

    // No new note was created; the body holds a line break (read as '\n')
    // between the two typed segments.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'one\ntwo' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('enter confirms an @ note-link inside a body instead of inserting a line break', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'see @note2');
    await pressKey(remdo, { key: 'Enter' });

    // The picker confirmed the link (body shows the linked title and a trailing
    // space), and Enter did not insert a line break.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'see note2 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(JSON.stringify(remdo.getEditorState())).not.toContain('"linebreak"');
  });

  it('tab confirms an @ note-link inside a body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'see @note3');
    await pressKey(remdo, { key: 'Tab' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'see note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('the @ link picker inside a body excludes the body\'s own note (no self-link)', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'x');

    // With the caret in note1's body, the picker's note context is note1, so
    // note1 is filtered out of the candidates — a body link behaves like a
    // note-content link, and self-links are out of scope.
    const noteIds = remdo.validate(() => {
      const anchor = $getSelection()!.getNodes().find($isTextNode)!;
      return $resolveLinkPickerOptions('', anchor).map((option) => option.noteId);
    });
    expect(noteIds).not.toContain('note1');
    expect(noteIds).toContain('note2');
  });

  it('enter at the end of a note that has a body inserts the new sibling after the body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'b');

    // Caret at the end of note1, then Enter: the new note must land after the
    // body, never between note1 and its body.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'b' },
      { noteId: null, text: 'X' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});

// Vertical arrow navigation is transparent to a body: it lands where it would if
// the body were not there. jsdom does not move the caret on arrow keys, so these
// exercise the model-level skip directly (placing the caret, then invoking the
// redirect the arrow command performs).
describe('note body vertical navigation (docs/outliner/body.md)', () => {
  async function addBodyTo(remdo: RemdoTestApi, noteId: string, text: string) {
    await placeCaretAtNote(remdo, noteId, Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, text);
  }

  it('down from a flat note with a body lands on the next sibling, skipping the body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBodyTo(remdo, 'note1', 'body');
    await placeCaretAtNote(remdo, 'note1', 0);

    let handled = false;
    await remdo.mutate(() => {
      handled = $skipBodyForVerticalNav('down');
    });
    expect(handled).toBe(true);
    expect(readCaretNoteId(remdo)).toBe('note2');
  });

  it('down from a note with a body and children lands on the first child, skipping the body', meta({ fixture: 'tree' }), async ({ remdo }) => {
    // tree: note1; note2 > note3. Body on note2 (which has child note3).
    await addBodyTo(remdo, 'note2', 'body');
    await placeCaretAtNote(remdo, 'note2', 0);

    let handled = false;
    await remdo.mutate(() => {
      handled = $skipBodyForVerticalNav('down');
    });
    expect(handled).toBe(true);
    expect(readCaretNoteId(remdo)).toBe('note3');
  });

  it('up into a nested body redirects to the body owner, not the body', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    // note2 > note3 (leaf); note4 is note2's sibling. Body on note3 renders just
    // above note4, so Up from note4 must reach note3, not its body.
    await addBodyTo(remdo, 'note3', 'body');
    await placeCaretAtNote(remdo, 'note4', 0);

    let handled = false;
    await remdo.mutate(() => {
      handled = $skipBodyForVerticalNav('up');
    });
    expect(handled).toBe(true);
    expect(readCaretNoteId(remdo)).toBe('note3');
  });

  it('up from a note not below any body is left to native movement', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBodyTo(remdo, 'note1', 'body');
    await placeCaretAtNote(remdo, 'note3', 0);

    // note3 sits below note2 (no body), so the body skip does not apply.
    const handled = remdo.validate(() => $skipBodyForVerticalNav('up'));
    expect(handled).toBe(false);
  });
});
