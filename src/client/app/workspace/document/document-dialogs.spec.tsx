import { MantineProvider } from '@mantine/core';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { createUserDataRootNote } from '#note-sdk';
import type { DocumentNote } from '#note-sdk';
import { createObservableDocumentList } from '#tests';
import { DocumentDeleteDialog } from './DocumentDeleteDialog';
import { DocumentRenameDialog } from './DocumentRenameDialog';

function openWhileDocumentLeavesTheList(dialog: (note: DocumentNote) => ReactNode) {
  const list = createObservableDocumentList([{ id: 'doc-a', title: 'Ideas', deletable: true }]);
  const note = createUserDataRootNote(list.source).getDocuments().getById('doc-a')!;
  const view = render(<MantineProvider>{dialog(note)}</MantineProvider>);
  act(() => list.replace([]));
  view.rerender(<MantineProvider>{dialog(note)}</MantineProvider>);
}

describe('document dialogs', () => {
  it('delete keeps the opening name once the document leaves the list', () => {
    openWhileDocumentLeavesTheList((note) => <DocumentDeleteDialog note={note} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Delete “Ideas”?' })).toBeInTheDocument();
  });

  it('rename keeps the opening name once the document leaves the list', () => {
    openWhileDocumentLeavesTheList((note) => <DocumentRenameDialog note={note} onClose={() => {}} />);
    expect(screen.getByLabelText('Document name')).toHaveValue('Ideas');
  });
});
