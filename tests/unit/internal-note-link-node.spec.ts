import { $createTextNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $isInternalNoteLinkNode, $syncInternalNoteLinkNodeUrls, InternalNoteLinkNode } from '#lib/editor/internal-note-link-node';
import { meta } from '#tests';
import { $findNoteById } from '@/editor/outline/note-traversal';

describe('internal note link node', () => {
  it(
    'preserves malformed noteId values and keeps existing URL during sync',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      const currentDocId = remdo.getCollabDocId();

      await remdo.mutate(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const link = new InternalNoteLinkNode({ noteId: 'invalid-note-id' });
        link.setURL('/n/main_invalid-note-id');
        link.append($createTextNode('broken-link'));
        note.append(link);
        $syncInternalNoteLinkNodeUrls(currentDocId);
      });

      const { noteId, url } = remdo.validate(() => {
        const note = $findNoteById('note1')!;
        const link = note.getChildren().find($isInternalNoteLinkNode)!;
        return {
          noteId: link.getNoteId(),
          url: link.getURL(),
        };
      });

      expect(noteId).toBe('invalid-note-id');
      expect(url).toBe('/n/main_invalid-note-id');
    }
  );

  it(
    'preserves legacy cross-doc docId values during URL sync',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      const currentDocId = remdo.getCollabDocId();

      await remdo.mutate(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const link = new InternalNoteLinkNode({ docId: 'other-doc', noteId: 'note2' });
        link.setURL('/n/other-doc_note2');
        link.append($createTextNode('legacy-cross-doc-link'));
        note.append(link);
        $syncInternalNoteLinkNodeUrls(currentDocId);
      });

      const { docId, url } = remdo.validate(() => {
        const note = $findNoteById('note1')!;
        const link = note.getChildren().find($isInternalNoteLinkNode)!;
        return {
          docId: link.getDocId(),
          url: link.getURL(),
        };
      });

      expect(docId).toBe('other-doc');
      expect(url).toBe('/n/other-doc_note2');
    }
  );
});
