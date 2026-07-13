import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoomBreadcrumbs } from './ZoomBreadcrumbs';
import { NAVIGATION_LABEL_MAX_LENGTH, UNTITLED_LABEL } from '#client/ui/navigation-label';

const truncateLabel = (label: string) => {
  if (label.length <= NAVIGATION_LABEL_MAX_LENGTH) {
    return label;
  }
  return `${label.slice(0, NAVIGATION_LABEL_MAX_LENGTH)}...`;
};

const renderBreadcrumbs = (props: Parameters<typeof ZoomBreadcrumbs>[0]) =>
  render(
    <MantineProvider>
      <ZoomBreadcrumbs {...props} />
    </MantineProvider>
  );

describe('zoom breadcrumbs', () => {
  it('renders a Home crumb that opens Home when provided', () => {
    const onSelect = vi.fn();
    const onSelectHome = vi.fn();
    renderBreadcrumbs({
      docLabel: 'project',
      onSelectHome,
      path: [],
      onSelectNoteId: onSelect,
    });

    const homeCrumb = screen.getByRole('button', { name: 'Home' });
    homeCrumb.click();

    expect(onSelectHome).toHaveBeenCalledTimes(1);
  });

  it('omits the Home crumb when no handler is provided', () => {
    const onSelect = vi.fn();
    renderBreadcrumbs({
      docLabel: 'project',
      path: [],
      onSelectNoteId: onSelect,
    });

    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
  });

  it('renders the document crumb as the only item at the root', () => {
    const onSelect = vi.fn();
    const docLabel = '1234567890123456789012345';
    const { container } = renderBreadcrumbs({
      docLabel,
      path: [],
      onSelectNoteId: onSelect,
    });

    expect(screen.getByRole('button', { name: truncateLabel(docLabel) })).toBeInTheDocument();
    expect(container.querySelector('[data-zoom-crumb=\"ancestor\"]')).toBeNull();
  });

  it('excludes the zoom root from the trail and renders ancestors as links', async () => {
    const onSelect = vi.fn();
    const ancestorLabel = 'abcdefghijklmnopqrstuvwxyz';
    const currentLabel = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    renderBreadcrumbs({
      docLabel: 'project',
      path: [
        { noteId: 'note1', label: ancestorLabel },
        { noteId: 'note2', label: currentLabel },
      ],
      onSelectNoteId: onSelect,
    });

    // Document + parent are links; the zoom root (last path item) is not a crumb.
    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: truncateLabel(ancestorLabel) })).toBeInTheDocument();
    expect(screen.queryByText(truncateLabel(currentLabel))).toBeNull();

    screen.getByRole('button', { name: 'project' }).click();
    screen.getByRole('button', { name: truncateLabel(ancestorLabel) }).click();

    expect(onSelect).toHaveBeenNthCalledWith(1, null);
    expect(onSelect).toHaveBeenNthCalledWith(2, 'note1');
  });

  it('shows only the document crumb when the zoom root is a top-level note', () => {
    const onSelect = vi.fn();
    renderBreadcrumbs({
      docLabel: 'project',
      path: [{ noteId: 'note1', label: 'note1' }],
      onSelectNoteId: onSelect,
    });

    // The single path item is the zoom root/title, so no note crumb renders.
    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'note1' })).toBeNull();
  });

  it('uses shared fallback labels for empty ancestor crumbs', () => {
    const onSelect = vi.fn();
    renderBreadcrumbs({
      docLabel: 'project',
      path: [
        { noteId: 'note1', label: '  \n ' },
        { noteId: 'note2', label: 'child' },
      ],
      onSelectNoteId: onSelect,
    });

    expect(screen.getByText(UNTITLED_LABEL)).toBeInTheDocument();
  });

  it('renders a custom document control instead of the default document button', () => {
    const onSelect = vi.fn();
    renderBreadcrumbs({
      docLabel: 'project',
      documentControl: (
        <select aria-label="Switch document">
          <option value="project">Project</option>
        </select>
      ),
      path: [],
      onSelectNoteId: onSelect,
    });

    expect(screen.getByRole('combobox', { name: 'Switch document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument();
  });
});
