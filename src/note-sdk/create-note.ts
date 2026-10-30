import type { AddressableNote, CollectionNote, NoteId } from './notes';
import { createNoteAs } from './handle-utils';

/** The structure every kind supplies, typed by its public interface. */
interface NoteProvider<N extends AddressableNote, Data> {
  /** Resolves current data before each text and structure read; throws when unavailable. */
  read?: () => Data;
  getText: (data: Data) => string;
  getParent: (data: Data) => ReturnType<N['getParent']>;
  getChildren: (data: Data) => ReturnType<N['getChildren']>;
}

/** Each kind's own named members, beyond shared identity and structure. */
type NoteMembers<N extends AddressableNote> =
  Omit<N, 'getId' | 'getKind' | 'getText' | 'getParent' | 'getChildren' | 'as'>;

export function createNote<N extends AddressableNote, Data = undefined>(
  noteId: NoteId,
  kind: ReturnType<N['getKind']>,
  { read = () => undefined as Data, getText, getParent, getChildren }: NoteProvider<N, Data>,
  members: NoteMembers<N>,
): N {
  const getKind = () => kind;
  // TypeScript cannot prove that these members complete the generic N.
  const note = {
    ...members,
    getId: () => noteId,
    getKind,
    getText: () => getText(read()),
    getParent: () => getParent(read()),
    getChildren: () => getChildren(read()),
    as: createNoteAs(noteId, getKind, () => note),
  } as unknown as N;
  return note;
}

export function createCollectionNote<N extends CollectionNote<AddressableNote>, Data = undefined>(
  noteId: NoteId,
  { getById, subscribe, ...provider }: NoteProvider<N, Data> & {
    /** Resolves a listed note directly; defaults to searching the children. */
    getById?: N['getById'];
    subscribe: N['subscribe'];
  },
  members: Omit<NoteMembers<N>, 'getById' | 'subscribe'>,
): N {
  const collection: N = createNote<N, Data>(noteId, 'collection' as ReturnType<N['getKind']>, provider, {
    ...members,
    getById: getById ?? (id => collection.getChildren().find(note => note.getId() === id) ?? null),
    subscribe,
  } as unknown as NoteMembers<N>);
  return collection;
}
