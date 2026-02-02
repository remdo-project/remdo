import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';

const MAX_LABEL_LENGTH = 20;

const truncateLabel = (label: string) => {
  if (label.length <= MAX_LABEL_LENGTH) {
    return label;
  }
  return `${label.slice(0, MAX_LABEL_LENGTH)}...`;
};

const renderBreadcrumbs = (props: Parameters<typeof ZoomBreadcrumbs>[0]) =>
  render(
    <MantineProvider>
      <ZoomBreadcrumbs {...props} />
    </MantineProvider>
  );

describe('zoom breadcrumbs', () => {
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
    expect(container.querySelector('[data-zoom-crumb=\"current\"]')).toBeNull();
  });

  it('renders ancestor crumbs as buttons and the current crumb as text', async () => {
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

    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: truncateLabel(ancestorLabel) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: truncateLabel(currentLabel) })).toBeNull();
    expect(screen.getByText(truncateLabel(currentLabel))).toBeInTheDocument();

    screen.getByRole('button', { name: 'project' }).click();
    screen.getByRole('button', { name: truncateLabel(ancestorLabel) }).click();

    expect(onSelect).toHaveBeenNthCalledWith(1, null);
    expect(onSelect).toHaveBeenNthCalledWith(2, 'note1');
  });
});
