import { expect, it, vi } from 'vitest';
import type { CollectionSource, UserDocument } from '#note-sdk';
import { createUserDataRootNote } from './create-user-data-notes';
import { createDocumentNote } from './create-document-note';
import { NoteUnavailableError } from './note-unavailable-error';

function createContent() {
  const listeners = new Set<() => void>();
  return {
    listeners,
    source: {
      getChildren: () => [],
      getChildListType: () => 'bullet' as const,
      appendChildren: vi.fn(async () => ['child']),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    },
  };
}

it('exposes document identity while missing sources stay unavailable', async () => {
  const document = createDocumentNote('document');

  expect(document.getId()).toBe('document');
  expect(document.getKind()).toBe('document');
  expect(document.as('document')).toBe(document);
  expect(document.getParent()).toBeNull();
  expect(document.getChildren()).toEqual([document.content, document.access]);
  expect(document.content.getKind()).toBe('collection');
  expect(document.access.getKind()).toBe('collection');
  expect(document.content.getParent()).toBe(document);
  expect(document.access.getParent()).toBe(document);
  for (const read of [document.getText, document.access.getChildren, document.getSharingSuggestions, document.content.getChildren, document.content.getChildListType]) {
    expect(read).toThrow(NoteUnavailableError);
  }
  expect(document.canRename()).toBe(false);
  expect(document.canShareWith()).toBe(false);
  expect(document.canDelete()).toBe(false);
  await expect(document.rename('Title')).rejects.toBeInstanceOf(NoteUnavailableError);
  await expect(document.shareWith('reader@example.test')).rejects.toBeInstanceOf(NoteUnavailableError);
  await expect(document.delete()).rejects.toBeInstanceOf(NoteUnavailableError);
  await expect(document.content.appendChildren([{ text: 'Child' }])).rejects.toBeInstanceOf(NoteUnavailableError);
});

it('keeps opened content available independently of metadata', async () => {
  const { source } = createContent();
  const document = createDocumentNote('document', { content: source });

  expect(document.getText).toThrow(NoteUnavailableError);
  expect(document.canRename()).toBe(false);
  expect(document.content.getChildListType()).toBe('bullet');
  await expect(document.content.appendChildren([{ text: 'Child' }])).resolves.toEqual(['child']);
  expect(source.appendChildren).toHaveBeenCalledWith([{ text: 'Child' }]);
});

it('returns the composed document after an acknowledged metadata rename', async () => {
  const documents: UserDocument[] = [{ id: 'document', title: 'Before' }];
  const metadata = createUserDataRootNote(documents, {
    renameDocument: async (_id, title) => { documents[0]!.title = title; },
  }).documentRef('document');
  const { source } = createContent();
  const document = createDocumentNote('document', { metadata, content: source });

  const renamed = await document.rename('After');

  expect(renamed).toBe(document);
  expect(renamed.as('document')).toBe(document);
  expect(renamed.getText()).toBe('After');
  expect(metadata.getText()).toBe('After');
  expect(renamed.content.getChildListType()).toBe('bullet');
});

it('observes both sources independently and notifies unavailability before releasing a closed host', () => {
  const metadataListeners = new Set<() => void>();
  const documents: CollectionSource<UserDocument> = {
    getChildren: () => [{ id: 'document', title: 'Title' }],
    getById: () => ({ id: 'document', title: 'Title' }),
    subscribe: (listener) => { metadataListeners.add(listener); return () => { metadataListeners.delete(listener); }; },
  };
  const metadata = createUserDataRootNote(documents).documentRef('document');
  const content = createContent();
  const controller = new AbortController();
  const document = createDocumentNote('document', { metadata, content: content.source, signal: controller.signal });
  const first = vi.fn();
  const second = vi.fn(() => {
    if (controller.signal.aborted) {
      expect(document.getText).toThrow(NoteUnavailableError);
      expect(document.getChildren).toThrow(NoteUnavailableError);
    }
  });
  const stopFirst = document.subscribe(first);
  const stopSecond = document.subscribe(second);

  for (const listener of metadataListeners) listener();
  for (const listener of content.listeners) listener();
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(2);

  stopFirst();
  stopFirst();
  expect(metadataListeners.size).toBe(1);
  expect(content.listeners.size).toBe(1);
  controller.abort();
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(3);
  expect(metadataListeners.size).toBe(0);
  expect(content.listeners.size).toBe(0);
  stopSecond();
  stopSecond();
  document.subscribe(vi.fn())();
  expect(metadataListeners.size).toBe(0);
  expect(content.listeners.size).toBe(0);
  expect(document.getId()).toBe('document');
  expect(document.as('document')).toBe(document);
});

it('keeps repeated subscriptions by the same listener independent', () => {
  const content = createContent();
  const document = createDocumentNote('document', { content: content.source });
  const listener = vi.fn();
  const stopFirst = document.subscribe(listener);
  const stopSecond = document.subscribe(listener);
  const queuedFirst = [...content.listeners][0]!;

  for (const notify of content.listeners) notify();
  expect(listener).toHaveBeenCalledTimes(2);
  stopFirst();
  queuedFirst();
  expect(listener).toHaveBeenCalledTimes(2);
  for (const notify of content.listeners) notify();
  expect(listener).toHaveBeenCalledTimes(3);
  stopSecond();
  expect(content.listeners.size).toBe(0);
});

