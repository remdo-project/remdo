/**
 * Consumer examples of the current experimental open-document SDK surface.
 *
 * Example names identify the consumer lesson; comments distinguish related
 * lessons within a workflow. docs/dev/sdk.md owns the showcase conventions.
 * Uses the existing editor fixtures and real SDK adapter. Account examples run
 * against the real backend in tests/unit/collab/note-sdk-showcase.collab.spec.ts.
 */
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { meta, placeCaretAtNote, selectNoteRange } from '#tests';
import { IneligibleOperationError, NoteUnavailableError } from '#note-sdk';
import type { DocumentNote, NoteListType, OpenDocumentNote } from '#note-sdk';

describe('note SDK showcase', () => {
  describe('open document', () => {
    it('reads current eligibility and observes it as focus changes', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;
      await placeCaretAtNote(remdo, 'note1');
      expect(openDocument.focus.canToggleFold()).toBe(false);

      let canFold = openDocument.focus.canToggleFold();
      const unsubscribe = openDocument.subscribeCapabilities(() => {
        canFold = openDocument.focus.canToggleFold();
      });
      onTestFinished(unsubscribe);
      await placeCaretAtNote(remdo, 'note2');
      await vi.waitFor(() => expect(canFold).toBe(true));
      unsubscribe();
    });

    it('retains a live reference while previously read values stay unchanged', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.openDocument.noteRef('note2');
      const earlierChecked = note.getChecked();

      await note.toggleChecked();

      expect(note.getChecked()).toBe(true);
      expect(earlierChecked).toBe(false);
      // An addressed toggle includes the note's descendants.
      expect(remdo.openDocument.noteRef('note3').getChecked()).toBe(true);
    });

    it("reads and toggles an addressed note's folded state", meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.openDocument.noteRef('note2');

      expect(note.getFolded()).toBe(false);

      await note.toggleFold();

      expect(note.getFolded()).toBe(true);
    });

    it('reads eligibility from an addressed note without moving focus', meta({ fixture: 'tree' }), ({ remdo }) => {
      const parent = remdo.openDocument.noteRef('note2');
      const leaf = remdo.openDocument.noteRef('note1');

      expect(parent.canToggleFold()).toBe(true);
      expect(leaf.canToggleFold()).toBe(false);
    });

    it('uses the selected range when a contextual target belongs to it', meta({ fixture: 'flat' }), async ({ remdo }) => {
      await selectNoteRange(remdo, 'note1', 'note2');

      remdo.openDocument.selection.toggleChecked({ noteId: 'note2' });

      await vi.waitFor(() => {
        expect(remdo.openDocument.noteRef('note1').getChecked()).toBe(true);
        expect(remdo.openDocument.noteRef('note2').getChecked()).toBe(true);
        expect(remdo.openDocument.noteRef('note3').getChecked()).toBe(false);
      });
    });

    it('reads fresh child-list state through a retained parent reference', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
      const parent = remdo.openDocument.noteRef('note2').getParent();
      expect(parent.getChildListType()).toBe('number');

      await remdo.openDocument.noteRef('note1').setChildListType('check');

      expect(parent.getChildListType()).toBe('check');
    });

    it('appends an outline and addresses its new notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;

      const [summaryId] = await openDocument.root.content.appendChildren([{
        text: 'Conversation summary',
        childListType: 'check',
        children: [{ text: 'Follow up' }],
      }]);
      const summary = openDocument.noteRef(summaryId!);
      expect(summary.getChildListType()).toBe('check');
      expect(summary.getChildren().map((note) => note.getText())).toEqual(['Follow up']);
      expect(openDocument.root.content.getChildren().at(-1)!.getText()).toBe('Conversation summary');
      expect(summary.getParent()).toBe(openDocument.root.content);

      // Appending to an unavailable note rejects instead of silently dropping data.
      await expect(openDocument.noteRef('missing').appendChildren([{ text: 'Lost' }]))
        .rejects.toThrow(IneligibleOperationError);
    });

    it('walks document content through children reads, including bodies', meta({ fixture: 'editor-showcase' }), ({ remdo }) => {
      interface OutlineEntry { text: string; body: string | null; childListType: NoteListType | null; children: OutlineEntry[] }
      const walk = (parent: DocumentNote['content'] | OpenDocumentNote): OutlineEntry[] => parent.getChildren().map((note) => ({
        text: note.getText(),
        body: note.getBody(),
        childListType: note.getChildListType(),
        children: walk(note),
      }));

      const outline = walk(remdo.openDocument.root.content);

      // A note's body stays separate from its short label.
      expect(outline.find(({ text }) => text === 'Note with body')).toEqual({
        text: 'Note with body',
        body: 'Body has rich text and a note link\nSecond body line\nThird body line',
        childListType: null,
        children: [],
      });
      // Child-list presentation belongs to the parent note.
      expect(outline.find(({ text }) => text === 'Checklist')).toEqual({
        text: 'Checklist',
        body: null,
        childListType: 'check',
        children: [
          { text: 'Done task', body: 'Done task body', childListType: null, children: [] },
          { text: 'Open task', body: null, childListType: null, children: [] },
        ],
      });
    });

    it('rereads observed state and handles a deleted note', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.openDocument.noteRef('note2');
      let checked: boolean | null = note.getChecked();
      // Notifications tell the consumer to reread; they carry no state.
      const unsubscribe = note.subscribe(() => {
        try {
          checked = note.getChecked();
        } catch (error) {
          if (!(error instanceof NoteUnavailableError)) throw error;
          checked = null;
        }
      });
      onTestFinished(unsubscribe);

      await note.toggleChecked();

      await vi.waitFor(() => {
        expect(checked).toBe(true);
      });

      await placeCaretAtNote(remdo, 'note2');
      remdo.openDocument.selection.delete();
      await vi.waitFor(() => expect(checked).toBeNull());
      unsubscribe();
    });
  });
});
