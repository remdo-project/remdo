import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUserDataRootNote } from '#note-sdk';
import type { DocumentNote, DocumentSourceNote } from '#note-sdk';
import { HomeView } from './HomeView';
import type { HomeViewProps } from './HomeView';
import { TestMantineProvider, setCoarsePointer } from '#tests';

const documentNote = (
  { id, title, rename = vi.fn(), remove = vi.fn(), canRename = true, canShareWith = false, canDelete = false, recipients = 0 }:
  {
    id: string;
    title: string;
    rename?: () => unknown;
    remove?: () => unknown;
    canRename?: boolean;
    canShareWith?: boolean;
    canDelete?: boolean;
    recipients?: number;
  },
): DocumentNote => ({
  getId: () => id,
  getText: () => title,
  getSharingSuggestions: () => [],
  access: {
    getChildren: () => Array.from({ length: recipients }, (_, index) => ({
      getEmail: () => `recipient-${index}@example.test`,
      getId: () => `recipient-${index}`,
      getName: () => '',
      getText: () => `recipient-${index}@example.test`,
    })),
  },
  subscribe: () => vi.fn(),
  canRename: () => canRename,
  canShareWith: () => canShareWith,
  canDelete: () => canDelete,
  rename,
  delete: remove,
} as unknown as DocumentNote);

const sourceNote = ({ id, label, documents }: {
  id: string;
  label: string;
  documents: readonly DocumentNote[];
}): DocumentSourceNote => ({
  getId: () => id,
  getText: () => label,
  documents: { getChildren: () => documents },
} as unknown as DocumentSourceNote);

