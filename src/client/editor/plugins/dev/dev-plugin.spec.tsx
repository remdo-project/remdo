import { render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('./ProhibitNestedLexicalUpdatesPlugin');
  vi.doUnmock('./SchemaValidationPlugin');
  vi.doUnmock('./TreeViewPlugin');
  vi.doUnmock('./TestBridgePlugin');
  vi.resetModules();
});

describe('dev plugin visibility', () => {
  it('hides visible editor tooling without hiding dev test infrastructure', async () => {
    localStorage.setItem('remdo-dev-tooling-visible', 'false');
    vi.resetModules();
    vi.doMock('./ProhibitNestedLexicalUpdatesPlugin', () => ({
      ProhibitNestedLexicalUpdatesPlugin: () => <section>Nested-update guard</section>,
    }));
    vi.doMock('./SchemaValidationPlugin', () => ({
      SchemaValidationPlugin: () => <section>Schema validation</section>,
    }));
    vi.doMock('./TreeViewPlugin', () => ({
      TreeViewPlugin: () => <section>Editor tree view</section>,
    }));
    vi.doMock('./TestBridgePlugin', () => ({
      TestBridgePlugin: () => <section>Test bridge</section>,
    }));
    const { DevPlugin } = await import('./DevPlugin');
    const { container } = render(<DevPlugin />);
    const view = within(container);

    expect(view.getByText('Nested-update guard')).toBeInTheDocument();
    expect(view.getByText('Schema validation')).toBeInTheDocument();
    expect(view.getByText('Test bridge')).toBeInTheDocument();
    expect(view.queryByText('Editor tree view')).toBeNull();
  });
});