it('observes Content and Access independently and expires both collections with their host', () => {
  const metadataListeners = new Set<() => void>();
  const documents: CollectionSource<UserDocument> = {
    getChildren: () => [{ id: 'document', title: 'Title' }],
    getById: () => ({ id: 'document', title: 'Title' }),
    subscribe: (listener) => { metadataListeners.add(listener); return () => { metadataListeners.delete(listener); }; },
  };
  const metadata = createUserDataRootNote(documents).documentRef('document');
  const content = createContent();
  const controller = new AbortController();
  const document = createDocumentNote('document', { metadata, content: content.source, signal: controller.signal });
  const documentChanged = vi.fn();
  const contentChanged = vi.fn();
  const accessChanged = vi.fn();
  document.subscribe(documentChanged);
  document.content.subscribe(contentChanged);
  document.access.subscribe(accessChanged);

  for (const listener of metadataListeners) listener();
  expect(documentChanged).toHaveBeenCalledTimes(1);
  expect(accessChanged).toHaveBeenCalledTimes(1);
  expect(contentChanged).not.toHaveBeenCalled();
  for (const listener of content.listeners) listener();
  expect(documentChanged).toHaveBeenCalledTimes(2);
  expect(accessChanged).toHaveBeenCalledTimes(1);
  expect(contentChanged).toHaveBeenCalledTimes(1);

  controller.abort();
  expect(documentChanged).toHaveBeenCalledTimes(3);
  expect(accessChanged).toHaveBeenCalledTimes(2);
  expect(contentChanged).toHaveBeenCalledTimes(2);
  expect(document.content.getParent).toThrow(NoteUnavailableError);
  expect(document.access.getChildren).toThrow(NoteUnavailableError);
  expect(document.content.getId()).toBe('document/content');
  expect(document.access.getId()).toBe('document/access');
  expect(metadataListeners.size).toBe(0);
  expect(content.listeners.size).toBe(0);
});

it('observes recovery when subscribed before the host starts or while it is stopped', () => {
  let active = false;
  const content = createContent();
  const document = createDocumentNote('document', { content: content.source, isActive: () => active });
  const listener = vi.fn();
  const unsubscribe = document.subscribe(listener);
  expect(document.content.getChildListType).toThrow(NoteUnavailableError);

  active = true;
  for (const notify of content.listeners) notify();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(document.content.getChildListType()).toBe('bullet');
  active = false;
  for (const notify of content.listeners) notify();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(document.content.getChildListType).toThrow(NoteUnavailableError);
  active = true;
  for (const notify of content.listeners) notify();
  expect(listener).toHaveBeenCalledTimes(3);
  expect(document.content.getChildListType()).toBe('bullet');
  unsubscribe();
  expect(content.listeners.size).toBe(0);
});

it('releases a source subscription when its first notification disposes the host', () => {
  const content = createContent();
  const controller = new AbortController();
  const document = createDocumentNote('document', {
    signal: controller.signal,
    content: {
      ...content.source,
      subscribe: (listener) => {
        content.listeners.add(listener);
        listener();
        return () => { content.listeners.delete(listener); };
      },
    },
  });
  const listener = vi.fn(() => {
    if (controller.signal.aborted) expect(document.getChildren).toThrow(NoteUnavailableError);
    else controller.abort();
  });

  const unsubscribe = document.subscribe(listener);

  expect(listener).toHaveBeenCalledTimes(2);
  expect(content.listeners.size).toBe(0);
  unsubscribe();
});

it('lets an acknowledged rename finish after closure but rejects new operations on that host', async () => {
  const documents: UserDocument[] = [{ id: 'document', title: 'Before' }];
  let acknowledge!: () => void;
  const acknowledgment = new Promise<void>((resolve) => { acknowledge = resolve; });
  const renameDocument = vi.fn(async (_id: string, title: string) => {
    await acknowledgment;
    documents[0]!.title = title;
  });
  const metadata = createUserDataRootNote(documents, { renameDocument }).documentRef('document');
  const content = createContent();
  const controller = new AbortController();
  const document = createDocumentNote('document', { metadata, content: content.source, signal: controller.signal });
  const rename = document.rename('Accepted');
  controller.abort();
  acknowledge();

  await expect(rename).resolves.toBe(document);
  expect(metadata.getText()).toBe('Accepted');
  expect(document.getText).toThrow(NoteUnavailableError);
  expect(document.getParent).toThrow(NoteUnavailableError);
  expect(document.canRename()).toBe(false);
  await expect(document.rename('Too late')).rejects.toBeInstanceOf(NoteUnavailableError);
  await expect(document.content.appendChildren([{ text: 'Too late' }])).rejects.toBeInstanceOf(NoteUnavailableError);
  expect(renameDocument).toHaveBeenCalledTimes(1);
  expect(content.source.appendChildren).not.toHaveBeenCalled();
});
