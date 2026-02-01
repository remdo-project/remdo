import { $isTextNode } from 'lexical';
import type { TextNode } from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import { clearEditorProps, getNoteElement, meta, registerEditorProps } from '#tests';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { $findNoteById } from '@/editor/outline/note-traversal';

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

  const zoomAutoSpy = vi.fn();
  const zoomAutoKey = createEditorPropsKey('zoom-auto', { zoomNoteId: 'note2', onZoomNoteIdChange: zoomAutoSpy });
  const zoomAutoPathNoteSpy = vi.fn();
  const zoomAutoPathSpy = vi.fn();
  const zoomAutoPathKey = createEditorPropsKey('zoom-auto-path', {
    zoomNoteId: 'note2',
    onZoomNoteIdChange: zoomAutoPathNoteSpy,
    onZoomPathChange: zoomAutoPathSpy,
  });

  it(
    'auto-expands zoom to the nearest shared ancestor for outside edits',
    meta({ fixture: 'tree-complex', editorPropsKey: zoomAutoKey }),
    async ({ remdo }) => {
      await remdo.waitForSynced();
      zoomAutoSpy.mockClear();

      await remdo.mutate(() => {
        const note4 = $findNoteById('note4')!;
        const textNode = note4.getFirstChild()!;
        (textNode as TextNode).setTextContent('note4!');
      });

      await waitForCall(() => {
        expect(zoomAutoSpy).toHaveBeenCalledWith('note1');
      });

      clearEditorProps(zoomAutoKey);
    }
  );

  it(
    'emits the updated zoom path when auto-zoom expands the view',
    meta({ fixture: 'tree-complex', editorPropsKey: zoomAutoPathKey }),
    async ({ remdo }) => {
      await remdo.waitForSynced();

      await waitForCall(() => {
        expect(zoomAutoPathSpy).toHaveBeenCalled();
      });

      zoomAutoPathSpy.mockClear();
      zoomAutoPathNoteSpy.mockClear();

      await remdo.mutate(() => {
        const note4 = $findNoteById('note4');
        if (!note4) {
          return;
        }
        const textNode = note4.getFirstChild();
        if ($isTextNode(textNode)) {
          textNode.setTextContent('note4!');
        }
      });

      await waitForCall(() => {
        expect(zoomAutoPathNoteSpy).toHaveBeenCalledWith('note1');
      });

      await waitForCall(() => {
        expect(zoomAutoPathSpy).toHaveBeenCalled();
      });

      const lastPath = zoomAutoPathSpy.mock.calls.at(-1)?.[0] as NotePathItem[];
      expect(lastPath.map((item) => item.noteId)).toEqual(['note1']);
      expect(lastPath.map((item) => item.label)).toEqual(['note1']);

      clearEditorProps(zoomAutoPathKey);
    }
  );
});
