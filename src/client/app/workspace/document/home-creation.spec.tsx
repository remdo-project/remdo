import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestUserData } from '#tests';
import { createDocumentPath } from '#document-routes';
import { renderDocumentRoute, resetDocumentRouteHarness } from '../../../../../tests/unit/_support/document-route-harness';

const documents = () => getTestUserData().getDocuments().getChildren();

async function openCreation() {
  const trigger = screen.getByRole('button', { name: 'New document' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'New document' });
  const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Document name' });
  return { dialog, input, trigger };
}

describe('home document creation', () => {
  beforeEach(resetDocumentRouteHarness);
  afterEach(() => vi.restoreAllMocks());

  it.each([
    { names: [], suggestion: 'New Document' },
    { names: ['New Document', 'New Document 2'], suggestion: 'New Document 3' },
    { names: ['New Document', 'New Document 3'], suggestion: 'New Document 2' },
    { names: [' new document ', 'NEW DOCUMENT 2'], suggestion: 'New Document 3' },
  ])('selects $suggestion against the existing names $names', async ({ names, suggestion }) => {
    for (const name of names) await getTestUserData().getDocuments().create(name);
    const before = documents().length;
    const router = renderDocumentRoute('/');
    const { input } = await openCreation();

    expect(input).toHaveFocus();
    expect(input).toHaveValue(suggestion);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, suggestion.length]);
    expect(documents()).toHaveLength(before);
    expect(router.state.location.pathname).toBe('/');
  });

  it.each(['Cancel', 'Escape'])('discards the draft with %s and restores the New action', async (action) => {
    const router = renderDocumentRoute('/');
    const before = documents().length;
    const { dialog, input, trigger } = await openCreation();
    fireEvent.change(input, { target: { value: 'Draft only' } });
    if (action === 'Cancel') fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    else fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(documents()).toHaveLength(before);
    expect(router.state.location.pathname).toBe('/');
  });

  it('rejects a blank name inline before creating a trimmed custom name with interior spaces', async () => {
    const router = renderDocumentRoute('/');
    const before = documents().length;
    const { dialog, input } = await openCreation();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create document' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a document name.');
    expect(documents()).toHaveLength(before);
    expect(router.state.location.pathname).toBe('/');

    fireEvent.change(input, { target: { value: '  Project  notes  ' } });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create document' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const created = documents().find((document) => document.getText() === 'Project  notes')!;
    expect(documents()).toHaveLength(before + 1);
    expect(router.state.location.pathname).toBe(createDocumentPath(created.getId()));
  });

  it('accepts an existing custom name instead of changing it to a unique suggestion', async () => {
    renderDocumentRoute('/');
    const { dialog, input } = await openCreation();
    fireEvent.change(input, { target: { value: 'Test Document' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create document' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(documents().filter((document) => document.getText() === 'Test Document')).toHaveLength(2);
  });

  it('prevents Enter from submitting during input-method composition', async () => {
    const router = renderDocumentRoute('/');
    const before = documents().length;
    const { input } = await openCreation();
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter', isComposing: true, bubbles: true, cancelable: true,
    });
    fireEvent(input, enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(documents()).toHaveLength(before);
    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps the suggestion and edited draft stable when the document list changes', async () => {
    renderDocumentRoute('/');
    const { input } = await openCreation();
    await act(async () => { await getTestUserData().getDocuments().create('New Document'); });
    expect(input).toHaveValue('New Document');

    fireEvent.change(input, { target: { value: 'My draft' } });
    await act(async () => { await getTestUserData().getDocuments().create('My draft'); });
    expect(input).toHaveValue('My draft');
  });

  it('locks a pending creation, keeps a rejected draft, and retries once', async () => {
    const userData = getTestUserData();
    const realDocuments = userData.getDocuments();
    let attempts = 0;
    let rejectCreation!: (failure: Error) => void;
    vi.spyOn(userData, 'getDocuments').mockReturnValue({
      ...realDocuments,
      create: (name) => {
        attempts += 1;
        return attempts === 1
          ? new Promise((_resolve, reject) => { rejectCreation = reject; })
          : realDocuments.create(name);
      },
    });
    const router = renderDocumentRoute('/');
    const before = documents().length;
    const { dialog, input } = await openCreation();
    fireEvent.change(input, { target: { value: 'Retry this name' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create document' }));

    expect(input).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Creating…');
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.submit(input.closest('form')!);
    expect(dialog).toBeInTheDocument();
    expect(attempts).toBe(1);

    await act(async () => { rejectCreation(new Error('Server unavailable. Try again.')); });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Server unavailable. Try again.');
    expect(input).toBeEnabled();
    expect(input).toHaveValue('Retry this name');
    expect(documents()).toHaveLength(before);
    expect(router.state.location.pathname).toBe('/');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(documents()).toHaveLength(before + 1);
    expect(documents().at(-1)!.getText()).toBe('Retry this name');
    expect(attempts).toBe(2);
  });
});
