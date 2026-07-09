import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('#client/dev/DevVisibility');
  vi.doUnmock('@lexical/react/LexicalComposer');
  vi.doUnmock('@lexical/react/LexicalContentEditable');
  vi.doUnmock('@lexical/react/LexicalErrorBoundary');
  vi.doUnmock('@lexical/react/LexicalComposerContext');
  vi.doUnmock('@lexical/react/LexicalListPlugin');
  vi.doUnmock('@lexical/react/LexicalRichTextPlugin');
  vi.doUnmock('@lexical/react/LexicalTabIndentationPlugin');
  vi.doUnmock('@lexical/react/LexicalTreeView');
  vi.resetModules();
});

describe('vanilla Lexical editor dev visibility', () => {
  it('wraps the dev route content in the visibility gate', async () => {
    vi.resetModules();
    vi.doMock('#client/dev/DevVisibility', () => ({
      DevVisibilityGate: ({ children }: { children: React.ReactNode }) => (
        <section data-testid="dev-visibility-gate">{children}</section>
      ),
    }));
    vi.doMock('@lexical/react/LexicalComposer', () => ({
      LexicalComposer: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
    }));
    vi.doMock('@lexical/react/LexicalContentEditable', () => ({
      ContentEditable: ({ className }: { className?: string }) => <div className={className}>Editable</div>,
    }));
    vi.doMock('@lexical/react/LexicalErrorBoundary', () => ({
      LexicalErrorBoundary: () => null,
    }));
    vi.doMock('@lexical/react/LexicalComposerContext', () => {
      const hookExport = 'useLexicalComposerContext';
      return {
        [hookExport]: () => [{}],
      };
    });
    vi.doMock('@lexical/react/LexicalListPlugin', () => ({
      ListPlugin: () => <section>List plugin</section>,
    }));
    vi.doMock('@lexical/react/LexicalRichTextPlugin', () => ({
      RichTextPlugin: ({
        contentEditable,
        placeholder,
      }: {
        contentEditable: React.ReactNode;
        placeholder: React.ReactNode;
      }) => (
        <section>
          {contentEditable}
          {placeholder}
        </section>
      ),
    }));
    vi.doMock('@lexical/react/LexicalTabIndentationPlugin', () => ({
      TabIndentationPlugin: () => <section>Tab indentation</section>,
    }));
    vi.doMock('@lexical/react/LexicalTreeView', () => ({
      TreeView: () => <section>Vanilla tree view</section>,
    }));
    const { default: VanillaLexicalEditor } = await import('./VanillaLexicalEditor');
    render(<VanillaLexicalEditor />);
    const gate = screen.getByTestId('dev-visibility-gate');

    expect(within(gate).getByText('Editable')).toBeInTheDocument();
    expect(within(gate).getByText('Vanilla tree view')).toBeInTheDocument();
  });
});
