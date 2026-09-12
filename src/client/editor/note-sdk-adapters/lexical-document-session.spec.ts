import { waitFor } from '@testing-library/react';
import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  $createTextNode,
  $getRoot,
  $setState,
  CAN_UNDO_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { LoadState, SnapshotStore } from '#note-sdk';
import { createMountedLexicalEditor, getNoteKey, meta, placeCaretAtNote, typeText } from '#tests';
import { $getNoteChecked } from '#client/editor/features/list-types/checked-state';
import {
  DELETE_SELECTED_NOTES_COMMAND,
  INDENT_NOTES_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
  SET_NOTE_FOLD_COMMAND,
} from '#client/editor/foundation/commands';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { $isNoteFolded, $setNoteFolded } from '#client/editor/outline/fold-state';
import { setViewRoot } from '#client/editor/outline/view-root';
import { editorNodes } from '#client/editor/runtime/nodes';
import { noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { createLexicalDocumentSessionRuntime } from './lexical-document-session';

function requireReady<T>(state: LoadState<T>): T {
  if (state.status !== 'ready') {
    throw new Error(`Expected ready SDK state, got ${state.status}`);
  }
  return state.data;
}

async function waitUntilReady<T>(store: SnapshotStore<LoadState<T>>): Promise<T> {
  await waitFor(() => {
    expect(store.getSnapshot().status).toBe('ready');
  });
  return requireReady(store.getSnapshot());
}

async function flushProjection(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function $createNote(noteId: string, text: string) {
  const note = $createListItemNode();
  $setState(note, noteIdState, noteId);
  note.append($createTextNode(text));
  return note;
}

function $setSingleNoteDocument(noteId: string, text: string): void {
  $getRoot().clear().append($createListNode('bullet').append($createNote(noteId, text)));
}

describe('lexical document session', () => {
  it('reads addressed-note values without waiting for adapter effects', meta({ fixture: 'tree' }), ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    onTestFinished(() => runtime.dispose());

    const note = runtime.session.note('note2');

    expect(note.text()).toBe('note2');
    expect(note.folded()).toBe(false);
  });

  it('stays loading until schema readiness, then publishes one complete indexed snapshot', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    onTestFinished(() => runtime.dispose());
    const listener = vi.fn();
    runtime.session.document.subscribe(listener);

    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'loading' });

    runtime.setSourceReady(true);
    const document = await waitUntilReady(runtime.session.document);

    expect(document.documentId).toBe(remdo.getCollabDocId());
    expect(document.root).toEqual({ listType: 'bullet', noteIds: ['note1', 'note3'] });
    expect(document.notes.size).toBe(3);
    expect(document.notes.get('note1')).toMatchObject({
      id: 'note1',
      text: 'note1',
      checked: false,
      folded: false,
      children: { listType: 'bullet', noteIds: ['note2'] },
    });
    expect(document.notes.get('note2')).toMatchObject({ text: 'note2', children: null });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('publishes semantic edits and preserves snapshot identity for selection-only changes', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const listener = vi.fn();
    runtime.session.document.subscribe(listener);
    const before = await waitUntilReady(runtime.session.document);
    listener.mockClear();

    await placeCaretAtNote(remdo, 'note3');
    await flushProjection();

    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'ready', data: before });
    expect(listener).not.toHaveBeenCalled();

    await typeText(remdo, ' updated');
    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('note3')?.text)
        .toBe(' updatednote3');
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does not publish capabilities when focus moves between notes with equal capabilities', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const listener = vi.fn();
    runtime.session.capabilities.subscribe(listener);

    await placeCaretAtNote(remdo, 'note1');
    await waitFor(() => {
      expect(requireReady(runtime.session.capabilities.getSnapshot()).selection.canDelete).toBe(true);
    });
    const before = runtime.session.capabilities.getSnapshot();
    listener.mockClear();

    await placeCaretAtNote(remdo, 'note3');
    await flushProjection();

    expect(runtime.session.capabilities.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('uses runtime-immutable rows, child lists, arrays, and note index', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    runtime.session.document.subscribe(() => {});
    const document = await waitUntilReady(runtime.session.document);
    const note = document.notes.get('note1')!;

    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.root)).toBe(true);
    expect(Object.isFrozen(document.root.noteIds)).toBe(true);
    expect(Object.isFrozen(note)).toBe(true);
    expect(Object.isFrozen(note.children)).toBe(true);
    expect('set' in document.notes).toBe(false);
  });

  it('re-resolves a stable note ID after editor-state replacement', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    runtime.session.document.subscribe(() => {});
    await waitUntilReady(runtime.session.document);
    const note = runtime.session.note('note2');

    const serialized = remdo.getEditorState();
    const replacement = remdo.editor.parseEditorState(JSON.stringify(serialized));
    remdo.editor.setEditorState(replacement);
    await note.toggleFold();

    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('note2')?.folded).toBe(true);
    });
  });

  it('publishes focus, fold, deletion, view, and eager history capability', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => {
      setViewRoot(remdo.editor, null);
      runtime.dispose();
    });

    // History events are cached for a toolbar that subscribes later.
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    const capabilityListener = vi.fn();
    runtime.session.capabilities.subscribe(capabilityListener);
    await placeCaretAtNote(remdo, 'note2');
    await waitFor(() => {
      expect(requireReady(runtime.session.capabilities.getSnapshot())).toEqual({
        focus: { canToggleFold: true },
        selection: { canDelete: true },
        history: { canUndo: true, canRedo: false },
      });
    });

    const documentListener = vi.fn();
    runtime.session.document.subscribe(documentListener);
    const documentBeforeView = await waitUntilReady(runtime.session.document);
    capabilityListener.mockClear();
    documentListener.mockClear();
    setViewRoot(remdo.editor, getNoteKey(remdo, 'note2'));

    await waitFor(() => {
      expect(requireReady(runtime.session.capabilities.getSnapshot()).focus.canToggleFold).toBe(false);
    });
    expect(requireReady(runtime.session.document.getSnapshot())).toBe(documentBeforeView);
    expect(documentListener).not.toHaveBeenCalled();
    expect(capabilityListener).toHaveBeenCalledOnce();
  });

  it('delegates semantic operations and revalidates fold applicability', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    runtime.session.document.subscribe(() => {});
    await waitUntilReady(runtime.session.document);

    await placeCaretAtNote(remdo, 'note5');
    runtime.session.selection.toggleChecked();
    await waitFor(() => {
      expect(remdo.editor.read(() => $getNoteChecked($findNoteById('note5')!))).toBe(true);
    });

    await runtime.session.note('note6').toggleFold();
    await runtime.session.note('note7').toggleFold();
    await runtime.session.note('missing').toggleFold();
    await waitFor(() => {
      const snapshot = requireReady(runtime.session.document.getSnapshot());
      expect(snapshot.notes.get('note6')?.folded).toBe(true);
      expect(snapshot.notes.get('note7')?.folded).toBe(false);
    });
  });

  it('publishes cross-parent moves, sibling order, and deletion coherently', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    runtime.session.document.subscribe(() => {});
    await waitUntilReady(runtime.session.document);

    await placeCaretAtNote(remdo, 'note3');
    runtime.session.selection.indent();
    await waitFor(() => {
      const document = requireReady(runtime.session.document.getSnapshot());
      expect(document.root.noteIds).toEqual(['note1']);
      expect(document.notes.get('note1')?.children?.noteIds).toEqual(['note2', 'note3']);
    });

    runtime.session.selection.moveUp();
    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('note1')?.children?.noteIds)
        .toEqual(['note3', 'note2']);
    });

    runtime.session.selection.delete();
    await waitFor(() => {
      const document = requireReady(runtime.session.document.getSnapshot());
      expect(document.notes.has('note3')).toBe(false);
      expect(document.notes.get('note1')?.children?.noteIds).toEqual(['note2']);
    });
  });

  it('reads and mutates an addressed note without activating document projection', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'loading' });
    const note = runtime.session.note('note2');
    expect(note.id()).toBe('note2');
    expect(note.text()).toBe('note2');
    expect(note.folded()).toBe(false);
    expect(() => runtime.session.note('missing').text()).toThrow();

    await note.toggleFold();

    expect(note.folded()).toBe(true);
    expect(remdo.editor.read(() => $isNoteFolded($findNoteById('note2')!))).toBe(true);
    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'loading' });
  });

  it('notifies an addressed-note subscriber only when that note changes', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const note = runtime.session.note('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));

    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'loading' });
    expect(note.text()).toBe('note2');
    expect(listener).not.toHaveBeenCalled();

    await remdo.updateNoteText('note1', 'unrelated');
    await flushProjection();
    expect(listener).not.toHaveBeenCalled();

    await remdo.updateNoteText('note2', 'changed');
    await waitFor(() => {
      expect(note.text()).toBe('changed');
      expect(listener).toHaveBeenCalledOnce();
    });

    listener.mockClear();
    await remdo.mutate(() => {
      $setNoteFolded($findNoteById('note2')!, true);
    });
    await waitFor(() => {
      expect(note.folded()).toBe(true);
      expect(listener).toHaveBeenCalledOnce();
    });
    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'loading' });
  });

  it('maps each named operation to its semantic editor command', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const dispatch = vi.spyOn(remdo.editor, 'dispatchCommand');

    dispatch.mockClear();
    runtime.session.selection.indent();
    expect(dispatch).toHaveBeenCalledWith(INDENT_NOTES_COMMAND, undefined);

    dispatch.mockClear();
    runtime.session.selection.outdent();
    expect(dispatch).toHaveBeenCalledWith(OUTDENT_NOTES_COMMAND, undefined);

    dispatch.mockClear();
    runtime.session.selection.moveUp();
    expect(dispatch).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND, undefined);

    dispatch.mockClear();
    runtime.session.selection.moveDown();
    expect(dispatch).toHaveBeenCalledWith(REORDER_NOTES_DOWN_COMMAND, undefined);

    dispatch.mockClear();
    runtime.session.selection.toggleChecked();
    expect(dispatch).toHaveBeenCalledWith(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

    dispatch.mockClear();
    runtime.session.selection.delete();
    expect(dispatch).toHaveBeenCalledWith(DELETE_SELECTED_NOTES_COMMAND, undefined);

    dispatch.mockClear();
    runtime.session.history.undo();
    expect(dispatch).toHaveBeenCalledWith(UNDO_COMMAND, undefined);

    dispatch.mockClear();
    runtime.session.history.redo();
    expect(dispatch).toHaveBeenCalledWith(REDO_COMMAND, undefined);

    await placeCaretAtNote(remdo, 'note6');
    dispatch.mockClear();
    runtime.session.focus.toggleFold();
    expect(dispatch).toHaveBeenCalledWith(SET_NOTE_FOLD_COMMAND, {
      state: 'toggle',
      noteItemKey: getNoteKey(remdo, 'note6'),
    });
  });

  it('allows a subscriber to invoke a fresh SDK mutation after publication', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    let armed = false;
    const listener = vi.fn(() => {
      if (armed) {
        armed = false;
        void runtime.session.note('note2').toggleFold();
      }
    });
    runtime.session.document.subscribe(listener);
    await waitUntilReady(runtime.session.document);
    armed = true;

    await placeCaretAtNote(remdo, 'note1');
    await typeText(remdo, '!');

    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('note2')?.folded).toBe(true);
    });
  });

  it('resets to loading across a source epoch and refreshes from current state', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    await placeCaretAtNote(remdo, 'note3');
    runtime.session.document.subscribe(() => {});
    runtime.session.capabilities.subscribe(() => {});
    await waitUntilReady(runtime.session.document);
    await waitUntilReady(runtime.session.capabilities);

    runtime.setSourceReady(false);
    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'loading' });
    expect(runtime.session.capabilities.getSnapshot()).toEqual({ status: 'loading' });
    await expect(runtime.session.note('note1').toggleFold()).resolves.toBeUndefined();

    await typeText(remdo, 'fresh ');
    runtime.setSourceReady(true);

    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('note3')?.text)
        .toBe('fresh note3');
    });
  });

  it('retains history capability changes across a stop and restart', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    const stop = runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    runtime.session.capabilities.subscribe(() => {});
    await waitUntilReady(runtime.session.capabilities);

    stop();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    expect(runtime.session.capabilities.getSnapshot()).toEqual({ status: 'loading' });

    runtime.start();
    await waitFor(() => {
      expect(requireReady(runtime.session.capabilities.getSnapshot()).history.canUndo).toBe(true);
    });
  });

  it('reports invalid post-readiness state and recovers on a later valid revision', async () => {
    const mounted = createMountedLexicalEditor({
      namespace: 'document-session-error-recovery',
      nodes: editorNodes,
      onError: (error) => { throw error; },
    });
    onTestFinished(mounted.dispose);
    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'));
    const runtime = createLexicalDocumentSessionRuntime({
      editor: mounted.editor,
      docId: 'document',
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    runtime.session.document.subscribe(() => {});

    expect((await waitUntilReady(runtime.session.document)).notes.get('first')?.text).toBe('First');

    mounted.editor.update(() => $getRoot().clear());
    await waitFor(() => {
      expect(runtime.session.document.getSnapshot().status).toBe('error');
    });

    mounted.editor.update(() => $setSingleNoteDocument('second', 'Second'));
    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('second')?.text).toBe('Second');
    });
  });

  it('observes an addressed note while the whole-document projection is invalid', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      // The projection rejects a document ID reused by an editor note, while
      // the addressed note remains independently readable.
      docId: 'note1',
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const note = runtime.session.note('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    runtime.session.document.subscribe(() => {});

    await waitFor(() => {
      expect(runtime.session.document.getSnapshot().status).toBe('error');
    });
    expect(note.text()).toBe('note2');
    listener.mockClear();

    await remdo.updateNoteText('note2', 'changed');

    await waitFor(() => {
      expect(note.text()).toBe('changed');
      expect(listener).toHaveBeenCalledOnce();
    });
    expect(runtime.session.document.getSnapshot().status).toBe('error');
  });

  it('makes every operation inert after stop and dispose', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    const stop = runtime.start();
    runtime.setSourceReady(true);
    await placeCaretAtNote(remdo, 'note2');
    runtime.session.document.subscribe(() => {});
    runtime.session.capabilities.subscribe(() => {});
    await waitUntilReady(runtime.session.document);
    await waitUntilReady(runtime.session.capabilities);
    const dispatch = vi.spyOn(remdo.editor, 'dispatchCommand');
    dispatch.mockClear();

    stop();
    expect(runtime.session.document.getSnapshot()).toEqual({ status: 'loading' });
    expect(runtime.session.capabilities.getSnapshot()).toEqual({ status: 'loading' });
    await runtime.session.note('note2').toggleFold();
    runtime.session.selection.indent();
    runtime.session.selection.outdent();
    runtime.session.selection.moveUp();
    runtime.session.selection.moveDown();
    runtime.session.selection.toggleChecked();
    runtime.session.selection.delete();
    runtime.session.history.undo();
    runtime.session.history.redo();
    expect(dispatch).not.toHaveBeenCalled();

    runtime.dispose();
    runtime.start();
    runtime.setSourceReady(true);
    runtime.session.history.undo();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
