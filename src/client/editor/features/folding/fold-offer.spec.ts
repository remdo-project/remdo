import { expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';

import { $canOfferFold } from '#client/editor/features/folding/fold-offer';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getNoteElement, meta } from '#tests';

it('offers fold on a parent and not on a leaf', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  const types = remdo.editor.getEditorState().read(() => ({
    parent: $canOfferFold(remdo.editor, $findNoteById('note6')!),
    leaf: $canOfferFold(remdo.editor, $findNoteById('note7')!),
  }));
  expect(types.parent).toBe(true);
  expect(types.leaf).toBe(false);
});

it('does not offer fold on the zoom root', meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
  await waitFor(() => {
    expect(getNoteElement(remdo, 'note2')).toHaveAttribute('data-zoom-root', 'true');
  });

  const offered = remdo.editor.getEditorState().read(() => $canOfferFold(remdo.editor, $findNoteById('note2')!));
  expect(offered).toBe(false);
});
