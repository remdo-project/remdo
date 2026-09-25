import { act, fireEvent, render, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenDocument } from '#note-sdk';
import { MobileActionToolbar } from './MobileActionToolbar';
import type { ToolbarCapabilities } from './useToolbarCapabilities';

const browser = vi.hoisted(() => ({ coarsePointer: true }));
const originalDocumentFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

vi.mock('#client/browser/useVisualViewportBottom', () => ({
  useVisualViewportBottom: () => null,
}));

class MutableCapabilities {
  #value: ToolbarCapabilities | Error;
  readonly #listeners = new Set<() => void>();

  constructor(value: ToolbarCapabilities | Error) {
    this.#value = value;
  }

  read = () => {
    if (this.#value instanceof Error) throw this.#value;
    return this.#value;
  };

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  publish(value: ToolbarCapabilities | Error): void {
    this.#value = value;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  get subscriberCount(): number {
    return this.#listeners.size;
  }
}

function readyCapabilities(options: Partial<ToolbarCapabilities> = {}): ToolbarCapabilities {
  return { canToggleFold: false, canDelete: false, canUndo: false, canRedo: false, ...options };
}

function createOpenDocument(initialCapabilities: ToolbarCapabilities | Error) {
  const capabilities = new MutableCapabilities(initialCapabilities);
  const operations = {
    indent: vi.fn(),
    outdent: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    toggleChecked: vi.fn(),
    toggleFocusedFold: vi.fn(),
    delete: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  };
  const openDocument: Pick<OpenDocument, 'subscribeCapabilities' | 'focus' | 'selection' | 'history'> = {
    subscribeCapabilities: capabilities.subscribe,
    focus: { canToggleFold: () => capabilities.read().canToggleFold, toggleFold: operations.toggleFocusedFold },
    selection: {
      canDelete: () => capabilities.read().canDelete,
      indent: operations.indent,
      outdent: operations.outdent,
      moveUp: operations.moveUp,
      moveDown: operations.moveDown,
      toggleChecked: operations.toggleChecked,
      delete: operations.delete,
    },
    history: {
      canUndo: () => capabilities.read().canUndo,
      canRedo: () => capabilities.read().canRedo,
      undo: operations.undo, redo: operations.redo,
    },
  };
  return { capabilities, operations, openDocument };
}

function renderToolbar(openDocument: Pick<OpenDocument, 'subscribeCapabilities' | 'focus' | 'selection' | 'history'>) {
  const portalRoot = document.createElement('div');
  portalRoot.dataset.mobileToolbarTestRoot = '';
  document.body.append(portalRoot);
  const focusEditor = vi.fn();
  const openNoteMenu = vi.fn();
  const result = render(
    <MobileActionToolbar
      openDocument={openDocument}
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
    const { capabilities, openDocument } = createOpenDocument(readyCapabilities());

    const { view } = renderToolbar(openDocument);

    expect(capabilities.subscriberCount).toBe(0);
    expect(view.queryByRole('toolbar', { name: 'Note actions' })).toBeNull();
  });

  it('reflects capability changes using the surface-specific hide and disable rules', () => {
    const { capabilities, openDocument } = createOpenDocument(readyCapabilities({
      canToggleFold: true,
      canDelete: true,
      canUndo: true,
      canRedo: false,
    }));
    const { view } = renderToolbar(openDocument);

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

  it('delegates focus-targeted actions without reusing the earlier capability target', () => {
    const { capabilities, operations, openDocument } = createOpenDocument(readyCapabilities({
      canToggleFold: true,
      canDelete: true,
    }));
    const { focusEditor, openNoteMenu, view } = renderToolbar(openDocument);

    fireEvent.click(view.getByRole('button', { name: 'Indent' }));
    fireEvent.click(view.getByRole('button', { name: 'Toggle fold' }));
    fireEvent.click(view.getByRole('button', { name: 'Note menu' }));

    expect(operations.indent).toHaveBeenCalledOnce();
    expect(operations.toggleFocusedFold).toHaveBeenCalledOnce();
    expect(openNoteMenu).toHaveBeenCalledOnce();
    expect(focusEditor).toHaveBeenCalledTimes(3);

    act(() => capabilities.publish(readyCapabilities()));
    fireEvent.click(view.getByRole('button', { name: 'Toggle fold' }));

    expect(operations.toggleFocusedFold).toHaveBeenCalledOnce();
    expect(focusEditor).toHaveBeenCalledTimes(3);
  });

  it('keeps unavailable capabilities unavailable without disabling always-enabled actions', () => {
    const { operations, openDocument } = createOpenDocument(readyCapabilities());
    const { focusEditor, view } = renderToolbar(openDocument);

    expect(view.getByRole('button', { name: 'Toggle fold' })).toHaveAttribute('aria-disabled', 'true');
    expect(view.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
    expect(view.queryByRole('button', { name: 'Undo' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: 'Toggle done' }));
    expect(operations.toggleChecked).toHaveBeenCalledOnce();
    expect(focusEditor).toHaveBeenCalledOnce();
  });

  it('disables conditional actions on a failed read and reflects recovery', () => {
    const { capabilities, openDocument } = createOpenDocument(new Error('Capability read failed'));
    const { result, view } = renderToolbar(openDocument);
    expect(view.getByRole('button', { name: 'Toggle fold' })).toHaveAttribute('aria-disabled', 'true');
    expect(view.queryByRole('button', { name: 'Undo' })).toBeNull();

    act(() => capabilities.publish(readyCapabilities({ canToggleFold: true, canUndo: true })));
    expect(view.getByRole('button', { name: 'Toggle fold' })).not.toHaveAttribute('aria-disabled');
    expect(view.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    result.unmount();
    expect(capabilities.subscriberCount).toBe(0);
  });
});
