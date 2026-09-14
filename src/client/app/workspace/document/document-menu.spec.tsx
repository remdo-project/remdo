import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { createUserDataRootNote } from '#note-sdk';
import type { DocumentNote } from '#note-sdk';
import { DocumentMenu, useDocumentRename } from './DocumentMenu';

function Harness({ note, showMenu = true }: { note: DocumentNote; showMenu?: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rename = useDocumentRename(headingRef);
  return <MantineProvider>
    <h1 ref={headingRef} tabIndex={-1}>Home</h1>
    {showMenu && <DocumentMenu note={note} onRename={rename.openRename} />}
    {rename.renameDialog}
  </MantineProvider>;
}

describe('document rename dialog', () => {
  it('keeps a failed draft for explicit retry and blocks changes while pending', async () => {
    let fail!: (error: Error) => void;
    let committedName = 'Original';
    let attempt = 0;
    const note = createUserDataRootNote([{ id: 'doc', title: 'Original' }], {
      renameDocument: async (_id, name) => {
        attempt += 1;
        if (attempt === 1) await new Promise<void>((_resolve, reject) => { fail = reject; });
        committedName = name;
      },
    }).documents().byId('doc')!;
    render(<Harness note={note} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Original' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
    const input = screen.getByRole('textbox', { name: 'Document name' });
    fireEvent.change(input, { target: { value: '  New  name  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(committedName).toBe('Original');
    await act(async () => { fail(new Error('Source unavailable')); });
    expect(input).toHaveValue('  New  name  ');
    expect(input).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Source unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(committedName).toBe('New  name');
  });

  it('rejects whitespace-only names inline without submitting', async () => {
    let committedName = 'Original';
    const note = createUserDataRootNote([{ id: 'doc', title: 'Original' }], {
      renameDocument: async (_id, name) => { committedName = name; },
    }).documents().byId('doc')!;
    render(<Harness note={note} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Original' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Document name' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByText('Enter a document name.')).toBeInTheDocument();
    expect(committedName).toBe('Original');
  });

  it('keeps the dialog open when its row disappears and returns focus to the heading on cancel', async () => {
    const note = createUserDataRootNote([{ id: 'doc', title: 'Original' }]).documents().byId('doc')!;
    const view = render(<Harness note={note} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Original' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
    view.rerender(<Harness note={note} showMenu={false} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus());
  });
});
