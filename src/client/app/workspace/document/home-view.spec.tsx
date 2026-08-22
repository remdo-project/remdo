import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeView } from './HomeView';
import type { HomeViewProps } from './HomeView';

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

  it('uploads the chosen file via the Upload action', () => {
    const props = baseProps();
    renderHome(props);

    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    const input = screen.getByLabelText(/upload document/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(props.onUploadDocument).toHaveBeenCalledWith(file);
  });
});
