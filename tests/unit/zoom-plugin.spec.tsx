import { describe, expect, it, vi } from 'vitest';
import { clearEditorProps, getNoteElement, meta, registerEditorProps } from '#tests';
import type { NotePathItem } from '@/editor/outline/note-traversal';

const waitForCall = async (fn: () => void) => {
  for (let i = 0; i < 20; i++) {
    try {
      fn();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  fn();
};

const createEditorPropsKey = (prefix: string, props: Parameters<typeof registerEditorProps>[1]) => {
  const key = `${prefix}-${Math.random().toString(36).slice(2)}`;
  registerEditorProps(key, props);
  return key;
};

describe('zoom plugin', () => {
  const zoomPathSpy = vi.fn();
  const zoomPathKey = createEditorPropsKey('zoom-path', { zoomNoteId: 'note2', onZoomPathChange: zoomPathSpy });

  it(
    'emits the zoom path for a valid zoom note id',
    meta({ fixture: 'basic', editorPropsKey: zoomPathKey }),
    async ({ remdo }) => {
      await remdo.waitForSynced();

      await waitForCall(() => {
        expect(zoomPathSpy).toHaveBeenCalled();
      });

      const lastPath = zoomPathSpy.mock.calls.at(-1)?.[0] as NotePathItem[];
      expect(lastPath.map((item) => item.noteId)).toEqual(['note1', 'note2']);
      expect(lastPath.map((item) => item.label)).toEqual(['note1', 'note2']);

      clearEditorProps(zoomPathKey);
    }
  );

  const zoomNoteSpy = vi.fn();
  const zoomNoteKey = createEditorPropsKey('zoom-bullet', { zoomNoteId: null, onZoomNoteIdChange: zoomNoteSpy });

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

      await waitForCall(() => {
        expect(zoomNoteSpy).toHaveBeenCalledWith('note1');
      });

      clearEditorProps(zoomNoteKey);
    }
  );
});
