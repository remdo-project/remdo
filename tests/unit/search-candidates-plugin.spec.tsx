import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UpdateListener = (payload: {
  dirtyElements: Map<string, boolean>;
  dirtyLeaves: Set<string>;
}) => void;

interface MockEditor {
  getEditorState: () => { read: (callback: () => unknown) => unknown };
  registerUpdateListener: (listener: UpdateListener) => () => void;
  registerRootListener: (listener: () => void) => () => void;
}

let lexicalComposerContextEditor: MockEditor | null = null;
let registerSearchNotesReader: ReturnType<typeof vi.fn>;

function mockLexicalComposerContext() {
  return [lexicalComposerContextEditor] as const;
}

describe('search candidates plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    lexicalComposerContextEditor = null;
    registerSearchNotesReader = vi.fn();
  });

  async function renderPlugin() {
    let updateListener: UpdateListener | null = null;
    const mockEditor: MockEditor = {
      getEditorState: () => ({ read: (callback: () => unknown) => callback() }),
      registerUpdateListener: (listener) => {
        updateListener = listener;
        return () => {};
      },
      registerRootListener: () => () => {},
    };
    lexicalComposerContextEditor = mockEditor;

    vi.doMock('@lexical/react/LexicalComposerContext', () => ({
      useLexicalComposerContext: mockLexicalComposerContext,
    }));
    vi.doMock('#client/editor/note-sdk-adapters', () => ({
      createLexicalEditorNotes: () => ({}),
    }));
    vi.doMock('#client/editor/view/EditorViewProvider', () => ({
      // eslint-disable-next-line react/no-unnecessary-use-prefix -- Mock of a real hook; must keep the name.
      useRegisterSearchNotesReader: () => registerSearchNotesReader,
    }));

    const { SearchCandidatesPlugin } = await import('#client/editor/plugins/SearchCandidatesPlugin');
    const view = render(<SearchCandidatesPlugin docId="main" />);
    return { view, fireUpdate: (payload: Parameters<UpdateListener>[0]) => updateListener!(payload) };
  }

  it('registers a reader on mount and unregisters on unmount', async () => {
    const { view } = await renderPlugin();

    // Mount registers a reader (a function).
    expect(registerSearchNotesReader).toHaveBeenCalledTimes(1);
    expect(typeof registerSearchNotesReader.mock.calls[0]![0]).toBe('function');

    view.unmount();
    // Unmount clears the reader.
    expect(registerSearchNotesReader).toHaveBeenLastCalledWith(null);
  });

  it('re-registers on a content edit but not on a selection-only update', async () => {
    const { fireUpdate } = await renderPlugin();
    expect(registerSearchNotesReader).toHaveBeenCalledTimes(1);

    // Selection-only update (no dirty nodes) must not re-register.
    fireUpdate({ dirtyElements: new Map(), dirtyLeaves: new Set() });
    expect(registerSearchNotesReader).toHaveBeenCalledTimes(1);

    // A content edit re-registers, bumping the consumer's version.
    fireUpdate({ dirtyElements: new Map([['k', true]]), dirtyLeaves: new Set() });
    expect(registerSearchNotesReader).toHaveBeenCalledTimes(2);
  });

  it('the registered reader reads notes through an editor read', async () => {
    await renderPlugin();
    const reader = registerSearchNotesReader.mock.calls[0]![0] as <T>(fn: (notes: unknown) => T) => T;
    // The reader runs fn against the (mock) SDK notes and returns its result.
    expect(reader((notes) => notes)).toEqual({});
  });
});
