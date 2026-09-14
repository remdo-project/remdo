import { waitFor } from '@testing-library/react';
import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  $createTextNode,
  $getRoot,
  $setState,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_HIGH,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { LoadState, SnapshotStore } from '#note-sdk';
import { NoteUnavailableError } from '#note-sdk';
import { createMountedLexicalEditor, getNoteKey, meta, placeCaretAtNote, selectNoteRange, typeText } from '#tests';
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
import { $resolveViewRoot, setViewRoot } from '#client/editor/outline/view-root';
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

async function flushObservations(): Promise<void> {
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

const SEARCH_ALL = { query: '', limit: 10, childPreviewLimit: 2 };

describe('lexical document session', () => {
  it('reads addressed-note values without subscribing', meta({ fixture: 'tree' }), ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    const note = runtime.session.noteRef('note2');

    expect(note.getText()).toBe('note2');
    expect(note.getFolded()).toBe(false);
  });

  it('rejects search until the runtime starts and the source is ready', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    onTestFinished(() => runtime.dispose());
    await expect(runtime.session.search(SEARCH_ALL)).rejects.toThrow('not available');
    runtime.start();
    await expect(runtime.session.search(SEARCH_ALL)).rejects.toThrow('not available');
    runtime.setSourceReady(true);
    const results = await runtime.session.search(SEARCH_ALL);
    expect(results.flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note2', 'note3']);
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
    await flushObservations();

    expect(runtime.session.capabilities.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('re-resolves a stable note ID after editor-state replacement', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const note = runtime.session.noteRef('note2');

    const serialized = remdo.getEditorState();
    const replacement = remdo.editor.parseEditorState(JSON.stringify(serialized));
    remdo.editor.setEditorState(replacement);
    await note.toggleFold();
    await note.toggleChecked();
    await note.setChildListType('number');
    expect(note.getChecked()).toBe(true);
    expect(note.getChildListType()).toBe('number');

    expect(note.getFolded()).toBe(true);
    expect(remdo.editor.read(() => $isNoteFolded($findNoteById('note2')!))).toBe(true);
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

    capabilityListener.mockClear();
    setViewRoot(remdo.editor, getNoteKey(remdo, 'note2'));

    await waitFor(() => {
      expect(requireReady(runtime.session.capabilities.getSnapshot()).focus.canToggleFold).toBe(false);
    });
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

    await placeCaretAtNote(remdo, 'note5');
    runtime.session.selection.toggleChecked();
    await waitFor(() => {
      expect(remdo.editor.read(() => $getNoteChecked($findNoteById('note5')!))).toBe(true);
    });

    await runtime.session.noteRef('note6').toggleFold();
    await runtime.session.noteRef('note7').toggleFold();
    await runtime.session.noteRef('missing').toggleFold();
    expect(runtime.session.noteRef('note6').getFolded()).toBe(true);
    expect(runtime.session.noteRef('note7').getFolded()).toBe(false);
  });

  it('searches the current hierarchy after moving and deleting notes', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    await placeCaretAtNote(remdo, 'note3');
    runtime.session.selection.indent();
    await waitFor(async () => {
      const { flatResults } = await runtime.session.search(SEARCH_ALL);
      expect(flatResults.map(({ path }) => path.map(({ id }) => id))).toEqual([
        ['note1'], ['note1', 'note2'], ['note1', 'note3'],
      ]);
    });

    runtime.session.selection.moveUp();
    await waitFor(async () => {
      const { flatResults } = await runtime.session.search(SEARCH_ALL);
      expect(flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note3', 'note2']);
    });

    runtime.session.selection.delete();
    await waitFor(async () => {
      const { flatResults } = await runtime.session.search(SEARCH_ALL);
      expect(flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note2']);
      expect(flatResults[0]!.note.children?.noteIds).toEqual(['note2']);
    });
  });

  it('reads committed addressed-note values immediately after an awaited mutation', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    const note = runtime.session.noteRef('note2');
    expect(note.getId()).toBe('note2');
    expect(note.getText()).toBe('note2');
    expect(note.getFolded()).toBe(false);
    const missing = runtime.session.noteRef('missing');
    expect(missing.getText).toThrow(NoteUnavailableError);
    expect(missing.getFolded).toThrow(NoteUnavailableError);
    expect(missing.getId()).toBe('missing');

    await note.toggleFold();

    expect(note.getFolded()).toBe(true);
    expect(remdo.editor.read(() => $isNoteFolded($findNoteById('note2')!))).toBe(true);
  });

  it('notifies an addressed-note subscriber only when that note changes', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const note = runtime.session.noteRef('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));

    expect(note.getText()).toBe('note2');
    expect(listener).not.toHaveBeenCalled();

    await remdo.updateNoteText('note1', 'unrelated');
    await flushObservations();
    expect(listener).not.toHaveBeenCalled();

    await remdo.updateNoteText('note2', 'changed');
    await waitFor(() => {
      expect(note.getText()).toBe('changed');
      expect(listener).toHaveBeenCalledOnce();
    });

    listener.mockClear();
    await remdo.mutate(() => {
      $setNoteFolded($findNoteById('note2')!, true);
    });
    await waitFor(() => {
      expect(note.getFolded()).toBe(true);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  it('keeps later subscriptions active when an earlier cleanup is repeated', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const note = remdo.documentSession.noteRef('note2');
    const unsubscribe = note.subscribe(() => {});
    onTestFinished(unsubscribe);
    unsubscribe();
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    unsubscribe();

    await remdo.updateNoteText('note2', 'changed');
    await flushObservations();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('independently releases subscriptions using the same callback and note ID', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const listener = vi.fn();
    const unsubscribe = remdo.documentSession.noteRef('note2').subscribe(listener);
    onTestFinished(unsubscribe);
    onTestFinished(remdo.documentSession.noteRef('note2').subscribe(listener));
    unsubscribe();

    await remdo.updateNoteText('note2', 'changed');
    await flushObservations();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('observes addressed eligibility when the view changes without an editor update', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const note = remdo.documentSession.noteRef('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    onTestFinished(() => setViewRoot(remdo.editor, null));
    expect(note.canToggleFold()).toBe(true);

    await placeCaretAtNote(remdo, 'note1');
    await flushObservations();
    expect(note.canToggleFold()).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    setViewRoot(remdo.editor, getNoteKey(remdo, 'note2'));
    await waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(note.canToggleFold()).toBe(false);
    await note.toggleFold();
    expect(note.getFolded()).toBe(false);
  });

  for (const noteId of ['note1', 'note6', 'note7']) {
    it(`keeps target ${noteId} read-only outside the zoom boundary`, meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
      const session = remdo.documentSession;
      const note = session.noteRef(noteId);
      expect(note.getText()).toBe(noteId);

      await note.toggleFold();
      expect(note.getFolded()).toBe(false);
      await note.setChildListType('number');
      expect(note.getChildListType()).toBe(noteId === 'note7' ? null : 'bullet');
      await note.toggleChecked();
      expect(['note1', 'note2', 'note3', 'note4', 'note6', 'note7'].map((id) => session.noteRef(id).getChecked()))
        .toEqual([false, false, false, false, false, false]);
      session.selection.toggleChecked({ noteId });
      await flushObservations();
      expect(['note1', 'note2', 'note3', 'note4', 'note6', 'note7'].map((id) => session.noteRef(id).getChecked()))
        .toEqual([false, false, false, false, false, false]);
    });
  }

  it('observes eligibility when a retained note leaves and reenters the zoom boundary', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const note = remdo.documentSession.noteRef('note6');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    onTestFinished(() => setViewRoot(remdo.editor, null));
    expect(note.canToggleFold()).toBe(true);
    expect(note.canSetChildListType()).toBe(true);

    setViewRoot(remdo.editor, getNoteKey(remdo, 'note1'));
    await waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(note.canToggleFold()).toBe(false);
    expect(note.canSetChildListType()).toBe(false);

    setViewRoot(remdo.editor, null);
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(note.canToggleFold()).toBe(true);
    expect(note.canSetChildListType()).toBe(true);
    await note.setChildListType('number');
    expect(note.getChildListType()).toBe('number');
  });

  it('observes checked eligibility when a retained leaf leaves and reenters the zoom boundary', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const note = remdo.documentSession.noteRef('note7');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    onTestFinished(() => setViewRoot(remdo.editor, null));

    expect(note.canToggleChecked()).toBe(true);
    setViewRoot(remdo.editor, getNoteKey(remdo, 'note1'));
    await waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(note.canToggleChecked()).toBe(false);

    setViewRoot(remdo.editor, null);
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(note.canToggleChecked()).toBe(true);
    await note.toggleChecked();
    expect(note.getChecked()).toBe(true);
  });

  it('allows addressed edits on the zoom root and its descendants', meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }), async ({ remdo }) => {
    const session = remdo.documentSession;
    await session.noteRef('note1').setChildListType('number');
    expect(session.noteRef('note1').getChildListType()).toBe('number');

    await session.noteRef('note2').toggleFold();
    expect(session.noteRef('note2').getFolded()).toBe(true);
    await session.noteRef('note3').toggleChecked();
    expect(session.noteRef('note3').getChecked()).toBe(true);

    await session.noteRef('note1').toggleChecked();
    expect(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']
      .map((id) => session.noteRef(id).getChecked()))
      .toEqual([true, true, true, true, false, false, false]);
  });

  it('zooms by stable note ID and applies fold levels within the current view', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const session = remdo.documentSession;
    session.noteRef('note2').zoom();
    await waitFor(() => {
      expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note2'));
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    session.view.zoomOut();
    await waitFor(() => {
      expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note1'));
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });
    session.view.foldToLevel(1);
    await waitFor(() => expect(session.noteRef('note2').getFolded()).toBe(true));
    expect(session.noteRef('note1').getFolded()).toBe(false);
    expect(session.noteRef('note6').getFolded()).toBe(false);

    session.view.foldToLevel(0);
    await waitFor(() => expect(session.noteRef('note2').getFolded()).toBe(false));
    session.noteRef('note6').zoom();
    await waitFor(() => {
      expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note6'));
    });
    session.noteRef('missing').zoom();
    expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note6'));
  });

  it('distinguishes an addressed subtree from selection-aware checked targeting', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const session = remdo.documentSession;
    await selectNoteRange(remdo, 'note2', 'note4');
    await session.noteRef('note6').toggleChecked();
    expect(['note2', 'note3', 'note4', 'note6', 'note7'].map((id) => session.noteRef(id).getChecked()))
      .toEqual([false, false, false, true, true]);

    // An addressed operation never widens to other selected notes.
    await session.noteRef('note3').toggleChecked();
    expect(['note1', 'note2', 'note3', 'note4', 'note5'].map((id) => session.noteRef(id).getChecked()))
      .toEqual([false, false, true, false, false]);

    session.selection.toggleChecked({ noteId: 'note3' });
    await waitFor(() => {
      expect(['note1', 'note2', 'note3', 'note4', 'note5'].map((id) => session.noteRef(id).getChecked()))
        .toEqual([false, true, true, true, false]);
    });
    session.selection.toggleChecked({ noteId: 'note6' });
    await waitFor(() => {
      expect(['note2', 'note3', 'note4', 'note6', 'note7'].map((id) => session.noteRef(id).getChecked()))
        .toEqual([true, true, true, false, false]);
    });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('converts only the addressed child list and preserves checked state and deeper lists', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const session = remdo.documentSession;
    const parent = session.noteRef('note1');
    const listener = vi.fn();
    onTestFinished(parent.subscribe(listener));
    await session.noteRef('note3').toggleChecked();
    await placeCaretAtNote(remdo, 'note6');

    await parent.setChildListType('number');
    expect(parent.getChildListType()).toBe('number');
    expect(session.noteRef('note2').getChildListType()).toBe('bullet');
    expect(session.noteRef('note6').getChildListType()).toBe('bullet');
    expect(session.noteRef('note3').getChecked()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note6' });
    await waitFor(() => expect(listener).toHaveBeenCalledOnce());

    await session.noteRef('note3').setChildListType('check');
    expect(session.noteRef('note3').getChildListType()).toBeNull();
    expect(session.noteRef('note3').canSetChildListType()).toBe(false);
  });

  it('notifies on checked-state changes and disappearance, with identifiable missing-note reads', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const note = remdo.documentSession.noteRef('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    await note.toggleChecked();
    await waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(note.getChecked()).toBe(true);

    await placeCaretAtNote(remdo, 'note2');
    remdo.documentSession.selection.delete();
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    for (const read of [note.getText, note.getFolded, note.getChecked, note.getChildListType, note.canToggleFold, note.canToggleChecked, note.canSetChildListType]) {
      expect(read).toThrow(NoteUnavailableError);
    }
    const afterDeletion = remdo.getEditorState();
    await note.toggleChecked();
    await note.setChildListType('check');
    remdo.documentSession.selection.toggleChecked({ noteId: 'note2' });
    expect(remdo.getEditorState()).toEqual(afterDeletion);
  });

  it('notifies when the source becomes unavailable and readable again', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    onTestFinished(runtime.dispose);
    const note = runtime.session.noteRef('note2');
    expect(note.getText).toThrow(NoteUnavailableError);
    const stop = runtime.start();
    expect(note.getText).toThrow(NoteUnavailableError);
    runtime.setSourceReady(true);
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    expect(note.getText()).toBe('note2');

    runtime.setSourceReady(false);
    expect(listener).toHaveBeenCalledOnce();
    expect(note.getText).toThrow(NoteUnavailableError);
    await note.toggleFold();
    await note.toggleChecked();
    await note.setChildListType('check');
    runtime.setSourceReady(true);
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(note.getFolded()).toBe(false);
    expect(note.getChecked()).toBe(false);
    expect(note.getChildListType()).toBe('bullet');
    stop();
    expect(note.getText).toThrow(NoteUnavailableError);
  });

  it('keeps a retained reference observable through deletion and undo until cleanup', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    const note = runtime.session.noteRef('note2');
    const observed: (string | undefined)[] = [];
    const unsubscribe = note.subscribe(() => {
      try {
        observed.push(note.getText());
      } catch (error) {
        if (!(error instanceof NoteUnavailableError)) throw error;
        observed.push(undefined);
      }
    });
    onTestFinished(unsubscribe);

    await placeCaretAtNote(remdo, 'note2');
    runtime.session.selection.delete();
    await waitFor(() => expect(observed).toEqual([undefined]));
    expect(note.getText).toThrow(NoteUnavailableError);

    runtime.session.history.undo();
    await waitFor(() => expect(observed).toEqual([undefined, 'note2']));
    expect(note.getText()).toBe('note2');

    await remdo.updateNoteText('note2', 'restored note');
    await waitFor(() => expect(observed).toEqual([undefined, 'note2', 'restored note']));

    unsubscribe();
    await remdo.updateNoteText('note2', 'after cleanup');
    await flushObservations();
    expect(note.getText()).toBe('after cleanup');
    expect(observed).toEqual([undefined, 'note2', 'restored note']);

    runtime.dispose();
    expect(note.getId()).toBe('note2');
    expect(note.getText).toThrow(NoteUnavailableError);
  });

  it('keeps addressed folding inside the zoom boundary', meta({
    fixture: 'tree-complex',
    viewProps: { zoomNoteId: 'note2' },
  }), async ({ remdo }) => {
    const session = remdo.documentSession;
    for (const noteId of ['note1', 'note2', 'note6']) {
      const note = session.noteRef(noteId);
      expect(note.getText()).toBe(noteId);
      await note.toggleFold();
      expect(note.getFolded()).toBe(false);
    }
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
        void runtime.session.noteRef('note2').toggleFold();
      }
    });
    runtime.session.noteRef('note1').subscribe(listener);
    armed = true;

    await placeCaretAtNote(remdo, 'note1');
    await typeText(remdo, '!');

    await waitFor(() => {
      expect(runtime.session.noteRef('note2').getFolded()).toBe(true);
    });
  });

  it('withdraws capabilities and rejects search until the source becomes ready again', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    await placeCaretAtNote(remdo, 'note3');
    runtime.session.capabilities.subscribe(() => {});
    await waitUntilReady(runtime.session.capabilities);

    runtime.setSourceReady(false);
    await expect(runtime.session.search(SEARCH_ALL)).rejects.toThrow('not available');
    expect(runtime.session.capabilities.getSnapshot()).toEqual({ status: 'loading' });
    await expect(runtime.session.noteRef('note1').toggleFold()).resolves.toBeUndefined();

    await typeText(remdo, 'fresh ');
    runtime.setSourceReady(true);

    const { flatResults } = await runtime.session.search({ ...SEARCH_ALL, query: 'fresh' });
    expect(flatResults.map(({ note }) => note.text)).toEqual(['fresh note3']);
    await waitUntilReady(runtime.session.capabilities);
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

  it('surfaces invalid source state and reads a later valid state', meta({
    expectedConsoleIssues: ['runtime.invariant Root must contain exactly one top-level list node'],
  }), async () => {
    const mounted = createMountedLexicalEditor({
      namespace: 'document-session-error-recovery',
      nodes: editorNodes,
      onError: (error) => { throw error; },
    });
    onTestFinished(mounted.dispose);
    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'), { discrete: true });
    const runtime = createLexicalDocumentSessionRuntime({
      editor: mounted.editor,
      docId: 'document',
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    expect((await runtime.session.search(SEARCH_ALL)).flatResults[0]!.note.text).toBe('First');
    const note = runtime.session.noteRef('first');
    const observed: unknown[] = [];
    const unsubscribe = note.subscribe(() => {
      try {
        observed.push(note.getText());
      } catch (error) {
        observed.push(error);
      }
    });
    onTestFinished(unsubscribe);

    mounted.editor.update(() => $getRoot().clear(), { discrete: true });
    await expect(runtime.session.search(SEARCH_ALL)).rejects.toThrow('Missing document root list');
    await waitFor(() => {
      expect(observed.at(-1)).toEqual(expect.objectContaining({
        message: 'Outline schema invariant: Root must contain exactly one top-level list node',
      }));
      expect(observed.at(-1)).not.toBeInstanceOf(NoteUnavailableError);
    });

    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'), { discrete: true });
    await waitFor(() => expect(observed.at(-1)).toBe('First'));
    expect((await runtime.session.search(SEARCH_ALL)).flatResults[0]!.note.text).toBe('First');
    unsubscribe();
  });

  it('observes recovery when subscribed during a read failure', meta({
    expectedConsoleIssues: ['runtime.invariant Root must contain exactly one top-level list node'],
  }), async () => {
    const mounted = createMountedLexicalEditor({
      namespace: 'document-session-subscribe-recovery',
      nodes: editorNodes,
      onError: (error) => { throw error; },
    });
    onTestFinished(mounted.dispose);
    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'), { discrete: true });
    const runtime = createLexicalDocumentSessionRuntime({ editor: mounted.editor, docId: 'document' });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    const note = runtime.session.noteRef('first');
    mounted.editor.update(() => $getRoot().clear(), { discrete: true });

    const recovered: string[] = [];
    onTestFinished(note.subscribe(() => recovered.push(note.getText())));
    expect(note.getText).toThrow('Root must contain exactly one top-level list node');

    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'), { discrete: true });
    await waitFor(() => expect(recovered).toEqual(['First']));
  });

  for (const rethrow of [false, true]) {
    it(`rejects failed addressed operations when the host rethrows: ${rethrow}`, meta({ fixture: 'tree' }), async ({ remdo }) => {
      const errors: Error[] = [];
      const mounted = createMountedLexicalEditor({
        namespace: 'document-session-operation-error',
        nodes: editorNodes,
        onError: (error) => {
          errors.push(error);
          if (rethrow) throw error;
        },
      });
      onTestFinished(mounted.dispose);
      mounted.editor.setEditorState(mounted.editor.parseEditorState(remdo.editor.getEditorState().toJSON()));
      const runtime = createLexicalDocumentSessionRuntime({ editor: mounted.editor, docId: 'document' });
      runtime.start();
      runtime.setSourceReady(true);
      onTestFinished(runtime.dispose);
      const failure = new Error('Failed fold operation');
      const unregister = mounted.editor.registerCommand(SET_NOTE_FOLD_COMMAND, () => { throw failure; }, COMMAND_PRIORITY_HIGH);
      onTestFinished(unregister);
      const note = runtime.session.noteRef('note2');
      let outcome: unknown = 'pending';
      const mutation = note.toggleFold();
      void mutation.then(() => { outcome = 'resolved'; }, (error: unknown) => { outcome = error; });
      await flushObservations();
      expect(outcome).toBe(failure);
      expect(errors).toEqual([failure]);
      expect(note.getFolded()).toBe(false);

      unregister();
      mounted.editor.update(() => $setSingleNoteDocument('first', 'Later edit'), { discrete: true });
      await expect(mutation).rejects.toBe(failure);
      expect(runtime.session.noteRef('first').getText()).toBe('Later edit');
    });
  }

  it('makes every operation inert after stop and dispose', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    const stop = runtime.start();
    runtime.setSourceReady(true);
    await placeCaretAtNote(remdo, 'note2');
    runtime.session.capabilities.subscribe(() => {});
    await waitUntilReady(runtime.session.capabilities);
    const dispatch = vi.spyOn(remdo.editor, 'dispatchCommand');
    dispatch.mockClear();

    stop();
    await expect(runtime.session.search(SEARCH_ALL)).rejects.toThrow('not available');
    expect(runtime.session.capabilities.getSnapshot()).toEqual({ status: 'loading' });
    await runtime.session.noteRef('note2').toggleFold();
    await runtime.session.noteRef('note2').toggleChecked();
    await runtime.session.noteRef('note2').setChildListType('check');
    runtime.session.noteRef('note2').zoom();
    runtime.session.view.zoomOut();
    runtime.session.view.foldToLevel(1);
    runtime.session.selection.toggleChecked({ noteId: 'note2' });
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
    await expect(runtime.session.search(SEARCH_ALL)).rejects.toThrow('not available');
    runtime.session.history.undo();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