const openRenameDialog = async (name: string) => {
  fireEvent.click(screen.getAllByRole('button', { name: `Actions for ${name}` })[0]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
  return screen.getByLabelText('Document name');
};

const baseProps = (
  makeDocument: (document: { id: string; title: string }) => DocumentNote = documentNote,
): HomeViewProps => ({
  sources: [
    sourceNote({
      id: 'local',
      label: 'Local',
      documents: [
        makeDocument({ id: 'docA', title: 'Project Roadmap' }),
        makeDocument({ id: 'docB', title: 'Ideas' }),
      ],
    }),
    sourceNote({
      id: 'server',
      label: 'team-server.dev',
      documents: [makeDocument({ id: 'docC', title: 'Team notes' })],
    }),
  ],
  onSelectDocument: vi.fn(),
  onCreateDocument: vi.fn(),
  onUploadDocument: vi.fn(),
});

const renderHome = (props: HomeViewProps) =>
  render(
    <TestMantineProvider>
      <HomeView {...props} />
    </TestMantineProvider>
  );

const longName = `${'Quarterly planning '.repeat(4)}appendix`;
const searchProps = (): HomeViewProps => {
  const props = baseProps();
  props.sources = [sourceNote({
    id: 'local',
    label: 'Local',
    documents: [
      documentNote({ id: 'docA', title: 'Project Roadmap' }),
      documentNote({ id: 'docB', title: 'Ideas' }),
      documentNote({ id: 'docC', title: 'Roadmap ideas' }),
      documentNote({ id: 'doc-d', title: longName }),
    ],
  })];
  return props;
};

const rowOf = (name: string) => screen.getByRole('button', { name }).closest('li')!;

const searchField = () => screen.getByRole('combobox', { name: 'Search documents' });
const typeQuery = (value: string) => fireEvent.change(searchField(), { target: { value } });
const listedNames = () => [...document.querySelectorAll('.home-doc-label')].map((label) => label.textContent);

describe('home view', () => {
  afterEach(() => setCoarsePointer(false));

  it('starts at the first document with available actions', () => {
    const props = baseProps(note => documentNote({ ...note, canRename: note.id === 'docC' }));
    renderHome(props);

    expect(screen.getByRole('button', { name: 'Actions for Team notes' }).closest('li'))
      .toHaveAttribute('data-menu-target', 'true');
    expect(screen.queryByRole('button', { name: 'Actions for Project Roadmap' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for Ideas' })).toBeNull();
  });

  it('falls back to an available document when its target leaves the listing', () => {
    const props = baseProps();
    const view = renderHome(props);
    fireEvent.focus(screen.getByRole('button', { name: 'Actions for Ideas' }));
    expect(screen.getByRole('button', { name: 'Actions for Ideas' }).closest('li')).toHaveAttribute('data-menu-target', 'true');

    props.sources = [sourceNote({ id: 'local', label: 'Local', documents: [documentNote({ id: 'docA', title: 'Project Roadmap' })] })];
    view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);

    expect(screen.getByRole('button', { name: 'Actions for Project Roadmap' }).closest('li'))
      .toHaveAttribute('data-menu-target', 'true');
  });

  describe('active row', () => {
    const highlighted = () => [...document.querySelectorAll('[data-highlighted]')]
      .map((row) => row.querySelector('.home-doc-label')?.textContent);
    const menuTarget = () => document.querySelector('[data-menu-target] .home-doc-label')?.textContent;
    const listOf = () => document.getElementById(searchField().getAttribute('aria-controls')!)!;

    it('keeps one highlighted row with the menu button on it through pointer and search keys', () => {
      renderHome(searchProps());

      fireEvent.pointerMove(rowOf('Ideas'));
      expect(highlighted()).toEqual(['Ideas']);
      expect(menuTarget()).toBe('Ideas');
      expect(rowOf('Ideas')).toHaveAttribute('data-highlighted', 'pointer');

      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      expect(highlighted()).toEqual(['Roadmap ideas']);
      expect(menuTarget()).toBe('Roadmap ideas');
      expect(rowOf('Roadmap ideas')).toHaveAttribute('data-highlighted', 'keyboard');

      fireEvent.pointerMove(rowOf('Project Roadmap'));
      expect(highlighted()).toEqual(['Project Roadmap']);
      expect(menuTarget()).toBe('Project Roadmap');
    });

    it('moves the menu button with keyboard focus and with keys inside another row', () => {
      renderHome(searchProps());

      fireEvent.keyDown(document.body, { key: 'Tab' });
      fireEvent.focus(screen.getByRole('button', { name: 'Actions for Ideas' }));
      expect(rowOf('Ideas')).toHaveAttribute('data-highlighted', 'keyboard');
      expect(menuTarget()).toBe('Ideas');

      fireEvent.keyDown(screen.getByRole('button', { name: 'Roadmap ideas' }), { key: 'ArrowDown' });
      expect(highlighted()).toEqual(['Roadmap ideas']);
      expect(menuTarget()).toBe('Roadmap ideas');
    });

    it('opens the hovered document on Enter and continues the arrow keys from it', () => {
      const props = searchProps();
      renderHome(props);
      fireEvent.pointerMove(rowOf('Ideas'));

      fireEvent.keyDown(searchField(), { key: 'Enter' });
      expect(props.onSelectDocument).toHaveBeenCalledExactlyOnceWith('docB');

      fireEvent.keyDown(searchField(), { key: 'ArrowUp' });
      expect(highlighted()).toEqual(['Project Roadmap']);
    });

    it('clears a pointer tint when the pointer leaves the list and keeps a keyboard tint', () => {
      renderHome(searchProps());
      fireEvent.pointerMove(rowOf('Ideas'));

      fireEvent.pointerLeave(listOf());
      expect(highlighted()).toEqual([]);
      expect(menuTarget()).toBe('Ideas');

      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      expect(highlighted()).toEqual(['Project Roadmap']);
      fireEvent.pointerLeave(listOf());
      expect(highlighted()).toEqual(['Project Roadmap']);
    });

    it('returns to the first match when the query changes after a pointer tint', () => {
      renderHome(searchProps());
      typeQuery('road');
      fireEvent.pointerMove(rowOf('Roadmap ideas'));
      expect(highlighted()).toEqual(['Roadmap ideas']);

      typeQuery('roadm');

      expect(highlighted()).toEqual(['Project Roadmap']);
    });

    it('tints a row without actions without a menu button and keeps one button on an available row at rest', () => {
      renderHome({
        ...baseProps(),
        sources: [sourceNote({
          id: 'local',
          label: 'Local',
          documents: [
            documentNote({ id: 'docA', title: 'Project Roadmap', canRename: false }),
            documentNote({ id: 'docB', title: 'Ideas' }),
          ],
        })],
      });

      fireEvent.pointerMove(rowOf('Project Roadmap'));
      expect(highlighted()).toEqual(['Project Roadmap']);
      expect(menuTarget()).toBe('Project Roadmap');
      expect(screen.queryByRole('button', { name: 'Actions for Project Roadmap' })).toBeNull();

      fireEvent.pointerLeave(listOf());
      expect(highlighted()).toEqual([]);
      expect(menuTarget()).toBe('Ideas');
    });

    it('clears a pointer tint when the pointer moves off the rows within the list', () => {
      renderHome(searchProps());
      fireEvent.pointerMove(rowOf('Ideas'));

      fireEvent.pointerMove(screen.getByRole('heading', { name: 'Local' }));

      expect(highlighted()).toEqual([]);
      expect(menuTarget()).toBe('Ideas');
    });

    it('keeps the tint while a menu is open and clears it once the menu closes with the pointer elsewhere', async () => {
      renderHome(searchProps());
      const list = listOf();
      fireEvent.pointerMove(rowOf('Ideas'));
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Ideas' }));
      await screen.findByRole('menu');

      fireEvent.pointerLeave(list);
      fireEvent.pointerMove(screen.getByRole('menu'));
      expect(highlighted()).toEqual(['Ideas']);

      const underlay = document.querySelector('[data-testid="underlay"]')!;
      fireEvent.pointerDown(underlay);
      fireEvent.pointerUp(underlay);
      fireEvent.click(underlay);
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      fireEvent.focus(screen.getByRole('button', { name: 'Actions for Ideas' }));
      expect(highlighted()).toEqual([]);
      expect(menuTarget()).toBe('Ideas');
    });

    it('keeps the menu button on the last chosen row when it loses its actions and returns it when they come back', () => {
      let ideasActions = true;
      const props = searchProps();
      props.sources = [sourceNote({
        id: 'local',
        label: 'Local',
        documents: [
          documentNote({ id: 'docA', title: 'Project Roadmap' }),
          { ...documentNote({ id: 'docB', title: 'Ideas' }), canRename: () => ideasActions },
        ],
      })];
      const view = renderHome(props);
      fireEvent.pointerMove(rowOf('Ideas'));
      fireEvent.pointerLeave(listOf());
      expect(menuTarget()).toBe('Ideas');

      ideasActions = false;
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      expect(menuTarget()).toBe('Project Roadmap');

      ideasActions = true;
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      expect(menuTarget()).toBe('Ideas');
    });

    it('chooses the row a pointer press lands on even without a prior move', () => {
      renderHome(searchProps());

      fireEvent.pointerDown(rowOf('Ideas'));
      fireEvent.focus(screen.getByRole('button', { name: 'Actions for Ideas' }));

      expect(highlighted()).toEqual(['Ideas']);
      expect(rowOf('Ideas')).toHaveAttribute('data-highlighted', 'pointer');
    });

    it('ignores the focus a pointer action restores while the pointer is outside the list', () => {
      renderHome(searchProps());

      fireEvent.pointerDown(document.body);
      fireEvent.focus(screen.getByRole('button', { name: 'Actions for Ideas' }));

      expect(highlighted()).toEqual([]);
    });

    it('does not scroll when the pointer leaving hands the highlight back to the first match', () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      try {
        renderHome(searchProps());
        typeQuery('road');
        expect(scrollIntoView).toHaveBeenCalled();
        fireEvent.pointerMove(rowOf('Roadmap ideas'));
        scrollIntoView.mockClear();

        fireEvent.pointerLeave(listOf());
        expect(highlighted()).toEqual(['Project Roadmap']);
        expect(scrollIntoView).not.toHaveBeenCalled();

        fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      } finally {
        scrollIntoView.mockRestore();
      }
    });

    it('follows a pointer that scrolling moved onto another row or off the rows, but not a keyboard choice or an open menu', async () => {
      renderHome(searchProps());
      let underPointer: Element = rowOf('Roadmap ideas');
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => underPointer });
      const scrolled = () => act(async () => {
        fireEvent.scroll(document);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      try {
        fireEvent.pointerMove(rowOf('Ideas'));
        await scrolled();
        expect(highlighted()).toEqual(['Roadmap ideas']);
        expect(menuTarget()).toBe('Roadmap ideas');

        fireEvent.keyDown(document.body, { key: 'Shift' });
        underPointer = rowOf('Project Roadmap');
        await scrolled();
        expect(highlighted()).toEqual(['Project Roadmap']);

        underPointer = document.body;
        await scrolled();
        expect(highlighted()).toEqual([]);
        expect(menuTarget()).toBe('Project Roadmap');

        fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
        underPointer = rowOf('Ideas');
        await scrolled();
        expect(highlighted()).toEqual(['Project Roadmap']);

        const otherRow = rowOf('Roadmap ideas');
        fireEvent.pointerMove(rowOf('Ideas'));
        fireEvent.click(screen.getByRole('button', { name: 'Actions for Ideas' }));
        await screen.findByRole('menu');
        underPointer = otherRow;
        await scrolled();
        expect(highlighted()).toEqual(['Ideas']);
      } finally {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    });

    it('ignores touch movement and the focus a tap leaves behind', () => {
      renderHome(searchProps());

      fireEvent.pointerMove(rowOf('Ideas'), { pointerType: 'touch' });
      fireEvent.pointerDown(rowOf('Ideas'), { pointerType: 'touch' });
      fireEvent.focus(screen.getByRole('button', { name: 'Actions for Ideas' }));

      expect(highlighted()).toEqual([]);
      expect(menuTarget()).toBe('Project Roadmap');
    });
  });

  it('lists documents grouped under a heading per source', () => {
    renderHome(baseProps());

    const localGroup = screen.getByRole('group', { name: 'Local' });
    expect(within(localGroup).getByText('Project Roadmap')).toBeInTheDocument();
    expect(within(localGroup).getByText('Ideas')).toBeInTheDocument();

    const serverGroup = screen.getByRole('group', { name: 'team-server.dev' });
    expect(within(serverGroup).getByText('Team notes')).toBeInTheDocument();
  });

  it('opens a document when its row is activated', () => {
    const props = baseProps();
    renderHome(props);

    fireEvent.click(screen.getByText('Ideas'));

    expect(props.onSelectDocument).toHaveBeenCalledWith('docB');
  });

  it('omits a group that has no documents', () => {
    const props = baseProps();
    props.sources = [...props.sources, sourceNote({ id: 'empty', label: 'Empty server', documents: [] })];
    renderHome(props);

    expect(screen.getByRole('group', { name: 'Local' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Empty server' })).toBeNull();
  });

  it('marks documents shared with or by the user as Shared, leaving the accessible name unchanged', () => {
    const props = baseProps(note => documentNote({
      ...note,
      canShareWith: note.id !== 'docC',
      recipients: note.id === 'docB' ? 2 : 0,
    }));
    renderHome(props);

    const owned = screen.getByRole('button', { name: 'Project Roadmap' });
    const sharedByYou = screen.getByRole('button', { name: 'Ideas' });
    const sharedWithYou = screen.getByRole('button', { name: 'Team notes' });
    expect(owned).toHaveAccessibleDescription('');
    expect(within(owned).queryByText('Shared')).toBeNull();
    expect(sharedByYou).toHaveAccessibleDescription('Shared by you');
    expect(sharedWithYou).toHaveAccessibleDescription('Shared with you');
    expect(within(sharedWithYou).getByText('Shared')).toHaveAttribute('title', 'Shared with you');
    expect(screen.getByRole('button', { name: 'Shared by you, manage sharing for Ideas' }))
      .toHaveAttribute('title', 'Shared by you');
  });

  it('opens the sharing surface from the marker of a document the user shared, not from a received one', async () => {
    const props = baseProps(note => documentNote({
      ...note,
      canShareWith: note.id !== 'docC',
      recipients: note.id === 'docB' ? 1 : 0,
    }));
    renderHome(props);

    expect(screen.queryByRole('button', { name: /manage sharing for Team notes/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /manage sharing for Project Roadmap/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Shared by you, manage sharing for Ideas' }));

    const dialog = await screen.findByRole('dialog', { name: 'Share “Ideas”' });
    expect(within(dialog).getByText('recipient-0@example.test')).toBeInTheDocument();
  });

  it('invokes the New document action', () => {
    const props = baseProps();
    renderHome(props);

    fireEvent.click(screen.getByRole('button', { name: /new document/i }));

    expect(props.onCreateDocument).toHaveBeenCalledTimes(1);
  });

  it('submits a trimmed new name through the row menu', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    const props = baseProps(note => documentNote({ ...note, rename: note.id === 'docB' ? rename : vi.fn() }));
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: '  Renamed Ideas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(rename).toHaveBeenCalledExactlyOnceWith('Renamed Ideas'));
  });

  it('rejects an empty name without calling the source', async () => {
    const rename = vi.fn();
    const props = baseProps(note => documentNote({ ...note, rename }));
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a document name.');
    expect(rename).not.toHaveBeenCalled();
  });

  it('keeps the draft and shows the failure when the source rejects the rename', async () => {
    const rename = vi.fn().mockRejectedValue(new Error('Document is no longer available.'));
    const props = baseProps(note => documentNote({ ...note, rename }));
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Document is no longer available.');
    expect(screen.getByLabelText('Document name')).toHaveValue('Renamed');
  });

  it('closes without a write when the opening name is submitted unchanged', async () => {
    const rename = vi.fn();
    const props = baseProps(note => documentNote({ ...note, rename }));
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: '  Ideas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(screen.queryByLabelText('Document name')).toBeNull());
    expect(rename).not.toHaveBeenCalled();
  });

  it('closes without a write when a stored name carrying edge whitespace is resubmitted', async () => {
    const rename = vi.fn();
    const props = baseProps(note => documentNote({ ...note, title: note.id === 'docB' ? '  Ideas  ' : note.title, rename }));
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: 'Ideas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(screen.queryByLabelText('Document name')).toBeNull());
    expect(rename).not.toHaveBeenCalled();
  });

  it('blocks dismissal and repeat submission while a rename is pending', async () => {
    let settle!: () => void;
    const rename = vi.fn().mockReturnValue(new Promise<void>((resolve) => { settle = resolve; }));
    const props = baseProps(note => documentNote({ ...note, rename }));
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByLabelText('Document name')).toBeInTheDocument();
    expect(rename).toHaveBeenCalledTimes(1);

    settle();
    await waitFor(() => expect(screen.queryByLabelText('Document name')).toBeNull());
  });

  it('offers sharing only for a document the user can share', async () => {
    const props = baseProps(note => documentNote({ ...note, canShareWith: note.id === 'docB' }));
    renderHome(props);

    fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Ideas' })[0]!);
    expect(await screen.findByRole('menuitem', { name: 'Share…' })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Actions for Project Roadmap' }))[0]!);
    expect(await screen.findByRole('menuitem', { name: 'Rename…' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Share…' })).toBeNull();
  });

  it('omits deletion for a document the user cannot delete', async () => {
    const props = baseProps(note => documentNote({ ...note, canDelete: false }));
    renderHome(props);

    fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Ideas' })[0]!);
    expect(await screen.findByRole('menuitem', { name: 'Rename…' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete…' })).toBeNull();
  });

  it('deletes only after confirmation and focuses the heading once the row is gone', async () => {
    const props = baseProps();
    let view: ReturnType<typeof renderHome>;
    // The listing reaches Home after the deletion settles, as a query cache
    // notification does, so the dialog closes while the row still exists.
    const remove = vi.fn().mockImplementation(async () => {
      setTimeout(() => {
        props.sources = [sourceNote({ id: 'local', label: 'Local', documents: [documentNote({ id: 'docA', title: 'Project Roadmap' })] })];
        view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      });
    });
    props.sources = [baseProps(note => documentNote({ ...note, canDelete: true, remove })).sources[0]!];
    view = renderHome(props);

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ideas' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    expect(screen.getByRole('heading', { name: 'Delete “Ideas”?' })).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Ideas')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Actions for Project Roadmap' }).closest('li'))
      .toHaveAttribute('data-menu-target', 'true');
  });

  it('keeps the document and shows the failure when the source refuses deletion', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('Could not delete the document. Please retry.'));
    const props = baseProps(note => documentNote({ ...note, canDelete: true, remove }));
    renderHome(props);

    fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Ideas' })[0]!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the document. Please retry.');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('omits the menu for a document that cannot be renamed', () => {
    const props = baseProps(note => documentNote({ ...note, canRename: false, canShareWith: false }));
    renderHome(props);

    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });

  describe('document search', () => {
    it('keeps documents whose full name holds every token in any case, in list order', () => {
      renderHome(searchProps());

      typeQuery('  IDEAS road ');

      expect(listedNames()).toEqual(['Roadmap ideas']);
      typeQuery('road');
      expect(listedNames()).toEqual(['Project Roadmap', 'Roadmap ideas']);
      typeQuery('appendix');
      expect(listedNames()).toEqual([expect.stringMatching(/^Quarterly planning .*\.\.\.$/u)]);
    });

    it('lists every document for a blank query and says so when nothing matches', () => {
      renderHome(searchProps());

      typeQuery('   ');
      expect(listedNames()).toHaveLength(4);
      expect(screen.queryByText('No documents match')).toBeNull();

      typeQuery('zzz');
      expect(screen.getByText('No documents match')).toBeInTheDocument();
      expect(screen.queryByRole('group')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('0 documents');
    });

    it('highlights nothing for an empty query and the first match otherwise', () => {
      renderHome(searchProps());

      expect(document.querySelector('[data-highlighted]')).toBeNull();
      expect(searchField()).not.toHaveAttribute('aria-activedescendant');

      typeQuery('road');
      expect(rowOf('Project Roadmap')).toHaveAttribute('data-highlighted', 'keyboard');
      expect(rowOf('Roadmap ideas')).not.toHaveAttribute('data-highlighted');
      expect(searchField()).toHaveAttribute('aria-activedescendant', screen.getByRole('button', { name: 'Project Roadmap' }).id);
      expect(screen.getByRole('status')).toHaveTextContent('2 documents');
    });

    it('moves the highlight without wrapping and starts on the first document from none', () => {
      renderHome(searchProps());
      const active = () => document.querySelector('[data-highlighted] .home-doc-label')?.textContent ?? null;

      fireEvent.keyDown(searchField(), { key: 'ArrowUp' });
      expect(active()).toBeNull();
      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      expect(active()).toBe('Project Roadmap');
      fireEvent.keyDown(searchField(), { key: 'ArrowUp' });
      expect(active()).toBe('Project Roadmap');
      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      expect(active()).toMatch(/^Quarterly planning/u);
    });

    it('opens the highlighted document on Enter and does nothing without one', () => {
      const props = searchProps();
      renderHome(props);

      fireEvent.keyDown(searchField(), { key: 'Enter' });
      expect(props.onSelectDocument).not.toHaveBeenCalled();

      typeQuery('ideas');
      fireEvent.keyDown(searchField(), { key: 'ArrowDown' });
      fireEvent.keyDown(searchField(), { key: 'Enter' });
      expect(props.onSelectDocument).toHaveBeenCalledExactlyOnceWith('docC');
    });

    it('ignores Enter during input-method composition', () => {
      const props = searchProps();
      renderHome(props);
      typeQuery('ideas');

      fireEvent.compositionStart(searchField());
      fireEvent.keyDown(searchField(), { key: 'Enter' });
      expect(props.onSelectDocument).not.toHaveBeenCalled();

      fireEvent.compositionEnd(searchField());
      fireEvent.keyDown(searchField(), { key: 'Enter' });
      expect(props.onSelectDocument).toHaveBeenCalledExactlyOnceWith('docB');
    });

    it('clears the query on Escape and keeps focus in the field', () => {
      renderHome(searchProps());
      typeQuery('ideas');
      searchField().focus();

      fireEvent.keyDown(searchField(), { key: 'Escape' });

      expect(searchField()).toHaveValue('');
      expect(searchField()).toHaveFocus();
      expect(listedNames()).toHaveLength(4);
    });

    it('keeps the query through listing updates and omits the field with no documents', () => {
      const props = searchProps();
      const view = renderHome(props);
      typeQuery('ideas');

      props.sources = [sourceNote({ id: 'local', label: 'Local', documents: [documentNote({ id: 'docB', title: 'Ideas' })] })];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      expect(searchField()).toHaveValue('ideas');
      expect(listedNames()).toEqual(['Ideas']);

      props.sources = [];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('uses current note names for filtering and rendering when the same references are read again', () => {
      let documents = [{ id: 'draft', title: 'Draft', shareable: true }];
      const userData = createUserDataRootNote({
        getChildren: () => documents,
        getById: id => documents.find(document => document.id === id) ?? null,
      });
      const props = baseProps();
      props.sources = userData.sources.getChildren();
      const view = renderHome(props);
      typeQuery('final');
      expect(screen.getByText('No documents match')).toBeInTheDocument();

      documents = [{ id: 'draft', title: 'Final notes', shareable: true }];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);

      expect(searchField()).toHaveValue('final');
      expect(listedNames()).toEqual(['Final notes']);
      fireEvent.click(screen.getByRole('button', { name: 'Final notes' }));
      expect(props.onSelectDocument).toHaveBeenCalledExactlyOnceWith('draft');
    });

    it('moves the menu target to a visible document when filtering hides it', () => {
      renderHome(searchProps());
      const rowOf = (name: string) => screen.getByRole('button', { name: `Actions for ${name}` }).closest('li');
      expect(rowOf('Project Roadmap')).toHaveAttribute('data-menu-target', 'true');

      typeQuery('ideas');

      expect(rowOf('Ideas')).toHaveAttribute('data-menu-target', 'true');
      expect(screen.queryByRole('button', { name: 'Actions for Project Roadmap' })).toBeNull();
    });

    it('takes arrival focus on a fine pointer', () => {
      renderHome(searchProps());
      expect(searchField()).toHaveFocus();
    });

    it('keeps the heading focused on a touch device unless focus is requested', () => {
      setCoarsePointer(true);
      const view = renderHome(searchProps());
      expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus();
      view.unmount();

      renderHome({ ...searchProps(), focusSearchRequested: true });
      expect(searchField()).toHaveFocus();
    });

    it('takes arrival focus once the listing arrives while focus is still free', () => {
      const props = searchProps();
      const source = props.sources[0]!;
      props.sources = [];
      const view = renderHome(props);
      expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus();

      props.sources = [source];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);

      expect(searchField()).toHaveFocus();
    });

    it('leaves focus alone when the listing arrives after the user moved on', () => {
      const props = searchProps();
      const source = props.sources[0]!;
      props.sources = [];
      const view = renderHome(props);
      screen.getByRole('button', { name: 'New document' }).focus();

      props.sources = [source];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);

      expect(screen.getByRole('button', { name: 'New document' })).toHaveFocus();
    });

    it('leaves Cmd/Ctrl+K to the browser while there is no search box', () => {
      const props = searchProps();
      props.sources = [];
      renderHome(props);

      expect(fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })).toBe(true);
    });

    it('focuses the field on Cmd/Ctrl+K from anywhere on Home, except under a modal dialog', () => {
      renderHome(searchProps());
      screen.getByRole('button', { name: 'New document' }).focus();

      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
      expect(searchField()).toHaveFocus();

      screen.getByRole('button', { name: 'New document' }).focus();
      const overlay = document.body.appendChild(document.createElement('div'));
      overlay.className = 'remdo-modal-overlay';
      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
      expect(screen.getByRole('button', { name: 'New document' })).toHaveFocus();
      overlay.remove();
    });
  });

  it('uploads the chosen file via the Upload action', () => {
    const props = baseProps();
    renderHome(props);

    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    const input = screen.getByLabelText(/upload document/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(props.onUploadDocument).toHaveBeenCalledWith(file);
  });
});
