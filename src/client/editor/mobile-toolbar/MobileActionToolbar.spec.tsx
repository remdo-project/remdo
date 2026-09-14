import { act, fireEvent, render, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentCapabilitiesSnapshot,
  DocumentSession,
  LoadState,
  SnapshotStore,
} from '#note-sdk';
import { MobileActionToolbar } from './MobileActionToolbar';

const browser = vi.hoisted(() => ({ coarsePointer: true }));
const originalDocumentFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

vi.mock('#client/browser/useVisualViewportBottom', () => ({
  useVisualViewportBottom: () => null,
}));

class MutableStore<T> implements SnapshotStore<T> {
  #snapshot: T;
  readonly #listeners = new Set<() => void>();

  constructor(snapshot: T) {
    this.#snapshot = snapshot;
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  publish(snapshot: T): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  get subscriberCount(): number {
    return this.#listeners.size;
  }
}

function readyCapabilities(
  options: {
    canToggleFold?: boolean;
    canDelete?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
  } = {},
): LoadState<DocumentCapabilitiesSnapshot> {
  return {
    status: 'ready',
    data: {
      focus: { canToggleFold: options.canToggleFold ?? false },
      selection: { canDelete: options.canDelete ?? false },
      history: { canUndo: options.canUndo ?? false, canRedo: options.canRedo ?? false },
    },
  };
}

function createSession(initialCapabilities: LoadState<DocumentCapabilitiesSnapshot>) {
  const capabilities = new MutableStore(initialCapabilities);
  const operations = {
    indent: vi.fn(),
    outdent: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    toggleChecked: vi.fn(),
    toggleFocusedFold: vi.fn(),
    toggleNoteFold: vi.fn(() => Promise.resolve()),
    delete: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  };
  const session: DocumentSession = {
    documentId: 'main',
    search: vi.fn(),
    capabilities,
    noteRef: (noteId) => ({
      getId: () => noteId,
      getText: () => '',
      getFolded: () => false,
      toggleFold: operations.toggleNoteFold,
      subscribe: () => () => {},
    }),
    focus: { toggleFold: operations.toggleFocusedFold },
    selection: {
      indent: operations.indent,
      outdent: operations.outdent,
      moveUp: operations.moveUp,
      moveDown: operations.moveDown,
      toggleChecked: operations.toggleChecked,
      delete: operations.delete,
    },
    history: { undo: operations.undo, redo: operations.redo },
  };
  return { capabilities, operations, session };
}

function renderToolbar(session: DocumentSession) {
  const portalRoot = document.createElement('div');
  portalRoot.dataset.mobileToolbarTestRoot = '';
  document.body.append(portalRoot);
  const focusEditor = vi.fn();
  const openNoteMenu = vi.fn();
  const result = render(
    <MobileActionToolbar
      session={session}
      portalRoot={portalRoot}
      focusEditor={focusEditor}
      openNoteMenu={openNoteMenu}
    />,
  );
  return { focusEditor, openNoteMenu, portalRoot, result, view: within(portalRoot) };
}

describe('mobile action toolbar', () => {
  beforeAll(() => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  });

  beforeEach(() => {
    browser.coarsePointer = true;
    vi.mocked(globalThis.matchMedia).mockImplementation((query) => ({
      matches: browser.coarsePointer,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    for (const root of document.querySelectorAll('[data-mobile-toolbar-test-root]')) {
      root.remove();
    }
  });

  afterAll(() => {
    if (originalDocumentFonts) {
      Object.defineProperty(document, 'fonts', originalDocumentFonts);
    } else {
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('does not subscribe or render for a fine pointer', () => {
    browser.coarsePointer = false;
    const { capabilities, session } = createSession(readyCapabilities());

    const { view } = renderToolbar(session);

    expect(capabilities.subscriberCount).toBe(0);
    expect(view.queryByRole('toolbar', { name: 'Note actions' })).toBeNull();
  });

  it('reflects capability changes using the surface-specific hide and disable rules', () => {
    const { capabilities, session } = createSession(readyCapabilities({
      canToggleFold: true,
      canDelete: true,
      canUndo: true,
      canRedo: false,
    }));
    const { view } = renderToolbar(session);

    expect(capabilities.subscriberCount).toBe(1);
    expect(view.getByRole('button', { name: 'Toggle fold' })).not.toHaveAttribute('aria-disabled');
    expect(view.getByRole('button', { name: 'Delete' })).not.toHaveAttribute('aria-disabled');
    expect(view.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Redo' })).toHaveAttribute('aria-disabled', 'true');

    act(() => capabilities.publish(readyCapabilities({ canRedo: true })));

    const fold = view.getByRole('button', { name: 'Toggle fold' });
    expect(fold).toHaveAttribute('aria-disabled', 'true');
    expect(fold).not.toBeDisabled();
    expect(view.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
    expect(view.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(view.getByRole('button', { name: 'Redo' })).not.toHaveAttribute('aria-disabled');
  });

  it('delegates focus-targeted actions without reusing the capability snapshot target', () => {
    const { capabilities, operations, session } = createSession(readyCapabilities({
      canToggleFold: true,
      canDelete: true,
    }));
    const { focusEditor, openNoteMenu, view } = renderToolbar(session);

    fireEvent.click(view.getByRole('button', { name: 'Indent' }));
    fireEvent.click(view.getByRole('button', { name: 'Toggle fold' }));
    fireEvent.click(view.getByRole('button', { name: 'Note menu' }));

    expect(operations.indent).toHaveBeenCalledOnce();
    expect(operations.toggleFocusedFold).toHaveBeenCalledOnce();
    expect(operations.toggleNoteFold).not.toHaveBeenCalled();
    expect(openNoteMenu).toHaveBeenCalledOnce();
    expect(focusEditor).toHaveBeenCalledTimes(3);

    act(() => capabilities.publish(readyCapabilities()));
    fireEvent.click(view.getByRole('button', { name: 'Toggle fold' }));

    expect(operations.toggleFocusedFold).toHaveBeenCalledOnce();
    expect(focusEditor).toHaveBeenCalledTimes(3);
  });

  it('keeps loading capabilities unavailable without disabling always-enabled actions', () => {
    const { operations, session } = createSession({ status: 'loading' });
    const { focusEditor, view } = renderToolbar(session);

    expect(view.getByRole('button', { name: 'Toggle fold' })).toHaveAttribute('aria-disabled', 'true');
    expect(view.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
    expect(view.queryByRole('button', { name: 'Undo' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: 'Toggle done' }));
    expect(operations.toggleChecked).toHaveBeenCalledOnce();
    expect(focusEditor).toHaveBeenCalledOnce();
  });
});
