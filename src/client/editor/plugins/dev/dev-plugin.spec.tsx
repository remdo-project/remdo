import { render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDevToolingVisible } from '#client/dev/dev-visibility-store';
import { VisibleTreeViewPlugin } from './DevPlugin';

vi.mock('./TreeViewPlugin', () => ({
  TreeViewPlugin: () => <section>Editor tree view</section>,
}));

describe('dev plugin visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    setDevToolingVisible(true);
  });

  it('hides visible editor tooling', () => {
    const { container, rerender } = render(<VisibleTreeViewPlugin />);
    const view = within(container);

    expect(view.getByText('Editor tree view')).toBeInTheDocument();

    setDevToolingVisible(false);
    rerender(<VisibleTreeViewPlugin />);

    expect(view.queryByText('Editor tree view')).toBeNull();
  });
});
