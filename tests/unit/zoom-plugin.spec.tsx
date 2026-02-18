import { waitFor } from '@testing-library/react';
import type { TextNode } from 'lexical';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  clearEditorProps,
  getNoteElement,
  meta,
  placeCaretAtNote,
  pressKey,
  readCaretNoteId,
  registerScopedEditorProps,
} from '#tests';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { $findNoteById, $getNoteAncestorPath } from '@/editor/outline/note-traversal';
import { removeNoteSubtree } from '@/editor/outline/selection/tree';
import { ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';

describe('zoom plugin', () => {
  const zoomPathSpy = vi.fn();
  const zoomPathKey = registerScopedEditorProps('zoom-path', {
    zoomNoteId: 'note2',
    onZoomPathChange: zoomPathSpy,
  });
  it(
    'emits the zoom path for a valid zoom note id',
    meta({ fixture: 'basic', editorPropsKey: zoomPathKey }),
    async () => {
      await waitFor(() => {
        const match = zoomPathSpy.mock.calls.find((call) => {
          const path = call[0] as NotePathItem[] | undefined;
          if (!path) {
            return false;
          }
          const ids = path.map((item) => item.noteId);
          const labels = path.map((item) => item.label);
          return ids.join(',') === 'note1,note2' && labels.join(',') === 'note1,note2';
        });
        expect(match).toBeTruthy();
      });
    }
  );

  it(
    'emits breadcrumb labels for parent notes without concatenating descendant text',
    meta({ fixture: 'tree' }),
    async ({ remdo }) => {
      const path = remdo.validate(() => {
        const note = $findNoteById('note3')!;
        return $getNoteAncestorPath(note);
      });

      expect(path.map((item) => item.noteId)).toEqual(['note2', 'note3']);
      expect(path.map((item) => item.label)).toEqual(['note2', 'note3']);
    }
  );

  const zoomNoteSpy = vi.fn();
  const zoomNoteKey = registerScopedEditorProps('zoom-bullet', {
    zoomNoteId: null,
    onZoomNoteIdChange: zoomNoteSpy,
  });
  it(
    'requests zoom when the bullet is clicked',
    meta({ fixture: 'basic', editorPropsKey: zoomNoteKey }),
    async ({ remdo }) => {
      const noteElement = getNoteElement(remdo, 'note1');
      noteElement.style.paddingLeft = '16px';

      const event =
        typeof PointerEvent === 'undefined'
          ? new MouseEvent('pointerdown', { bubbles: true })
          : new PointerEvent('pointerdown', { bubbles: true });
      noteElement.dispatchEvent(event);

      await waitFor(() => {
        expect(zoomNoteSpy).toHaveBeenCalledWith('note1');
      });
    }
  );

  const zoomCommandSpy = vi.fn();
  const zoomCommandKey = registerScopedEditorProps('zoom-command', {
    zoomNoteId: null,
    onZoomNoteIdChange: zoomCommandSpy,
  });
  it(
    'requests zoom when the zoom command is dispatched',
    meta({ fixture: 'basic', editorPropsKey: zoomCommandKey }),
    async ({ remdo }) => {
      await remdo.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId: 'note2' });

      await waitFor(() => {
        expect(zoomCommandSpy).toHaveBeenCalledWith('note2');
      });

      await waitFor(() => {
        expect(readCaretNoteId(remdo)).toBe('note2');
      });
    }
  );

  const zoomStableNoteSpy = vi.fn();
  const zoomStablePathSpy = vi.fn();
  const zoomStableKey = registerScopedEditorProps('zoom-stable', {
    zoomNoteId: 'note2',
    onZoomNoteIdChange: zoomStableNoteSpy,
    onZoomPathChange: zoomStablePathSpy,
  });
  it(
    'keeps zoom stable when an outside note is edited',
    meta({ fixture: 'tree-complex', editorPropsKey: zoomStableKey }),
    async ({ remdo }) => {
      await remdo.waitForSynced();

      await waitFor(() => {
        expect(zoomStablePathSpy).toHaveBeenCalled();
      });
      zoomStableNoteSpy.mockClear();
      zoomStablePathSpy.mockClear();

      await remdo.mutate(() => {
        const note4 = $findNoteById('note4')!;
        const textNode = note4.getFirstChild()!;
        (textNode as TextNode).setTextContent('note4!');
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(zoomStableNoteSpy).not.toHaveBeenCalled();
      expect(zoomStablePathSpy).not.toHaveBeenCalled();
    }
  );

  const zoomResetSpy = vi.fn();
  const zoomResetPathSpy = vi.fn();
  const zoomResetKey = registerScopedEditorProps('zoom-reset', {
    zoomNoteId: 'note2',
    onZoomNoteIdChange: zoomResetSpy,
    onZoomPathChange: zoomResetPathSpy,
  });
  it(
    'requests zoom reset when the zoom root can no longer be resolved',
    meta({ fixture: 'tree', editorPropsKey: zoomResetKey }),
    async ({ remdo }) => {
      zoomResetSpy.mockClear();
      zoomResetPathSpy.mockClear();

      await remdo.mutate(() => {
        const zoomRoot = $findNoteById('note2')!;
        removeNoteSubtree(zoomRoot);
      });

      await waitFor(() => {
        expect(zoomResetSpy).toHaveBeenCalledWith(null);
      });

      await waitFor(() => {
        const emittedDocRootPath = zoomResetPathSpy.mock.calls.some((call) => {
          const path = call[0] as NotePathItem[] | undefined;
          return Array.isArray(path) && path.length === 0;
        });
        expect(emittedDocRootPath).toBe(true);
      });
    }
  );

  const zoomInsideSpy = vi.fn();
  const zoomInsideKey = registerScopedEditorProps('zoom-inside', {
    zoomNoteId: 'note1',
    onZoomNoteIdChange: zoomInsideSpy,
  });
  it(
    'does not re-zoom into a descendant when deleting an empty leaf inside the zoom root',
    meta({ fixture: 'tree', editorPropsKey: zoomInsideKey }),
    async ({ remdo }) => {
      await remdo.waitForSynced();
      zoomInsideSpy.mockClear();

      await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Tab' });

      await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      const emptyNoteId = readCaretNoteId(remdo);

      await placeCaretAtNote(remdo, emptyNoteId, 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(zoomInsideSpy).not.toHaveBeenCalled();
    }
  );

  afterAll(() => {
    clearEditorProps(zoomPathKey);
    clearEditorProps(zoomNoteKey);
    clearEditorProps(zoomCommandKey);
    clearEditorProps(zoomStableKey);
    clearEditorProps(zoomResetKey);
    clearEditorProps(zoomInsideKey);
  });
});
