import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestMantineProvider } from '#tests';
import { KeyboardReference } from './KeyboardReference';

const browser = vi.hoisted(() => ({ apple: true, coarsePointer: false }));

vi.mock('lexical', async (importOriginal) => ({
  ...await importOriginal<typeof import('lexical')>(),
  get IS_APPLE() {
    return browser.apple;
  },
}));

function renderReference() {
  const onClose = vi.fn();
  render(
    <TestMantineProvider>
      <input aria-label="Editor" />
      <KeyboardReference onClose={onClose} />
    </TestMantineProvider>,
  );
  return { onClose };
}

const toggle = () => screen.getByRole('button', { name: 'Keyboard reference' });

function openReference() {
  fireEvent.click(toggle());
  return screen.getByRole('dialog', { name: 'Keyboard reference' });
}

function keysOf(dialog: HTMLElement, action: string): (string | null)[] {
  const entry = within(dialog).getByText(action).closest('div')!;
  return [...entry.querySelectorAll('kbd')].map(
    (key) => key.querySelector('[aria-hidden]')?.textContent ?? key.textContent,
  );
}

describe('keyboard reference', () => {
  beforeEach(() => {
    browser.apple = true;
    browser.coarsePointer = false;
    vi.mocked(globalThis.matchMedia).mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)' || (browser.coarsePointer && query.includes('pointer: coarse')),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('offers only its control until opened', () => {
    renderReference();

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens with its groups in order and takes focus', async () => {
    renderReference();
    const dialog = openReference();

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Essentials',
      'Editing',
      'Selection',
      'Note actions',
    ]);
    await waitFor(() => { expect(dialog.contains(document.activeElement)).toBe(true); });
  });

  it('states how the note actions menu opens', () => {
    renderReference();
    const dialog = openReference();

    expect(within(dialog).getByText('First press Shift twice to open the menu.')).toBeInTheDocument();
  });

  it('shows only the bindings of an Apple viewer', () => {
    renderReference();
    const dialog = openReference();

    expect(keysOf(dialog, 'Toggle checked')).toEqual(['⌘', 'Enter']);
    expect(keysOf(dialog, 'Move up / down')).toEqual(['Control', 'Shift', '↑/↓']);
    expect(keysOf(dialog, 'Delete selection')).toEqual(['Delete']);
    expect(within(dialog).queryByRole('tab')).toBeNull();
  });

  it('shows only the bindings of a non-Apple viewer', () => {
    browser.apple = false;
    renderReference();
    const dialog = openReference();

    expect(keysOf(dialog, 'Toggle checked')).toEqual(['Ctrl', 'Enter']);
    expect(keysOf(dialog, 'Move up / down')).toEqual(['Alt', 'Shift', '↑/↓']);
    expect(keysOf(dialog, 'Delete selection')).toEqual(['Backspace']);
    expect(within(dialog).queryByRole('tab')).toBeNull();
  });

  it('exposes each action with its keys as one pair', () => {
    renderReference();
    const dialog = openReference();

    const action = within(dialog).getByText('Find in document');
    expect(action.tagName).toBe('DT');
    expect(action.nextElementSibling?.tagName).toBe('DD');
    expect(within(action.closest('div')!).getByText('Command')).toBeInTheDocument();
  });

  it('lists the document search shortcut after find in document', () => {
    renderReference();
    const dialog = openReference();

    expect(keysOf(dialog, 'Search documents')).toEqual(['⌘', 'K']);
    const actions = within(dialog).getAllByRole('term').map((term) => term.textContent);
    expect(actions.indexOf('Search documents')).toBe(actions.indexOf('Find in document') + 1);
  });

  it('stays open while the user edits elsewhere', () => {
    renderReference();
    openReference();
    const editor = screen.getByLabelText('Editor');

    fireEvent.pointerDown(editor);
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: 'Keyboard reference' })).toBeInTheDocument();
  });

  it.each([
    ['its control', () => { fireEvent.click(toggle()); }],
    ['its close button', () => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); }],
    ['Escape from within', () => { fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); }],
  ])('closes through %s and hands focus back', (_name, close) => {
    const { onClose } = renderReference();
    openReference();

    close();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('is absent on touch devices', () => {
    browser.coarsePointer = true;
    renderReference();

    expect(screen.queryByRole('button', { name: 'Keyboard reference' })).toBeNull();
  });
});
