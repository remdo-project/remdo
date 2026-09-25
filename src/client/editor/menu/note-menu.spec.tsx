import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OPEN_NOTE_MENU_COMMAND } from '#client/editor/foundation/commands';
import { handleNoteMenuShortcut } from '#client/editor/menu/note-menu-shortcuts';
import { getNoteElement, getNoteKey, meta, placeCaretAtNote } from '#tests';
import { $findNoteById } from '#client/editor/outline/note-traversal';

const createShortcutEvent = (key: string) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

describe('quick action menu (docs/specs/outliner/menu.md)', () => {
  it('resolves the focus note when opened without an explicit row', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');

    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, undefined);

    await waitFor(() => {
      expect(document.querySelector('[data-note-menu]')).not.toBeNull();
    });
  });

  it('shows note, children, and view sections', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: noteKey });

    await waitFor(() => {
      expect(document.querySelector('[data-note-menu]')).not.toBeNull();
    });

    expect(document.querySelector('[data-note-menu-section="note"]')?.textContent).toBe('Note');
    expect(document.querySelector('[data-note-menu-section="children"]')?.textContent).toBe('Children');
    expect(document.querySelector('[data-note-menu-section="view"]')?.textContent).toBe('View');
    expect(document.querySelector('[data-note-menu-item="toggle-checked"]')).not.toBeNull();
    expect(document.querySelector('[data-note-menu-item="zoom"]')).not.toBeNull();
    expect(document.querySelector('[data-note-menu-item="list-check"]')).not.toBeNull();
    expect(document.querySelector('[data-note-menu-item="list-bullet"]')).not.toBeNull();
    expect(document.querySelector('[data-note-menu-item="view-fold-to-level"]')).not.toBeNull();
  });

  it('refreshes the open menu when the addressed note changes', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: getNoteKey(remdo, 'note1') });
    await waitFor(() => expect(document.querySelector('[data-note-menu-note-id="note1"]')).not.toBeNull());

    await remdo.documentSession.noteRef('note1').setChildListType('check');
    await remdo.documentSession.noteRef('note1').toggleFold();

    await waitFor(() => {
      expect(document.querySelector('[data-note-menu-item="list-check"]')).toBeNull();
      expect(document.querySelector('[data-note-menu-item="list-number"]')).not.toBeNull();
      expect(document.querySelector('[data-note-menu-item="fold"]')?.textContent).toBe('Unfold');
    });
  });

  it('executes against the same note after editor keys are replaced while open', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    const oldKey = getNoteKey(remdo, 'note2');
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: oldKey });
    await waitFor(() => expect(document.querySelector('[data-note-menu]')).not.toBeNull());
    remdo.editor.setEditorState(remdo.editor.parseEditorState(JSON.stringify(remdo.getEditorState())));
    expect(getNoteKey(remdo, 'note2')).not.toBe(oldKey);

    fireEvent.click(document.querySelector('[data-note-menu-item="fold"]')!);

    await waitFor(() => {
      expect(document.querySelector('[data-note-menu]')).toBeNull();
      expect(remdo.documentSession.noteRef('note2').getFolded()).toBe(true);
    });
    expect(remdo.documentSession.noteRef('note1').getFolded()).toBe(false);
  });

  it('closes when its addressed note disappears', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: getNoteKey(remdo, 'note3') });
    await waitFor(() => expect(document.querySelector('[data-note-menu]')).not.toBeNull());

    await remdo.mutate(() => $findNoteById('note3')!.remove());

    await waitFor(() => expect(document.querySelector('[data-note-menu]')).toBeNull());
  });

  it('stays open when the window scrolls', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: noteKey });
    await waitFor(() => {
      expect(document.querySelector('[data-note-menu]')).not.toBeNull();
    });

    fireEvent.scroll(window);

    expect(document.querySelector('[data-note-menu]')).not.toBeNull();
  });

  it('does not move focus into the editor on outside pointer dismiss', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: noteKey });
    await waitFor(() => {
      expect(document.querySelector('[data-note-menu]')).not.toBeNull();
    });

    const editorRoot = remdo.editor.getRootElement();
    expect(editorRoot).not.toBeNull();
    const outside = document.createElement('button');
    document.body.append(outside);
    fireEvent.pointerDown(outside);

    await waitFor(() => {
      expect(document.querySelector('[data-note-menu]')).toBeNull();
    });
    expect(document.activeElement).not.toBe(editorRoot);
    outside.remove();
  });

  it('routes digit shortcuts to fold view levels', () => {
    const event = createShortcutEvent('1');
    const foldViewToLevel = vi.fn();
    const actions = {
      foldViewToLevel,
      toggleFold: vi.fn(),
      zoom: vi.fn(),
    };

    expect(handleNoteMenuShortcut(event, actions)).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(foldViewToLevel).toHaveBeenCalledWith(1);
    expect(actions.toggleFold).not.toHaveBeenCalled();
    expect(actions.zoom).not.toHaveBeenCalled();
  });

  it('routes F only when the fold action is available', () => {
    const event = createShortcutEvent('f');
    const toggleFold = vi.fn();
    const actions = {
      foldViewToLevel: vi.fn(),
      toggleFold,
      zoom: vi.fn(),
    };

    expect(handleNoteMenuShortcut(event, actions)).toBe(true);
    expect(toggleFold).toHaveBeenCalledTimes(1);

    toggleFold.mockClear();
    expect(handleNoteMenuShortcut(createShortcutEvent('f'), {
      ...actions,
      toggleFold: undefined,
    })).toBe(false);
    expect(toggleFold).not.toHaveBeenCalled();
  });

  it('hides Fold for the zoom root but not for its descendants', meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }), async ({ remdo }) => {
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: getNoteKey(remdo, 'note1') });
    await waitFor(() => expect(document.querySelector('[data-note-menu-note-id="note1"]')).not.toBeNull());
    expect(document.querySelector('[data-note-menu-item="fold"]')).toBeNull();
    fireEvent.keyDown(document.querySelector('[data-note-menu]')!, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[data-note-menu]')).toBeNull());

    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: getNoteKey(remdo, 'note2') });
    await waitFor(() => expect(document.querySelector('[data-note-menu-note-id="note2"]')).not.toBeNull());
    expect(document.querySelector('[data-note-menu-item="fold"]')).not.toBeNull();
  });

  it('closes without failing when its note loses the action before the menu refreshes', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: getNoteKey(remdo, 'note2') });
    const convert = await waitFor(() => {
      const element = document.querySelector('[data-note-menu-item="list-number"]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });

    remdo.editor.update(() => $findNoteById('note3')!.remove(), { discrete: true });
    fireEvent.click(convert);

    await waitFor(() => expect(document.querySelector('[data-note-menu]')).toBeNull());
    expect(remdo.documentSession.noteRef('note2').getChildListType()).toBeNull();
  });

  it(
    'applies level 1 when fold to level is clicked',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }),
    async ({ remdo }) => {
      await waitFor(() => {
        expect(getNoteElement(remdo, 'note1')).toHaveAttribute('data-zoom-root', 'true');
      });
      await placeCaretAtNote(remdo, 'note4');

      const note4Key = getNoteKey(remdo, 'note4');
      await remdo.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey: note4Key });

      const item = await waitFor(() => {
        const element = document.querySelector('[data-note-menu-item="view-fold-to-level"]');
        expect(element).not.toBeNull();
        return element as HTMLElement;
      });

      fireEvent.click(item);

      await waitFor(() => {
        expect(document.querySelector('[data-note-menu]')).toBeNull();
      });

      await waitFor(() => {
        expect(remdo).toMatchOutline([
          {
            noteId: 'note1',
            text: 'note1',
            children: [
              {
                noteId: 'note2',
                text: 'note2',
                folded: true,
                children: [{ noteId: 'note3', text: 'note3' }],
              },
              { noteId: 'note4', text: 'note4' },
            ],
          },
          { noteId: 'note5', text: 'note5' },
          {
            noteId: 'note6',
            text: 'note6',
            children: [{ noteId: 'note7', text: 'note7' }],
          },
        ]);
      });
    }
  );
});
