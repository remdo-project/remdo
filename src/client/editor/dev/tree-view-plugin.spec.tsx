import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TreeViewPlugin } from './TreeViewPlugin';

describe('tree view plugin visibility', () => {
  it('does not mount Lexical tree view content when dev tooling is hidden', () => {
    localStorage.setItem('remdo-dev-tooling-visible', 'false');
    const { container } = render(<TreeViewPlugin />);

    expect(container.querySelector('.editor-tree-view')).toBeNull();
  });
});
