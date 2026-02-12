import { $createTextNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $createInternalNoteLinkNode, $isInternalNoteLinkNode, InternalNoteLinkNode } from '#lib/editor/internal-note-link-node';
import { meta } from '#tests';
import { $findNoteById } from '@/editor/outline/note-traversal';

describe('internal note link node', () => {
  it(
    'exports canonical identity without persisting url',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      const currentDocId = remdo.getCollabDocId();
      let sameDocUrl = '';
      let crossDocUrl = '';

      await remdo.mutate(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const sameDoc = $createInternalNoteLinkNode({ noteId: 'note2' }, {}, currentDocId);
        sameDoc.append($createTextNode('same-doc'));
        const crossDoc = $createInternalNoteLinkNode({ docId: 'otherDoc', noteId: 'note3' }, {}, currentDocId);
        crossDoc.append($createTextNode('cross-doc'));
        note.append(sameDoc);
        note.append($createTextNode(' '));
        note.append(crossDoc);
        sameDocUrl = sameDoc.getURL();
        crossDocUrl = crossDoc.getURL();
      });

      remdo.validate(() => {
        const note = $findNoteById('note1')!;
        const links = note.getChildren().filter($isInternalNoteLinkNode);
        const sameDoc = links[0]!;
        const crossDoc = links[1]!;

        const sameDocJson = sameDoc.exportJSON() as Record<string, unknown>;
        const crossDocJson = crossDoc.exportJSON() as Record<string, unknown>;

        expect(sameDocUrl).toBe(`/n/${currentDocId}_note2`);
        expect(crossDocUrl).toBe('/n/otherDoc_note3');

        expect(sameDocJson.noteId).toBe('note2');
        expect(sameDocJson.docId).toBeUndefined();
        expect('url' in sameDocJson).toBe(false);

        expect(crossDocJson.noteId).toBe('note3');
        expect(crossDocJson.docId).toBe('otherDoc');
        expect('url' in crossDocJson).toBe(false);
      });
    }
  );

  it(
    'fails fast on malformed link identity',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      let constructorError: unknown;
      let importError: unknown;

      await remdo.mutate(() => {
        try {
          const node = new InternalNoteLinkNode({ docId: 'invalid-doc-id', noteId: 'invalid-note-id' });
          void node;
        } catch (error) {
          constructorError = error;
        }

        const valid = new InternalNoteLinkNode({ noteId: 'note2' });
        const serialized = valid.exportJSON() as Record<string, unknown>;
        serialized.noteId = 'invalid-note-id';

        try {
          InternalNoteLinkNode.importJSON(serialized as never);
        } catch (error) {
          importError = error;
        }
      });

      expect(constructorError).toBeInstanceOf(Error);
      expect((constructorError as Error).message).toBe('Internal link noteId must be a valid note id.');
      expect(importError).toBeInstanceOf(Error);
      expect((importError as Error).message).toBe('Internal link noteId must be a valid note id.');
    }
  );

  it(
    'enforces valid ids in strict write APIs',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      const currentDocId = remdo.getCollabDocId();
      let setLinkRefError: unknown;
      let setDocIdError: unknown;
      let createNodeError: unknown;

      await remdo.mutate(() => {
        const link = new InternalNoteLinkNode({ noteId: 'note2' });
        try {
          link.setLinkRef({ noteId: 'invalid-note-id' });
        } catch (error) {
          setLinkRefError = error;
        }
        try {
          link.setDocId('invalid-doc-id');
        } catch (error) {
          setDocIdError = error;
        }
        try {
          $createInternalNoteLinkNode({ noteId: 'invalid-note-id' }, {}, currentDocId);
        } catch (error) {
          createNodeError = error;
        }
      });

      expect(setLinkRefError).toBeInstanceOf(Error);
      expect((setLinkRefError as Error).message).toBe('Internal link noteId must be a valid note id.');
      expect(setDocIdError).toBeInstanceOf(Error);
      expect((setDocIdError as Error).message).toBe('Internal link docId must be a valid note id.');
      expect(createNodeError).toBeInstanceOf(Error);
      expect((createNodeError as Error).message).toBe('Internal link noteId must be a valid note id.');
    }
  );
});
