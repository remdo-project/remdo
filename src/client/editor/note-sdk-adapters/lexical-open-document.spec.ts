/* eslint-disable ts/no-deprecated -- drives the undo-availability commands the open document observes, where the deprecation is tracked. */
import { waitFor } from '@testing-library/react';
import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  $createTextNode,
  $getRoot,
  $setState,
  createEditor,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_HIGH,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { IneligibleOperationError, NoteUnavailableError } from '#note-sdk';
import { createMountedLexicalEditor, getNoteKey, meta, placeCaretAtNote, selectNoteRange, typeText } from '#tests';
import type { CreateEditorArgs } from 'lexical';
import { createEditorInitialConfig } from '#client/editor/runtime/config';
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
import { createLexicalOpenDocumentRuntime } from './lexical-open-document';

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

describe('lexical open document', () => {
  it('reads current focus, selection, and history capabilities without subscribing', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    const { openDocument } = runtime;

    await placeCaretAtNote(remdo, 'note1');
    expect(openDocument.focus.canToggleFold()).toBe(false);
    expect(openDocument.selection.canDelete()).toBe(true);
    await placeCaretAtNote(remdo, 'note2');
    expect(openDocument.focus.canToggleFold()).toBe(true);

    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    remdo.editor.dispatchCommand(CAN_REDO_COMMAND, true);
    expect(openDocument.history.canUndo()).toBe(true);
    expect(openDocument.history.canRedo()).toBe(true);

    const unsubscribe = openDocument.subscribeCapabilities(() => {});
    unsubscribe();
    await placeCaretAtNote(remdo, 'note3');
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, false);
    expect(openDocument.focus.canToggleFold()).toBe(false);
    expect(openDocument.history.canUndo()).toBe(false);
  });

  it('returns false for open-document and note capabilities while their source is unavailable', meta({ fixture: 'flat' }), ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    onTestFinished(runtime.dispose);
    const { openDocument } = runtime;
    const note = openDocument.noteRef('note1');
    const reads = [
      openDocument.focus.canToggleFold, openDocument.selection.canDelete, openDocument.history.canUndo, openDocument.history.canRedo,
      note.canToggleFold, note.canToggleChecked, note.canSetChildListType,
    ];

    for (const read of reads) expect(read()).toBe(false);
    const stop = runtime.start();
    for (const read of reads) expect(read()).toBe(false);
    runtime.setSourceReady(true);
    expect(openDocument.focus.canToggleFold()).toBe(false);
    expect(openDocument.history.canUndo()).toBe(false);
    stop();
    for (const read of reads) expect(read()).toBe(false);
    runtime.dispose();
    runtime.start();
    for (const read of reads) expect(read()).toBe(false);
  });

  it('observes unavailable-source recovery without losing history state', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    onTestFinished(runtime.dispose);
    const values: boolean[] = [];
    runtime.openDocument.subscribeCapabilities(() => values.push(runtime.openDocument.history.canUndo()));
    runtime.start();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    runtime.setSourceReady(true);
    await flushObservations();
    expect(values).toEqual([true]);

    runtime.setSourceReady(false);
    expect(runtime.openDocument.history.canUndo()).toBe(false);
    runtime.setSourceReady(true);
    expect(runtime.openDocument.history.canUndo()).toBe(true);
    await flushObservations();
    expect(values).toEqual([true, false, true]);
  });

  it('notifies source recovery even when capability values stay false', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    onTestFinished(runtime.dispose);
    runtime.start();
    runtime.setSourceReady(true);
    const values: boolean[] = [];
    runtime.openDocument.subscribeCapabilities(() => values.push(runtime.openDocument.focus.canToggleFold()));

    runtime.setSourceReady(false);
    expect(values).toEqual([false]);
    runtime.setSourceReady(true);
    await flushObservations();
    expect(values).toEqual([false, false]);
  });

  it('keeps registrations independent and repeated cleanup cannot remove a later subscription', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    const listener = vi.fn();
    const first = runtime.openDocument.subscribeCapabilities(listener);
    const second = runtime.openDocument.subscribeCapabilities(listener);
    first();
    first();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    await flushObservations();
    expect(listener).toHaveBeenCalledOnce();

    second();
    const third = runtime.openDocument.subscribeCapabilities(listener);
    second();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, false);
    await flushObservations();
    expect(listener).toHaveBeenCalledTimes(2);
    third();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    await flushObservations();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(runtime.openDocument.history.canUndo()).toBe(true);
  });

  it('preserves unexpected read failures and observes recovery from a failed initial read', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    await placeCaretAtNote(remdo, 'note2');
    const failure = new Error('Capability read failed');
    const read = vi.spyOn(remdo.editor.getEditorState(), 'read').mockImplementation(() => { throw failure; });
    expect(runtime.openDocument.focus.canToggleFold).toThrow(failure);
    expect(runtime.openDocument.selection.canDelete).toThrow(failure);
    const note = runtime.openDocument.noteRef('note2');
    for (const read of [note.canToggleFold, note.canToggleChecked, note.canSetChildListType]) {
      expect(read).toThrow(failure);
    }
    const values: boolean[] = [];
    const unsubscribe = runtime.openDocument.subscribeCapabilities(() => values.push(runtime.openDocument.focus.canToggleFold()));
    onTestFinished(unsubscribe);

    read.mockRestore();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    await flushObservations();
    expect(values).toEqual([true]);
  });

  it('notifies existing listeners when a capability read fails and recovers', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    await placeCaretAtNote(remdo, 'note2');
    const values: unknown[] = [];
    const unsubscribe = runtime.openDocument.subscribeCapabilities(() => {
      try {
        values.push(runtime.openDocument.focus.canToggleFold());
      } catch (error) {
        values.push(error);
      }
    });
    onTestFinished(unsubscribe);
    const failure = new Error('Capability read failed');
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    const read = vi.spyOn(remdo.editor.getEditorState(), 'read').mockImplementation(() => { throw failure; });
    await flushObservations();
    expect(values).toEqual([failure]);

    read.mockRestore();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, false);
    await flushObservations();
    expect(values).toEqual([failure, true]);
  });

  it('allows a capability listener to invoke an operation after publication', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    await placeCaretAtNote(remdo, 'note1');
    const unsubscribe = runtime.openDocument.subscribeCapabilities(() => {
      if (runtime.openDocument.focus.canToggleFold()) {
        unsubscribe();
        runtime.openDocument.focus.toggleFold();
      }
    });
    onTestFinished(unsubscribe);

    await placeCaretAtNote(remdo, 'note2');
    await waitFor(() => expect(runtime.openDocument.noteRef('note2').getFolded()).toBe(true));
  });

  it('reads addressed-note values without subscribing', meta({ fixture: 'tree' }), ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    const note = runtime.openDocument.noteRef('note2');

    expect(note.getText()).toBe('note2');
    expect(note.getFolded()).toBe(false);
  });

  it('rejects search until the runtime starts and the source is ready', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    onTestFinished(() => runtime.dispose());
    await expect(runtime.openDocument.search(SEARCH_ALL)).rejects.toThrow('not available');
    runtime.start();
    await expect(runtime.openDocument.search(SEARCH_ALL)).rejects.toThrow('not available');
    runtime.setSourceReady(true);
    const results = await runtime.openDocument.search(SEARCH_ALL);
    expect(results.flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note2', 'note3']);
  });

  it('does not publish capabilities when focus moves between notes with equal capabilities', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const listener = vi.fn();
    runtime.openDocument.subscribeCapabilities(listener);

    await placeCaretAtNote(remdo, 'note1');
    await flushObservations();
    expect(runtime.openDocument.selection.canDelete()).toBe(true);
    listener.mockClear();

    await placeCaretAtNote(remdo, 'note3');
    await flushObservations();

    expect(runtime.openDocument.selection.canDelete()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('re-resolves a stable note ID after editor-state replacement', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const note = runtime.openDocument.noteRef('note2');

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
    const runtime = createLexicalOpenDocumentRuntime({
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
    runtime.openDocument.subscribeCapabilities(capabilityListener);
    await placeCaretAtNote(remdo, 'note2');
    expect(runtime.openDocument.focus.canToggleFold()).toBe(true);
    expect(runtime.openDocument.selection.canDelete()).toBe(true);
    expect(runtime.openDocument.history.canUndo()).toBe(true);
    expect(runtime.openDocument.history.canRedo()).toBe(false);
    await flushObservations();

    capabilityListener.mockClear();
    setViewRoot(remdo.editor, getNoteKey(remdo, 'note2'));

    await waitFor(() => expect(capabilityListener).toHaveBeenCalledOnce());
    expect(runtime.openDocument.focus.canToggleFold()).toBe(false);
  });

  it('delegates semantic operations and rejects ineligible addressed folding', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    await placeCaretAtNote(remdo, 'note5');
    runtime.openDocument.selection.toggleChecked();
    await waitFor(() => {
      expect(remdo.editor.read(() => $getNoteChecked($findNoteById('note5')!))).toBe(true);
    });

    await runtime.openDocument.noteRef('note6').toggleFold();
    await expect(runtime.openDocument.noteRef('note7').toggleFold()).rejects.toThrow(IneligibleOperationError);
    await expect(runtime.openDocument.noteRef('missing').toggleFold()).rejects.toThrow(IneligibleOperationError);
    expect(runtime.openDocument.noteRef('note6').getFolded()).toBe(true);
    expect(runtime.openDocument.noteRef('note7').getFolded()).toBe(false);
  });

  it('searches the current hierarchy after moving and deleting notes', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    await placeCaretAtNote(remdo, 'note3');
    runtime.openDocument.selection.indent();
    await waitFor(async () => {
      const { flatResults } = await runtime.openDocument.search(SEARCH_ALL);
      expect(flatResults.map(({ path }) => path.map(({ id }) => id))).toEqual([
        ['note1'], ['note1', 'note2'], ['note1', 'note3'],
      ]);
    });

    runtime.openDocument.selection.moveUp();
    await waitFor(async () => {
      const { flatResults } = await runtime.openDocument.search(SEARCH_ALL);
      expect(flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note3', 'note2']);
    });

    runtime.openDocument.selection.delete();
    await waitFor(async () => {
      const { flatResults } = await runtime.openDocument.search(SEARCH_ALL);
      expect(flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note2']);
      expect(flatResults[0]!.note.children?.noteIds).toEqual(['note2']);
    });
  });

  it('reads committed addressed-note values immediately after an awaited mutation', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());

    const note = runtime.openDocument.noteRef('note2');
    expect(note.getId()).toBe('note2');
    expect(note.getText()).toBe('note2');
    expect(note.getFolded()).toBe(false);
    const missing = runtime.openDocument.noteRef('missing');
    expect(missing.getText).toThrow(NoteUnavailableError);
    expect(missing.getFolded).toThrow(NoteUnavailableError);
    expect(missing.getId()).toBe('missing');
    for (const read of [missing.canToggleFold, missing.canToggleChecked, missing.canSetChildListType]) {
      expect(read()).toBe(false);
    }

    await note.toggleFold();

    expect(note.getFolded()).toBe(true);
    expect(remdo.editor.read(() => $isNoteFolded($findNoteById('note2')!))).toBe(true);
  });

  it('notifies an addressed-note subscriber only when that note changes', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const note = runtime.openDocument.noteRef('note2');
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
    const note = remdo.openDocument.noteRef('note2');
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
    const unsubscribe = remdo.openDocument.noteRef('note2').subscribe(listener);
    onTestFinished(unsubscribe);
    onTestFinished(remdo.openDocument.noteRef('note2').subscribe(listener));
    unsubscribe();

    await remdo.updateNoteText('note2', 'changed');
    await flushObservations();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('keeps addressed eligibility and edits independent of the view', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const note = remdo.openDocument.noteRef('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    onTestFinished(() => setViewRoot(remdo.editor, null));

    setViewRoot(remdo.editor, getNoteKey(remdo, 'note2'));
    await flushObservations();
    expect(listener).not.toHaveBeenCalled();
    expect(note.canToggleFold()).toBe(true);
    await note.toggleFold();
    expect(note.getFolded()).toBe(true);
  });

  it('edits addressed notes outside the zoom boundary while selection toggling stays inside', meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    const openDocument = remdo.openDocument;
    await openDocument.noteRef('note6').toggleFold();
    expect(openDocument.noteRef('note6').getFolded()).toBe(true);
    await openDocument.noteRef('note1').setChildListType('number');
    expect(openDocument.noteRef('note1').getChildListType()).toBe('number');
    await openDocument.noteRef('note5').toggleChecked();
    expect(openDocument.noteRef('note5').getChecked()).toBe(true);

    openDocument.selection.toggleChecked({ noteId: 'note6' });
    await flushObservations();
    expect(openDocument.noteRef('note6').getChecked()).toBe(false);
  });

  it('allows addressed edits on the zoom root and its descendants', meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }), async ({ remdo }) => {
    const openDocument = remdo.openDocument;
    await openDocument.noteRef('note1').setChildListType('number');
    expect(openDocument.noteRef('note1').getChildListType()).toBe('number');

    await openDocument.noteRef('note2').toggleFold();
    expect(openDocument.noteRef('note2').getFolded()).toBe(true);
    await openDocument.noteRef('note3').toggleChecked();
    expect(openDocument.noteRef('note3').getChecked()).toBe(true);

    await openDocument.noteRef('note1').toggleChecked();
    expect(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']
      .map((id) => openDocument.noteRef(id).getChecked()))
      .toEqual([true, true, true, true, false, false, false]);
  });

  it('zooms by stable note ID and applies fold levels within the current view', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const openDocument = remdo.openDocument;
    openDocument.noteRef('note2').zoom();
    await waitFor(() => {
      expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note2'));
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    openDocument.view.zoomOut();
    await waitFor(() => {
      expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note1'));
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });
    openDocument.view.foldToLevel(1);
    await waitFor(() => expect(openDocument.noteRef('note2').getFolded()).toBe(true));
    expect(openDocument.noteRef('note1').getFolded()).toBe(false);
    expect(openDocument.noteRef('note6').getFolded()).toBe(false);

    openDocument.view.foldToLevel(0);
    await waitFor(() => expect(openDocument.noteRef('note2').getFolded()).toBe(false));
    openDocument.noteRef('note6').zoom();
    await waitFor(() => {
      expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note6'));
    });
    openDocument.noteRef('missing').zoom();
    expect(remdo.editor.read(() => $resolveViewRoot(remdo.editor)?.getKey())).toBe(getNoteKey(remdo, 'note6'));
  });

  it('distinguishes an addressed subtree from selection-aware checked targeting', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const openDocument = remdo.openDocument;
    await selectNoteRange(remdo, 'note2', 'note4');
    await openDocument.noteRef('note6').toggleChecked();
    expect(['note2', 'note3', 'note4', 'note6', 'note7'].map((id) => openDocument.noteRef(id).getChecked()))
      .toEqual([false, false, false, true, true]);

    // An addressed operation never widens to other selected notes.
    await openDocument.noteRef('note3').toggleChecked();
    expect(['note1', 'note2', 'note3', 'note4', 'note5'].map((id) => openDocument.noteRef(id).getChecked()))
      .toEqual([false, false, true, false, false]);

    openDocument.selection.toggleChecked({ noteId: 'note3' });
    await waitFor(() => {
      expect(['note1', 'note2', 'note3', 'note4', 'note5'].map((id) => openDocument.noteRef(id).getChecked()))
        .toEqual([false, true, true, true, false]);
    });
    openDocument.selection.toggleChecked({ noteId: 'note6' });
    await waitFor(() => {
      expect(['note2', 'note3', 'note4', 'note6', 'note7'].map((id) => openDocument.noteRef(id).getChecked()))
        .toEqual([true, true, true, false, false]);
    });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('converts only the addressed child list and preserves checked state and deeper lists', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const openDocument = remdo.openDocument;
    const parent = openDocument.noteRef('note1');
    const listener = vi.fn();
    onTestFinished(parent.subscribe(listener));
    await openDocument.noteRef('note3').toggleChecked();
    await placeCaretAtNote(remdo, 'note6');

    await parent.setChildListType('number');
    expect(parent.getChildListType()).toBe('number');
    expect(openDocument.noteRef('note2').getChildListType()).toBe('bullet');
    expect(openDocument.noteRef('note6').getChildListType()).toBe('bullet');
    expect(openDocument.noteRef('note3').getChecked()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note6' });
    await waitFor(() => expect(listener).toHaveBeenCalledOnce());

    await expect(openDocument.noteRef('note3').setChildListType('check')).rejects.toThrow(IneligibleOperationError);
    expect(openDocument.noteRef('note3').getChildListType()).toBeNull();
    expect(openDocument.noteRef('note3').canSetChildListType()).toBe(false);
  });

  it('notifies on checked-state changes and disappearance, with identifiable missing-note reads', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const note = remdo.openDocument.noteRef('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    await note.toggleChecked();
    await waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(note.getChecked()).toBe(true);

    await placeCaretAtNote(remdo, 'note2');
    remdo.openDocument.selection.delete();
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    for (const read of [note.getText, note.getFolded, note.getChecked, note.getChildListType]) {
      expect(read).toThrow(NoteUnavailableError);
    }
    for (const read of [note.canToggleFold, note.canToggleChecked, note.canSetChildListType]) {
      expect(read()).toBe(false);
    }
    const afterDeletion = remdo.getEditorState();
    await expect(note.toggleChecked()).rejects.toThrow(IneligibleOperationError);
    await expect(note.setChildListType('check')).rejects.toThrow(IneligibleOperationError);
    remdo.openDocument.selection.toggleChecked({ noteId: 'note2' });
    expect(remdo.getEditorState()).toEqual(afterDeletion);
  });

  it('notifies when the source becomes unavailable and readable again', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    onTestFinished(runtime.dispose);
    const note = runtime.openDocument.noteRef('note2');
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
    await expect(note.toggleFold()).rejects.toThrow(IneligibleOperationError);
    await expect(note.toggleChecked()).rejects.toThrow(IneligibleOperationError);
    await expect(note.setChildListType('check')).rejects.toThrow(IneligibleOperationError);
    runtime.setSourceReady(true);
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(note.getFolded()).toBe(false);
    expect(note.getChecked()).toBe(false);
    expect(note.getChildListType()).toBe('bullet');
    stop();
    expect(note.getText).toThrow(NoteUnavailableError);
  });

  it('keeps a retained reference observable through deletion and undo until cleanup', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    const note = runtime.openDocument.noteRef('note2');
    const observed: (string | undefined)[] = [];
    const eligibility: boolean[] = [];
    const unsubscribe = note.subscribe(() => {
      eligibility.push(note.canToggleChecked());
      try {
        observed.push(note.getText());
      } catch (error) {
        if (!(error instanceof NoteUnavailableError)) throw error;
        observed.push(undefined);
      }
    });
    onTestFinished(unsubscribe);

    await placeCaretAtNote(remdo, 'note2');
    runtime.openDocument.selection.delete();
    await waitFor(() => expect(observed).toEqual([undefined]));
    expect(eligibility).toEqual([false]);
    expect(note.getText).toThrow(NoteUnavailableError);

    runtime.openDocument.history.undo();
    await waitFor(() => expect(observed).toEqual([undefined, 'note2']));
    expect(eligibility).toEqual([false, true]);
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

  it('maps each named operation to its semantic editor command', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const dispatch = vi.spyOn(remdo.editor, 'dispatchCommand');

    dispatch.mockClear();
    runtime.openDocument.selection.indent();
    expect(dispatch).toHaveBeenCalledWith(INDENT_NOTES_COMMAND, undefined);

    dispatch.mockClear();
    runtime.openDocument.selection.outdent();
    expect(dispatch).toHaveBeenCalledWith(OUTDENT_NOTES_COMMAND, undefined);

    dispatch.mockClear();
    runtime.openDocument.selection.moveUp();
    expect(dispatch).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND, undefined);

    dispatch.mockClear();
    runtime.openDocument.selection.moveDown();
    expect(dispatch).toHaveBeenCalledWith(REORDER_NOTES_DOWN_COMMAND, undefined);

    dispatch.mockClear();
    runtime.openDocument.selection.toggleChecked();
    expect(dispatch).toHaveBeenCalledWith(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

    dispatch.mockClear();
    runtime.openDocument.selection.delete();
    expect(dispatch).toHaveBeenCalledWith(DELETE_SELECTED_NOTES_COMMAND, undefined);

    dispatch.mockClear();
    runtime.openDocument.history.undo();
    expect(dispatch).toHaveBeenCalledWith(UNDO_COMMAND, undefined);

    dispatch.mockClear();
    runtime.openDocument.history.redo();
    expect(dispatch).toHaveBeenCalledWith(REDO_COMMAND, undefined);

    await placeCaretAtNote(remdo, 'note6');
    dispatch.mockClear();
    runtime.openDocument.focus.toggleFold();
    expect(dispatch).toHaveBeenCalledWith(SET_NOTE_FOLD_COMMAND, {
      state: 'toggle',
      noteItemKey: getNoteKey(remdo, 'note6'),
    });
  });

  it('allows a subscriber to invoke a fresh SDK mutation after publication', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
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
        void runtime.openDocument.noteRef('note2').toggleFold();
      }
    });
    runtime.openDocument.noteRef('note1').subscribe(listener);
    armed = true;

    await placeCaretAtNote(remdo, 'note1');
    await typeText(remdo, '!');

    await waitFor(() => {
      expect(runtime.openDocument.noteRef('note2').getFolded()).toBe(true);
    });
  });

  it('withdraws capabilities and rejects search until the source becomes ready again', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    await placeCaretAtNote(remdo, 'note3');
    runtime.openDocument.subscribeCapabilities(() => {});
    expect(runtime.openDocument.history.canUndo).not.toThrow();

    runtime.setSourceReady(false);
    await expect(runtime.openDocument.search(SEARCH_ALL)).rejects.toThrow('not available');
    expect(runtime.openDocument.history.canUndo()).toBe(false);
    await expect(runtime.openDocument.noteRef('note1').toggleFold()).rejects.toThrow(IneligibleOperationError);
    expect(runtime.openDocument.root.getChildren).toThrow(NoteUnavailableError);

    await typeText(remdo, 'fresh ');
    runtime.setSourceReady(true);

    const { flatResults } = await runtime.openDocument.search({ ...SEARCH_ALL, query: 'fresh' });
    expect(flatResults.map(({ note }) => note.text)).toEqual(['fresh note3']);
    expect(runtime.openDocument.history.canUndo).not.toThrow();
  });

  it('retains history capability changes across a stop and restart', meta({ fixture: 'flat' }), ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    const stop = runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    runtime.openDocument.subscribeCapabilities(() => {});
    expect(runtime.openDocument.history.canUndo).not.toThrow();

    stop();
    remdo.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    expect(runtime.openDocument.history.canUndo()).toBe(false);

    runtime.start();
    expect(runtime.openDocument.history.canUndo()).toBe(true);
  });

  it('surfaces invalid source state and reads a later valid state', meta({
    expectedConsoleIssues: ['runtime.invariant Root must contain exactly one top-level list node'],
  }), async () => {
    const mounted = createMountedLexicalEditor({
      namespace: 'open-document-error-recovery',
      nodes: editorNodes,
      onError: (error) => { throw error; },
    });
    onTestFinished(mounted.dispose);
    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'), { discrete: true });
    const runtime = createLexicalOpenDocumentRuntime({
      editor: mounted.editor,
      docId: 'document',
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    expect((await runtime.openDocument.search(SEARCH_ALL)).flatResults[0]!.note.text).toBe('First');
    const note = runtime.openDocument.noteRef('first');
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
    await expect(runtime.openDocument.search(SEARCH_ALL)).rejects.toThrow('Missing document root list');
    await waitFor(() => {
      expect(observed.at(-1)).toEqual(expect.objectContaining({
        message: 'Outline schema invariant: Root must contain exactly one top-level list node',
      }));
      expect(observed.at(-1)).not.toBeInstanceOf(NoteUnavailableError);
    });

    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'), { discrete: true });
    await waitFor(() => expect(observed.at(-1)).toBe('First'));
    expect((await runtime.openDocument.search(SEARCH_ALL)).flatResults[0]!.note.text).toBe('First');
    unsubscribe();
  });

  it('observes recovery when subscribed during a read failure', meta({
    expectedConsoleIssues: ['runtime.invariant Root must contain exactly one top-level list node'],
  }), async () => {
    const mounted = createMountedLexicalEditor({
      namespace: 'open-document-subscribe-recovery',
      nodes: editorNodes,
      onError: (error) => { throw error; },
    });
    onTestFinished(mounted.dispose);
    mounted.editor.update(() => $setSingleNoteDocument('first', 'First'), { discrete: true });
    const runtime = createLexicalOpenDocumentRuntime({ editor: mounted.editor, docId: 'document' });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(runtime.dispose);
    const note = runtime.openDocument.noteRef('first');
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
        namespace: 'open-document-operation-error',
        nodes: editorNodes,
        onError: (error) => {
          errors.push(error);
          if (rethrow) throw error;
        },
      });
      onTestFinished(mounted.dispose);
      mounted.editor.setEditorState(mounted.editor.parseEditorState(remdo.editor.getEditorState().toJSON()));
      const runtime = createLexicalOpenDocumentRuntime({ editor: mounted.editor, docId: 'document' });
      runtime.start();
      runtime.setSourceReady(true);
      onTestFinished(runtime.dispose);
      const failure = new Error('Failed fold operation');
      const unregister = mounted.editor.registerCommand(SET_NOTE_FOLD_COMMAND, () => { throw failure; }, COMMAND_PRIORITY_HIGH);
      onTestFinished(unregister);
      const note = runtime.openDocument.noteRef('note2');
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
      expect(runtime.openDocument.noteRef('first').getText()).toBe('Later edit');
    });
  }

  it('rejects addressed operations and makes others inert after stop and dispose', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    const stop = runtime.start();
    runtime.setSourceReady(true);
    await placeCaretAtNote(remdo, 'note2');
    runtime.openDocument.subscribeCapabilities(() => {});
    expect(runtime.openDocument.history.canUndo).not.toThrow();
    const dispatch = vi.spyOn(remdo.editor, 'dispatchCommand');
    dispatch.mockClear();

    stop();
    await expect(runtime.openDocument.search(SEARCH_ALL)).rejects.toThrow('not available');
    expect(runtime.openDocument.history.canUndo()).toBe(false);
    await expect(runtime.openDocument.noteRef('note2').toggleFold()).rejects.toThrow(IneligibleOperationError);
    await expect(runtime.openDocument.noteRef('note2').toggleChecked()).rejects.toThrow(IneligibleOperationError);
    await expect(runtime.openDocument.noteRef('note2').setChildListType('check')).rejects.toThrow(IneligibleOperationError);
    await expect(runtime.openDocument.root.appendChildren([{ text: 'new' }])).rejects.toThrow(IneligibleOperationError);
    runtime.openDocument.noteRef('note2').zoom();
    runtime.openDocument.view.zoomOut();
    runtime.openDocument.view.foldToLevel(1);
    runtime.openDocument.selection.toggleChecked({ noteId: 'note2' });
    runtime.openDocument.selection.indent();
    runtime.openDocument.selection.outdent();
    runtime.openDocument.selection.moveUp();
    runtime.openDocument.selection.moveDown();
    runtime.openDocument.selection.toggleChecked();
    runtime.openDocument.selection.delete();
    runtime.openDocument.history.undo();
    runtime.openDocument.history.redo();
    expect(dispatch).not.toHaveBeenCalled();

    runtime.dispose();
    runtime.start();
    runtime.setSourceReady(true);
    await expect(runtime.openDocument.search(SEARCH_ALL)).rejects.toThrow('not available');
    runtime.openDocument.history.undo();
    expect(dispatch).not.toHaveBeenCalled();
  });

  describe('note insertion', () => {
    it('appends a described subtree under a parent and at the document end', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;
      const [summary] = await openDocument.noteRef('note1').appendChildren([{
        text: 'Summary',
        childListType: 'check',
        children: [{ text: 'Done', checked: true }, { text: 'Open' }],
      }]);
      const [first, second] = await openDocument.root.appendChildren([{ text: 'First' }, { text: 'Second' }]);

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [{
            noteId: summary!,
            text: 'Summary',
            children: [{ noteId: null, text: 'Done', checked: true }, { noteId: null, text: 'Open' }],
          }],
        },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
        { noteId: first!, text: 'First' },
        { noteId: second!, text: 'Second' },
      ]);
      expect(openDocument.noteRef('note1').getChildListType()).toBe('bullet');
      expect(openDocument.noteRef(summary!).getChildListType()).toBe('check');
      expect(openDocument.root.getChildren().map((note) => note.getId())).toEqual(['note1', 'note2', first, second]);
      expect(openDocument.noteRef(summary!).getChildren().map((note) => note.getText())).toEqual(['Done', 'Open']);
    });

    it('notifies a subscriber of the parent when its children change', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const parent = remdo.openDocument.noteRef('note2');
      const listener = vi.fn();
      onTestFinished(parent.subscribe(listener));

      await parent.appendChildren([{ text: 'added' }]);

      await waitFor(() => expect(listener).toHaveBeenCalledOnce());
      expect(parent.getChildren().map((note) => note.getText())).toEqual(['note3', 'added']);
    });

    it('keeps the existing child list type, fold state, and caret', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;
      const parent = openDocument.noteRef('note2');
      await parent.setChildListType('number');
      await parent.toggleFold();
      await placeCaretAtNote(remdo, 'note1');

      await parent.appendChildren([{ text: 'added' }]);

      expect(parent.getChildListType()).toBe('number');
      expect(parent.getFolded()).toBe(true);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('undoes a whole insertion at once', meta({ fixture: 'flat' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;
      await openDocument.noteRef('note1').appendChildren([{ text: 'parent', children: [{ text: 'child' }] }]);

      openDocument.history.undo();

      await waitFor(() => expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]));
    });

    it('rejects an unavailable parent or line break without changing the document', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;
      const before = remdo.getEditorState();

      await expect(openDocument.noteRef('missing').appendChildren([{ text: 'orphan' }]))
        .rejects.toThrow(IneligibleOperationError);
      await expect(openDocument.root.appendChildren([{ text: 'valid', children: [{ text: 'two\nlines' }] }]))
        .rejects.toThrow(IneligibleOperationError);
      await expect(openDocument.noteRef('note1').appendChildren([])).resolves.toEqual([]);

      expect(remdo.getEditorState()).toEqual(before);
    });

    it('inserts through an editor without browser plugins', async () => {
      const editor = createEditor(createEditorInitialConfig() as CreateEditorArgs);
      editor.update(() => $setSingleNoteDocument('rootnote', 'Root'), { discrete: true });
      const runtime = createLexicalOpenDocumentRuntime({ editor, docId: 'headless' });
      runtime.start();
      runtime.setSourceReady(true);
      onTestFinished(runtime.dispose);

      const [parent] = await runtime.openDocument.noteRef('rootnote').appendChildren([
        { text: 'Parent', children: [{ text: 'Child' }] },
      ]);

      const { flatResults } = await runtime.openDocument.search({ ...SEARCH_ALL, query: 'Child' });
      expect(flatResults[0]!.path.map(({ id, text }) => [id === parent, text]))
        .toEqual([[false, 'Root'], [true, 'Parent'], [false, 'Child']]);
    });
  });
});
