import type { DocumentAccessNote, DocumentNote } from './documents';
import { createNoteAs } from './handle-utils';
import { NoteUnavailableError } from './note-unavailable-error';

type GrantSource = Pick<DocumentAccessNote, 'getId' | 'getText' | 'getEmail' | 'getName' | 'getGranteeUserId'>;
type DocumentMetadata = Pick<DocumentNote,
  'getText' | 'getSharingSuggestions' | 'canShareWith'
  | 'canRename' | 'canDelete' | 'delete' | 'subscribe'
> & {
  access: {
    getChildren: () => readonly GrantSource[];
    getById: (id: string) => GrantSource | null;
  };
  shareWith: (email: string) => Promise<Pick<GrantSource, 'getId'>>;
  rename: (title: string) => Promise<unknown>;
};
type DocumentContent = Pick<DocumentNote['content'],
  'getChildren' | 'getChildListType' | 'appendChildren' | 'subscribe'>;

interface DocumentSources {
  metadata?: DocumentMetadata;
  content?: DocumentContent;
  isActive?: () => boolean;
  signal?: AbortSignal;
}

/** Compose one document and its independently available child collections. */
export function createDocumentNote(
  documentId: string,
  { metadata, content: sourceContent, isActive = () => true, signal }: DocumentSources = {},
): DocumentNote {
  const kind = () => 'document' as const;
  const collectionKind = () => 'collection' as const;
  const active = () => !signal?.aborted && isActive();
  const requireActive = () => {
    if (!active()) throw new NoteUnavailableError(documentId);
  };
  const requireSource = <Source>(source: Source | undefined): Source => {
    requireActive();
    if (!source) throw new NoteUnavailableError(documentId);
    return source;
  };
  function observe(sources: readonly (Pick<DocumentNote, 'subscribe'> | undefined)[]) {
    return (listener: () => void) => {
      if (signal?.aborted) return () => {};
      const subscriptions: Array<() => void> = [];
      const state = { released: false };
      const notify = () => { if (!state.released) listener(); };
      function unsubscribe() {
        if (state.released) return;
        state.released = true;
        signal?.removeEventListener('abort', onAbort);
        for (const stop of subscriptions) stop();
      }
      function onAbort() {
        try { notify(); } finally { unsubscribe(); }
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        for (const source of sources) {
          if (!source || state.released) continue;
          const stop = source.subscribe(notify);
          if (signal?.aborted) stop();
          else subscriptions.push(stop);
        }
      } catch (error) {
        unsubscribe();
        throw error;
      }
      return unsubscribe;
    };
  }

  const contentId = `${documentId}/content`;
  const content: DocumentNote['content'] = {
    getId: () => contentId,
    getKind: collectionKind,
    getText: () => { requireActive(); return 'Content'; },
    getParent: documentParent,
    getChildren: () => requireSource(sourceContent).getChildren(),
    getById: (noteId) => content.getChildren().find(note => note.getId() === noteId) ?? null,
    getChildListType: () => requireSource(sourceContent).getChildListType(),
    appendChildren: async (notes) => requireSource(sourceContent).appendChildren(notes),
    subscribe: observe([sourceContent]),
    as: createNoteAs(contentId, collectionKind, () => content),
  };
  const accessId = `${documentId}/access`;
  // The content adapter also signals host start/stop. Access observes those
  // transitions without publishing unrelated editor-content changes.
  const hostActivity = sourceContent && {
    subscribe: (listener: () => void) => {
      let previous = active();
      return sourceContent.subscribe(() => {
        const current = active();
        if (current === previous) return;
        previous = current;
        listener();
      });
    },
  };
  const grantRef = (id: string): DocumentAccessNote => {
    const read = () => {
      const grant = requireSource(metadata).access.getById(id);
      if (!grant) throw new NoteUnavailableError(id);
      return grant;
    };
    const grantKind = () => 'document-access' as const;
    const grant: DocumentAccessNote = {
      getId: () => id,
      getKind: grantKind,
      getParent: () => { read(); return accessCollection(); },
      getText: () => read().getText(),
      getChildren: () => { read(); return []; },
      getEmail: () => read().getEmail(),
      getName: () => read().getName(),
      getGranteeUserId: () => read().getGranteeUserId(),
      as: createNoteAs(id, grantKind, () => grant),
    };
    return grant;
  };
  const access: DocumentNote['access'] = {
    getId: () => accessId,
    getKind: collectionKind,
    getText: () => { requireActive(); return 'Access'; },
    getParent: documentParent,
    getChildren: () => requireSource(metadata).access.getChildren().map(grant => grantRef(grant.getId())),
    getById: (id) => requireSource(metadata).access.getById(id) ? grantRef(id) : null,
    subscribe: observe([metadata, hostActivity]),
    as: createNoteAs(accessId, collectionKind, () => access),
  };
  const handle: DocumentNote = {
    getId: () => documentId,
    getKind: kind,
    getParent: () => { requireActive(); return null; },
    getText: () => requireSource(metadata).getText(),
    getChildren: () => { requireActive(); return [content, access]; },
    content,
    access,
    getSharingSuggestions: () => requireSource(metadata).getSharingSuggestions(),
    canShareWith: () => active() && (metadata?.canShareWith() ?? false),
    shareWith: async (email) => grantRef((await requireSource(metadata).shareWith(email)).getId()),
    canRename: () => active() && (metadata?.canRename() ?? false),
    rename: async (title) => {
      await requireSource(metadata).rename(title);
      return handle;
    },
    canDelete: () => active() && (metadata?.canDelete() ?? false),
    delete: async () => requireSource(metadata).delete(),
    subscribe: observe([metadata, sourceContent]),
    as: createNoteAs(documentId, kind, () => handle),
  };
  function documentParent() { requireActive(); return handle; }
  function accessCollection() { return access; }
  return handle;
}
