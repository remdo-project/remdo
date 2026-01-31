import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';

const renderBreadcrumbs = (props: Parameters<typeof ZoomBreadcrumbs>[0]) =>
  render(
    <MantineProvider>
      <ZoomBreadcrumbs {...props} />
    </MantineProvider>
  );

describe('zoom breadcrumbs', () => {
  it('renders the document crumb as the only item at the root', () => {
    const onSelect = vi.fn();
    const { container } = renderBreadcrumbs({ docLabel: 'project', path: [], onSelectNoteId: onSelect });

    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument();
    expect(container.querySelector('[data-zoom-crumb=\"ancestor\"]')).toBeNull();
    expect(container.querySelector('[data-zoom-crumb=\"current\"]')).toBeNull();
  });

  it('renders ancestor crumbs as buttons and the current crumb as text', async () => {
    const onSelect = vi.fn();
    renderBreadcrumbs({
      docLabel: 'project',
      path: [
        { noteId: 'note1', label: 'note1' },
        { noteId: 'note2', label: 'note2' },
      ],
      onSelectNoteId: onSelect,
    });

    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'note1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'note2' })).toBeNull();

    screen.getByRole('button', { name: 'project' }).click();
    screen.getByRole('button', { name: 'note1' }).click();

    expect(onSelect).toHaveBeenNthCalledWith(1, null);
    expect(onSelect).toHaveBeenNthCalledWith(2, 'note1');
  });
});
