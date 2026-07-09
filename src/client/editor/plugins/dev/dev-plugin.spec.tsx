import { render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('#client/dev/DevVisibility');
  vi.doUnmock('./ProhibitNestedLexicalUpdatesPlugin');
  vi.doUnmock('./SchemaValidationPlugin');
  vi.doUnmock('./TreeViewPlugin');
  vi.doUnmock('./TestBridgePlugin');
  vi.resetModules();
});

describe('dev plugin visibility', () => {
  it('wraps the visible editor tree view without wrapping dev test infrastructure', async () => {
    vi.resetModules();
    vi.doMock('#client/dev/DevVisibility', () => ({
      DevVisibilityGate: ({ children }: { children: React.ReactNode }) => (
        <section data-testid="dev-visibility-gate">{children}</section>
      ),
    }));
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
    const gate = view.getByTestId('dev-visibility-gate');

    expect(view.getByText('Nested-update guard')).toBeInTheDocument();
    expect(view.getByText('Schema validation')).toBeInTheDocument();
    expect(view.getByText('Test bridge')).toBeInTheDocument();
    expect(within(gate).getByText('Editor tree view')).toBeInTheDocument();
  });
});
