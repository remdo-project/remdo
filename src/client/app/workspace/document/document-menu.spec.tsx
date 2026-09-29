import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentNote } from '#note-sdk';
import { TestMantineProvider } from '#tests';
import { DocumentMenu } from './DocumentMenu';

const documentNote = (
  { canRename = false, canShareWith = false, canDelete = false } = {},
): DocumentNote => ({
  getId: () => 'doc-a',
  getText: () => 'Ideas',
  canRename: () => canRename,
  canShareWith: () => canShareWith,
  canDelete: () => canDelete,
} as unknown as DocumentNote);

const openView = () => ({ zoomOut: vi.fn(), foldToLevel: vi.fn() });

const renderMenu = (props: Partial<Parameters<typeof DocumentMenu>[0]> = {}) => {
  render(
    <TestMantineProvider>
      <DocumentMenu
        label="Ideas"
        note={documentNote({ canRename: true, canShareWith: true, canDelete: true })}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onShare={vi.fn()}
        {...props}
      />
    </TestMantineProvider>
  );
};

const openMenu = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Ideas' }));
  return screen.findByRole('menu');
};

const itemNames = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('document menu', () => {
  it('offers only document actions without an open document view', async () => {
    renderMenu();
    await openMenu();

    expect(itemNames()).toEqual(['Rename…', 'Share…', 'Delete…']);
  });

  it('adds the view actions after the document actions when a view is open', async () => {
    renderMenu({ view: openView() });
    await openMenu();

    expect(itemNames()).toEqual(['Rename…', 'Share…', 'Delete…', 'Zoom out', 'Fold to level [0-9]']);
  });

  it('keeps the view actions for a viewer with no document capability', async () => {
    renderMenu({ note: documentNote(), view: openView() });
    await openMenu();

    expect(itemNames()).toEqual(['Zoom out', 'Fold to level [0-9]']);
  });

  it('has no button when nothing can be offered', () => {
    renderMenu({ note: documentNote() });

    expect(screen.queryByRole('button', { name: 'Actions for Ideas' })).toBeNull();
  });

  it('zooms out from its item', async () => {
    const view = openView();
    renderMenu({ view });
    await openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom out' }));

    expect(view.zoomOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('applies fold level 1 from its item', async () => {
    const view = openView();
    renderMenu({ view });
    await openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Fold to level [0-9]' }));

    expect(view.foldToLevel).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('runs the view actions from their accelerators and closes the menu', async () => {
    const view = openView();
    renderMenu({ view });
    const menu = await openMenu();

    fireEvent.keyDown(menu, { key: '5' });
    expect(view.foldToLevel).toHaveBeenCalledExactlyOnceWith(5);
    expect(screen.queryByRole('menu')).toBeNull();

    await openMenu();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'O' });
    expect(view.zoomOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('ignores the view accelerators when no view is open', async () => {
    renderMenu();
    const menu = await openMenu();

    fireEvent.keyDown(menu, { key: '5' });

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
