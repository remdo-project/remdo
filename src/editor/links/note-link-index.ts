import { $getNoteId } from '#lib/editor/note-id-state';
import { forEachContentItemWithAncestorsInOutline } from '@/editor/outline/list-traversal';
import { $requireRootContentList } from '@/editor/outline/schema';

interface LinkableNote {
  noteId: string;
  title: string;
  ancestors: string[];
}

export interface LinkPickerOption {
  noteId: string;
  title: string;
  context: string | null;
}

export function $collectLinkableNotesInDocumentOrder(): LinkableNote[] {
  const notes: LinkableNote[] = [];
  const rootList = $requireRootContentList();
  forEachContentItemWithAncestorsInOutline(rootList, (item, ancestors) => {
    const noteId = $getNoteId(item);
    if (!noteId) {
      return;
    }

    const title = item.getTextContent();
    notes.push({
      noteId,
      title,
      ancestors: ancestors.map((ancestor) => ancestor.getTextContent()),
    });
  });
  return notes;
}

export function filterLinkableNotes(notes: LinkableNote[], query: string): LinkableNote[] {
  if (query.length === 0) {
    return notes;
  }

  const needle = query.toLocaleLowerCase();
  return notes.filter((note) => note.title.toLocaleLowerCase().includes(needle));
}

function computeDisplayContexts(notes: LinkableNote[]): Map<number, string | null> {
  const contexts = new Map<number, string | null>();
  const groups = new Map<string, number[]>();

  for (const [index, note] of notes.entries()) {
    const key = note.title;
    const existing = groups.get(key);
    if (existing) {
      existing.push(index);
    } else {
      groups.set(key, [index]);
    }
  }

  for (const indexes of groups.values()) {
    if (indexes.length <= 1) {
      continue;
    }

    const unresolved = new Set(indexes);
    const maxDepth = Math.max(...indexes.map((index) => notes[index]!.ancestors.length));
    let depth = 1;

    while (unresolved.size > 0 && depth <= maxDepth) {
      const buckets = new Map<string, number[]>();
      for (const index of unresolved) {
        const note = notes[index]!;
        const suffix = note.ancestors.slice(-depth);
        const key = suffix.join('\u0000');
        const existing = buckets.get(key);
        if (existing) {
          existing.push(index);
        } else {
          buckets.set(key, [index]);
        }
      }

      const nextUnresolved = new Set<number>();
      for (const index of unresolved) {
        const note = notes[index]!;
        const suffix = note.ancestors.slice(-depth);
        const key = suffix.join('\u0000');
        const bucket = buckets.get(key)!;
        if (bucket.length === 1) {
          contexts.set(index, suffix.length > 0 ? suffix.join(' > ') : null);
        } else {
          nextUnresolved.add(index);
        }
      }

      unresolved.clear();
      for (const index of nextUnresolved) {
        unresolved.add(index);
      }
      depth += 1;
    }

    for (const index of unresolved) {
      const ancestors = notes[index]!.ancestors;
      contexts.set(index, ancestors.length > 0 ? ancestors.join(' > ') : null);
    }
  }

  return contexts;
}

export function toLinkPickerOptions(notes: LinkableNote[], limit: number): LinkPickerOption[] {
  const visible = notes.slice(0, Math.max(0, limit));
  const contexts = computeDisplayContexts(visible);
  return visible.map((note, index) => ({
    noteId: note.noteId,
    title: note.title,
    context: contexts.get(index) ?? null,
  }));
}
