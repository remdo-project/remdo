import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentNote } from '#note-sdk';
import { HomeView } from './HomeView';
import type { HomeViewProps } from './HomeView';

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
  favorites: [],
  tags: [],
  recents: [],
  onSelectDocument: vi.fn(),
  onCreateDocument: vi.fn(),
  onUploadDocument: vi.fn(),
  resolveDocument: (docId) => documentNote({ id: docId, title: docId }),
});

const renderHome = (props: HomeViewProps) =>
  render(
    <MantineProvider>
      <HomeView {...props} />
    </MantineProvider>
  );

describe('home view', () => {
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

  it('omits the Favorites, Tags, and Recents groups when they are empty', () => {
    renderHome(baseProps());

    expect(screen.queryByRole('group', { name: 'Favorites' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Recents' })).toBeNull();
  });

  it('shows entry-point groups that have entries', () => {
    const props = baseProps();
    props.favorites = [{ id: 'doc-a', label: 'Project Roadmap' }];
    props.recents = [{ id: 'doc-c', label: 'Team notes' }];
    renderHome(props);

    expect(screen.getByRole('group', { name: 'Favorites' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Recents' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull();
  });

  it('creates a document via the New action', () => {
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Project Roadmap' })[0]!);
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
        view.rerender(<MantineProvider><HomeView {...props} /></MantineProvider>);
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

  it('uploads the chosen file via the Upload action', () => {
    const props = baseProps();
    renderHome(props);

    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    const input = screen.getByLabelText(/upload document/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(props.onUploadDocument).toHaveBeenCalledWith(file);
  });
});
