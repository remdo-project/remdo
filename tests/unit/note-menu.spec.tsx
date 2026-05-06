import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OPEN_NOTE_MENU_COMMAND } from '@/editor/commands';
import { handleNoteMenuShortcut } from '@/editor/plugins/note-menu-shortcuts';
import { getNoteKey, meta } from '#tests';

const createShortcutEvent = (key: string) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

describe('quick action menu (docs/outliner/menu.md)', () => {
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

  it('routes digit shortcuts to fold view levels', () => {
    const event = createShortcutEvent('1');
    const foldViewToLevel = vi.fn();
    const actions = {
      foldViewToLevel,
      toggleFold: vi.fn(),
      zoom: vi.fn(),
    };

    expect(handleNoteMenuShortcut(event, { hasChildren: false, isZoomRoot: true }, actions)).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(foldViewToLevel).toHaveBeenCalledWith(1);
    expect(actions.toggleFold).not.toHaveBeenCalled();
    expect(actions.zoom).not.toHaveBeenCalled();
  });

  it(
    'applies level 1 when fold to level is clicked',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }),
    async ({ remdo }) => {
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
    }
  );
});
