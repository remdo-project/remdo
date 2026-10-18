import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { createUserDataRootNote, NoteUnavailableError } from '#note-sdk';
import type { UserDocument } from '#note-sdk';
import { meta } from '#tests';
import { $requireRootContentList } from '#client/editor/outline/schema';
import { createLexicalOpenDocumentRuntime } from './lexical-open-document';

function metadataFor(documentId: string) {
  let document: UserDocument = { id: documentId, title: 'Project', shareable: true, deletable: true };
  let listed = true;
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of [...listeners]) listener(); };
  const rename = vi.fn(async (_id: string, title: string) => {
    document = { ...document, title };
    publish();
  });
  const userData = createUserDataRootNote({
    getChildren: () => listed ? [document] : [],
    getById: (id) => listed && id === documentId ? document : null,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  }, { renameDocument: rename });
  return {
    note: userData.documentRef(documentId), rename,
    setListed(next: boolean) { listed = next; publish(); },
    setShareable(next: boolean) { document = { ...document, shareable: next }; publish(); },
  };
}

describe('document note in an opened editor', () => {
  it('exposes real parents and renames the same document without changing editor content', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    const metadata = metadataFor(docId);
    expect(metadata.note.getId()).toBe(docId);
    expect(metadata.note.content.getChildren).toThrow(NoteUnavailableError);
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId, metadataNote: metadata.note });
    onTestFinished(runtime.dispose);
    runtime.start();
    runtime.setSourceReady(true);
    const { root, noteRef } = runtime.openDocument;
    const parent = noteRef('note2').getParent();
    expect(parent.getKind()).toBe('editor-note');
    expect(parent.as('editor-note').getText()).toBe('note1');
    expect(parent.getParent()).toBe(root.content);
    expect(root.getKind()).toBe('document');
    expect(root.as('document')).toBe(root);
    expect(root.getId()).toBe(docId);
    expect(root.getParent()).toBeNull();
    expect(root.getText()).toBe('Project');
    expect(root.getChildren()).toEqual([root.content, root.access]);
    expect(root.content.getParent()).toBe(root);
    expect(root.access.getParent()).toBe(root);
    expect(root.content.getById('note1')!.getParent()).toBe(root.content);
    expect(root.content.getById('note2')).toBeNull();
    expect(() => root.as('editor-note')).toThrow('expected "editor-note"');

    const state = remdo.editor.getEditorState();
    const editorUpdate = vi.fn();
    onTestFinished(remdo.editor.registerUpdateListener(editorUpdate));
    expect(await root.rename('Renamed')).toBe(root);
    expect(metadata.rename).toHaveBeenCalledWith(docId, 'Renamed');
    expect(metadata.note.getText()).toBe('Renamed');
    expect(noteRef('note1').getParent().getParent()?.getText()).toBe('Renamed');
    expect(root.content.getChildren().map((note) => note.getId())).toEqual(['note1', 'note3', 'note5']);
    expect(remdo.editor.getEditorState()).toBe(state);
    expect(editorUpdate).not.toHaveBeenCalled();

    metadata.setListed(false);
    expect(root.getText).toThrow(NoteUnavailableError);
    expect(root.canRename()).toBe(false);
    expect(noteRef('note2').getText()).toBe('note2');
    await root.rename('Accepted while unlisted');
    metadata.setListed(true);
    expect(root.getText()).toBe('Accepted while unlisted');
  });

  it('observes metadata, root children and independent readiness without loading missing data', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const metadata = metadataFor(remdo.getCollabDocId());
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId(), metadataNote: metadata.note });
    onTestFinished(runtime.dispose);
    const root = runtime.openDocument.root;
    const changed = vi.fn();
    onTestFinished(root.subscribe(changed));
    runtime.start();
    expect(changed).toHaveBeenCalledOnce();
    expect(root.getText()).toBe('Project');
    expect(root.content.getChildren).toThrow(NoteUnavailableError);
    changed.mockClear();

    runtime.setSourceReady(true);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
    changed.mockClear();
    await root.content.appendChildren([{ text: 'Added' }]);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(root.content.getChildren().at(-1)!.getText()).toBe('Added');
    changed.mockClear();
    await remdo.mutate(() => $requireRootContentList().setListType('number'));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(root.content.getChildListType()).toBe('number');
    changed.mockClear();

    metadata.setShareable(false);
    expect(changed).toHaveBeenCalledOnce();
    expect(root.canShareWith()).toBe(false);
    changed.mockClear();
    runtime.setSourceReady(false);
    expect(changed).toHaveBeenCalledOnce();
    expect(root.content.getChildren).toThrow(NoteUnavailableError);
    expect(root.getText()).toBe('Project');
    expect(root.canRename()).toBe(true);
    changed.mockClear();
    runtime.setSourceReady(true);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
  });

  it('lets root subscribers perform another content operation after a child-list change', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId() });
    onTestFinished(runtime.dispose);
    runtime.start();
    runtime.setSourceReady(true);
    const root = runtime.openDocument.root;
    let appended = false;
    let followup: Promise<string[]> | undefined;
    onTestFinished(root.subscribe(() => {
      if (!appended && root.content.getChildren().at(-1)?.getText() === 'First') {
        appended = true;
        followup = root.content.appendChildren([{ text: 'From subscriber' }]);
      }
    }));
    await root.content.appendChildren([{ text: 'First' }]);
    await vi.waitFor(() => expect(followup).toBeDefined());
    await followup;
    expect(root.content.getChildren().slice(-2).map((note) => note.getText())).toEqual(['First', 'From subscriber']);
  });

  it('observes Access host availability without publishing content readiness or edits', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const metadata = metadataFor(remdo.getCollabDocId());
    const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId(), metadataNote: metadata.note });
    onTestFinished(runtime.dispose);
    const access = runtime.openDocument.root.access;
    const changed = vi.fn();
    onTestFinished(access.subscribe(changed));
    expect(access.getChildren).toThrow(NoteUnavailableError);

    const stop = runtime.start();
    expect(changed).toHaveBeenCalledOnce();
    expect(access.getChildren()).toEqual([]);
    changed.mockClear();
    runtime.setSourceReady(true);
    await runtime.openDocument.root.content.appendChildren([{ text: 'Content edit' }]);
    expect(changed).not.toHaveBeenCalled();
    runtime.setSourceReady(false);
    expect(changed).not.toHaveBeenCalled();
    expect(access.getChildren()).toEqual([]);

    stop();
    expect(changed).toHaveBeenCalledOnce();
    expect(access.getChildren).toThrow(NoteUnavailableError);
    changed.mockClear();
    runtime.start();
    expect(changed).toHaveBeenCalledOnce();
    expect(access.getChildren()).toEqual([]);
  });

  it('expires one opened reference permanently while other references to the document remain usable', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const metadata = metadataFor(remdo.getCollabDocId());
    const open = () => {
      const runtime = createLexicalOpenDocumentRuntime({ editor: remdo.editor, docId: remdo.getCollabDocId(), metadataNote: metadata.note });
      onTestFinished(runtime.dispose);
      runtime.start();
      runtime.setSourceReady(true);
      return runtime;
    };
    const first = open();
    const second = open();
    const oldRoot = first.openDocument.root;
    const changed = vi.fn();
    const stop = oldRoot.subscribe(changed);
    first.dispose();
    expect(changed).toHaveBeenCalledOnce();
    expect(oldRoot.getId()).toBe(remdo.getCollabDocId());
    expect(oldRoot.getText).toThrow(NoteUnavailableError);
    expect(oldRoot.getParent).toThrow(NoteUnavailableError);
    expect(oldRoot.getChildren).toThrow(NoteUnavailableError);
    expect(oldRoot.canRename()).toBe(false);
    await expect(oldRoot.rename('Must not write')).rejects.toThrow(NoteUnavailableError);
    expect(metadata.rename).not.toHaveBeenCalled();
    expect(second.openDocument.root.content.getChildren()[0]!.getText()).toBe('note1');

    await metadata.note.rename('Still available');
    expect(changed).toHaveBeenCalledOnce();
    expect(second.openDocument.root.getText()).toBe('Still available');
    const reopened = open().openDocument.root;
    expect(reopened.getId()).toBe(oldRoot.getId());
    expect(reopened).not.toBe(oldRoot);
    expect(reopened.getText()).toBe('Still available');
    expect(oldRoot.getText).toThrow(NoteUnavailableError);
    stop();
    stop();
  });

  it('gives content-only hosts a document identity without inventing metadata', meta({ fixture: 'flat' }), ({ remdo }) => {
    const root = remdo.openDocument.root;
    expect(root.getId()).toBe(remdo.getCollabDocId());
    expect(root.getKind()).toBe('document');
    expect(root.getParent()).toBeNull();
    expect(root.content.getChildren()[0]!.getParent()).toBe(root.content);
    expect(root.getText).toThrow(NoteUnavailableError);
    expect(root.access.getChildren).toThrow(NoteUnavailableError);
    expect(root.canRename()).toBe(false);
    expect(root.canShareWith()).toBe(false);
    expect(root.canDelete()).toBe(false);
  });
});
