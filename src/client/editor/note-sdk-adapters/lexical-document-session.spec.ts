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
    const note = runtime.session.note('note2');

    const serialized = remdo.getEditorState();
    const replacement = remdo.editor.parseEditorState(JSON.stringify(serialized));
    remdo.editor.setEditorState(replacement);
    await note.toggleFold();

    expect(note.folded()).toBe(true);
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

    await runtime.session.note('note6').toggleFold();
    await runtime.session.note('note7').toggleFold();
    await runtime.session.note('missing').toggleFold();
    expect(runtime.session.note('note6').folded()).toBe(true);
    expect(runtime.session.note('note7').folded()).toBe(false);
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

    const note = runtime.session.note('note2');
    expect(note.id()).toBe('note2');
    expect(note.text()).toBe('note2');
    expect(note.folded()).toBe(false);
    expect(() => runtime.session.note('missing').text()).toThrow();

    await note.toggleFold();

    expect(note.folded()).toBe(true);
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
    const note = runtime.session.note('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));

    expect(note.text()).toBe('note2');
    expect(listener).not.toHaveBeenCalled();

    await remdo.updateNoteText('note1', 'unrelated');
    await flushObservations();
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
    runtime.session.note('note1').subscribe(listener);
    armed = true;

    await placeCaretAtNote(remdo, 'note1');
    await typeText(remdo, '!');

    await waitFor(() => {
      expect(runtime.session.note('note2').folded()).toBe(true);
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
    await expect(runtime.session.note('note1').toggleFold()).resolves.toBeUndefined();

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

  it('rejects a search of invalid state and searches a later valid state', async () => {
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

    mounted.editor.update(() => $getRoot().clear(), { discrete: true });
    await expect(runtime.session.search(SEARCH_ALL)).rejects.toThrow('Missing document root list');

    mounted.editor.update(() => $setSingleNoteDocument('second', 'Second'), { discrete: true });
    expect((await runtime.session.search(SEARCH_ALL)).flatResults[0]!.note.text).toBe('Second');
  });

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
    await runtime.session.note('note2').toggleFold();
    runtime.session.view.foldToLevel(1);
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
    runtime.session.view.foldToLevel(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
