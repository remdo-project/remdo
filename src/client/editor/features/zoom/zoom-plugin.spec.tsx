import { waitFor } from '@testing-library/react';
import type { TextNode } from 'lexical';
import { describe, expect, it } from 'vitest';
import {
  getNoteElement,
  meta,
  placeCaretAtNote,
  readCaretNoteId,
} from '#tests';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { ZOOM_OUT_COMMAND, ZOOM_TO_NOTE_COMMAND } from '#client/editor/foundation/commands';
import { $resolveViewRoot } from '#client/editor/outline/view-root';
import { $getNoteId } from '#client/editor/runtime/note-ids/note-id-state';
import type { RemdoTestApi } from '#client/editor/dev';

describe('zoom plugin', () => {
  it(
    'advances repeated outward commands before the routed view catches up',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note3' } }),
    async ({ remdo }) => {
      // Controlled viewProps keep the rendered route at note3 throughout.
      await waitFor(() => {
        expect(getNoteElement(remdo, 'note3')).toHaveAttribute('data-zoom-root', 'true');
      });

      for (const [parent, branch] of [['note2', 'note3'], ['note1', 'note2'], [null, 'note1']] as const) {
        await remdo.dispatchCommand(ZOOM_OUT_COMMAND, undefined);
        const rootId = remdo.editor.getEditorState().read(() => {
          const root = $resolveViewRoot(remdo.editor);
          return root ? $getNoteId(root) : null;
        });
        expect(rootId).toBe(parent);
        expect(readCaretNoteId(remdo)).toBe(branch);
      }
    }
  );

  function expectVisibleNotes(remdo: RemdoTestApi, visibleNoteIds: string[], hiddenNoteIds: string[]) {
    for (const noteId of visibleNoteIds) {
      expect(getNoteElement(remdo, noteId)).not.toHaveClass('zoom-hidden');
    }
    for (const noteId of hiddenNoteIds) {
      expect(getNoteElement(remdo, noteId)).toHaveClass('zoom-hidden');
    }
  }

  it(
    'marks the zoom root and shows its direct children',
    meta({ fixture: 'basic', viewProps: { zoomNoteId: 'note1' } }),
    async ({ remdo }) => {
      await waitFor(() => {
        expectVisibleNotes(remdo, ['note1', 'note2'], []);
        expect(getNoteElement(remdo, 'note1')).toHaveAttribute('data-zoom-root', 'true');
      });
    }
  );

  it(
    'places the caret on a zoomed leaf note when the zoom command is dispatched',
    meta({ fixture: 'basic' }),
    async ({ remdo }) => {
      await remdo.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId: 'note2' });

      await waitFor(() => {
        expect(readCaretNoteId(remdo)).toBe('note2');
      });
    }
  );

  it(
    'places the caret in the first child when zooming into a parent note',
    meta({ fixture: 'basic' }),
    async ({ remdo }) => {
      await remdo.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId: 'note1' });

      await waitFor(() => {
        expect(readCaretNoteId(remdo)).toBe('note2');
      });
    }
  );

  it(
    'keeps the caret on the root when zooming the active root again',
    meta({ fixture: 'basic', viewProps: { zoomNoteId: 'note1' } }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note1');

      await remdo.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId: 'note1' });

      await waitFor(() => {
        expect(readCaretNoteId(remdo)).toBe('note1');
      });
    }
  );

  it(
    'keeps the visible zoom subtree stable when an outside note is edited',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }),
    async ({ remdo }) => {
      await remdo.waitForSynced();

      await remdo.mutate(() => {
        const note4 = $findNoteById('note4')!;
        const textNode = note4.getFirstChild()!;
        (textNode as TextNode).setTextContent('note4!');
      });

      await waitFor(() => {
        expectVisibleNotes(remdo, ['note2', 'note3'], ['note1', 'note4', 'note5', 'note6']);
        expect(getNoteElement(remdo, 'note2')).toHaveAttribute('data-zoom-root', 'true');
      });
    }
  );

});
