import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentNote } from '#note-sdk';
import { HomeView } from './HomeView';
import type { HomeViewProps } from './HomeView';
import { TestMantineProvider, setCoarsePointer } from '#tests';

const documentNote = (
  { id, title, rename = vi.fn(), remove = vi.fn(), canRename = true, canShareWith = false, canDelete = false }:
  {
    id: string;
    title: string;
    rename?: () => unknown;
    remove?: () => unknown;
    canRename?: boolean;
    canShareWith?: boolean;
    canDelete?: boolean;
  },
): DocumentNote => ({
  getId: () => id,
  getText: () => title,
  canRename: () => canRename,
  canShareWith: () => canShareWith,
  canDelete: () => canDelete,
  rename,
  delete: remove,
} as unknown as DocumentNote);

const openRenameDialog = async (name: string) => {
  fireEvent.click(screen.getAllByRole('button', { name: `Actions for ${name}` })[0]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
  return screen.getByLabelText('Document name');
};

const baseProps = (): HomeViewProps => ({
  sources: [
    {
      id: 'local',
      label: 'Local',
      documents: [
        { id: 'doc-a', label: 'Project Roadmap' },
        { id: 'doc-b', label: 'Ideas' },
      ],
    },
    {
      id: 'server',
      label: 'team-server.dev',
      documents: [{ id: 'doc-c', label: 'Team notes' }],
    },
  ],
  onSelectDocument: vi.fn(),
  onCreateDocument: vi.fn(),
  onUploadDocument: vi.fn(),
  resolveDocument: (docId) => documentNote({ id: docId, title: docId }),
});

const renderHome = (props: HomeViewProps) =>
  render(
    <TestMantineProvider>
      <HomeView {...props} />
    </TestMantineProvider>
  );

const searchField = () => screen.getByRole('combobox', { name: 'Search documents' });
const typeQuery = (value: string) => fireEvent.change(searchField(), { target: { value } });
const listedNames = () => [...document.querySelectorAll('.home-doc-label')].map((label) => label.textContent);

describe('home view', () => {
  afterEach(() => setCoarsePointer(false));

  it('starts at the first document with available actions', () => {
    const props = baseProps();
    props.resolveDocument = (docId) => docId === 'doc-a'
      ? null
      : documentNote({ id: docId, title: docId, canRename: docId === 'doc-c' });
    renderHome(props);

    expect(screen.getByRole('button', { name: 'Actions for Team notes' }).closest('li'))
      .toHaveAttribute('data-menu-target', 'true');
    expect(screen.queryByRole('button', { name: 'Actions for Project Roadmap' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for Ideas' })).toBeNull();
  });

  it('falls back when its target loses its menu and keeps the replacement when that menu returns', () => {
    const props = baseProps();
    let ideasAvailable = true;
    props.resolveDocument = (docId) => documentNote({
      id: docId,
      title: docId,
      canRename: docId !== 'doc-b' || ideasAvailable,
    });
    const view = renderHome(props);
    const roadmap = screen.getByRole('button', { name: 'Actions for Project Roadmap' });
    const ideas = screen.getByRole('button', { name: 'Actions for Ideas' });
    fireEvent.focus(ideas);
    expect(ideas.closest('li')).toHaveAttribute('data-menu-target', 'true');

    ideasAvailable = false;
    view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
    expect(screen.queryByRole('button', { name: 'Actions for Ideas' })).toBeNull();
    expect(roadmap.closest('li')).toHaveAttribute('data-menu-target', 'true');

    ideasAvailable = true;
    view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
    expect(roadmap.closest('li')).toHaveAttribute('data-menu-target', 'true');
    expect(screen.getByRole('button', { name: 'Actions for Ideas' }).closest('li'))
      .not.toHaveAttribute('data-menu-target');
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

    expect(props.onSelectDocument).toHaveBeenCalledWith('doc-b');
  });

  it('omits a group that has no documents', () => {
    const props = baseProps();
    props.sources = [...props.sources, { id: 'empty', label: 'Empty server', documents: [] }];
    renderHome(props);

    expect(screen.getByRole('group', { name: 'Local' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Empty server' })).toBeNull();
  });

  it('marks only documents the user cannot share as Shared, leaving the accessible name unchanged', () => {
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: docId, canShareWith: docId === 'doc-a' });
    renderHome(props);

    const owned = screen.getByRole('button', { name: 'Project Roadmap' });
    const shared = screen.getByRole('button', { name: 'Ideas' });
    expect(owned).toHaveAccessibleDescription('');
    expect(shared).toHaveAccessibleDescription('Shared with you');
    expect(within(shared).getByText('Shared')).toBeInTheDocument();
    expect(within(owned).queryByText('Shared')).toBeNull();
  });

  it('invokes the New document action', () => {
    const props = baseProps();
    renderHome(props);

    fireEvent.click(screen.getByRole('button', { name: /new document/i }));

    expect(props.onCreateDocument).toHaveBeenCalledTimes(1);
  });

  it('submits a trimmed new name through the row menu', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', rename });
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: '  Renamed Ideas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(rename).toHaveBeenCalledWith('Renamed Ideas'));
  });

  it('rejects an empty name without calling the source', async () => {
    const rename = vi.fn();
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', rename });
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a document name.');
    expect(rename).not.toHaveBeenCalled();
  });

  it('keeps the draft and shows the failure when the source rejects the rename', async () => {
    const rename = vi.fn().mockRejectedValue(new Error('Document is no longer available.'));
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', rename });
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Document is no longer available.');
    expect(screen.getByLabelText('Document name')).toHaveValue('Renamed');
  });

  it('closes without a write when the opening name is submitted unchanged', async () => {
    const rename = vi.fn();
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', rename });
    renderHome(props);

    const input = await openRenameDialog('Ideas');
    fireEvent.change(input, { target: { value: '  Ideas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(screen.queryByLabelText('Document name')).toBeNull());
    expect(rename).not.toHaveBeenCalled();
  });

  it('closes without a write when a stored name carrying edge whitespace is resubmitted', async () => {
    const rename = vi.fn();
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: '  Ideas  ', rename });
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
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', rename });
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
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', canShareWith: docId === 'doc-b' });
    renderHome(props);

    fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Ideas' })[0]!);
    expect(await screen.findByRole('menuitem', { name: 'Share…' })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Actions for Project Roadmap' }))[0]!);
    expect(await screen.findByRole('menuitem', { name: 'Rename…' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Share…' })).toBeNull();
  });

  it('omits deletion for a document the user cannot delete', async () => {
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: docId, canDelete: false });
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
        props.sources = [{ id: 'local', label: 'Local', documents: [{ id: 'doc-a', label: 'Project Roadmap' }] }];
        view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      });
    });
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', canDelete: true, remove });
    props.sources = [{ id: 'local', label: 'Local', documents: baseProps().sources[0]!.documents }];
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
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', canDelete: true, remove });
    renderHome(props);

    fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Ideas' })[0]!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the document. Please retry.');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('omits the menu for a document that cannot be renamed', () => {
    const props = baseProps();
    props.resolveDocument = (docId) => documentNote({ id: docId, title: 'Ideas', canRename: false, canShareWith: false });
    renderHome(props);

    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });

  describe('document search', () => {
    const longName = `${'Quarterly planning '.repeat(4)}appendix`;
    const searchProps = (): HomeViewProps => {
      const props = baseProps();
      props.sources = [{
        id: 'local',
        label: 'Local',
        documents: [
          { id: 'doc-a', label: 'Project Roadmap' },
          { id: 'doc-b', label: 'Ideas' },
          { id: 'doc-c', label: 'Roadmap ideas' },
          { id: 'doc-d', label: longName },
        ],
      }];
      return props;
    };

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
      const rowOf = (name: string) => screen.getByRole('button', { name }).closest('li');

      expect(document.querySelector('[data-search-active]')).toBeNull();
      expect(searchField()).not.toHaveAttribute('aria-activedescendant');

      typeQuery('road');
      expect(rowOf('Project Roadmap')).toHaveAttribute('data-search-active', 'true');
      expect(rowOf('Roadmap ideas')).not.toHaveAttribute('data-search-active');
      expect(searchField()).toHaveAttribute('aria-activedescendant', screen.getByRole('button', { name: 'Project Roadmap' }).id);
      expect(screen.getByRole('status')).toHaveTextContent('2 documents');
    });

    it('moves the highlight without wrapping and starts on the first document from none', () => {
      renderHome(searchProps());
      const active = () => document.querySelector('[data-search-active] .home-doc-label')?.textContent ?? null;

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
      expect(props.onSelectDocument).toHaveBeenCalledExactlyOnceWith('doc-c');
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
      expect(props.onSelectDocument).toHaveBeenCalledExactlyOnceWith('doc-b');
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

      props.sources = [{ id: 'local', label: 'Local', documents: [{ id: 'doc-b', label: 'Ideas' }] }];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      expect(searchField()).toHaveValue('ideas');
      expect(listedNames()).toEqual(['Ideas']);

      props.sources = [];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);
      expect(screen.queryByRole('combobox')).toBeNull();
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
      const documents = props.sources[0]!.documents;
      props.sources = [];
      const view = renderHome(props);
      expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus();

      props.sources = [{ id: 'local', label: 'Local', documents }];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);

      expect(searchField()).toHaveFocus();
    });

    it('leaves focus alone when the listing arrives after the user moved on', () => {
      const props = searchProps();
      const documents = props.sources[0]!.documents;
      props.sources = [];
      const view = renderHome(props);
      screen.getByRole('button', { name: 'New document' }).focus();

      props.sources = [{ id: 'local', label: 'Local', documents }];
      view.rerender(<TestMantineProvider><HomeView {...props} /></TestMantineProvider>);

      expect(screen.getByRole('button', { name: 'New document' })).toHaveFocus();
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
