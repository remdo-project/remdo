import { $createLinkNode, $isLinkNode } from '@lexical/link';
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $isListNode } from '@lexical/list';
import type { ElementNode, LexicalNode, TextNode } from 'lexical';
import { $createLineBreakNode, $createTextNode, $getRoot, $getState, $isLineBreakNode, $isTextNode, $setState, TEXT_TYPE_TO_FORMAT } from 'lexical';
import { $createDateNode, $isDateNode } from '#client/editor/features/date/date-node';
import { $getNoteChecked, $setNoteCheckedRaw } from '#client/editor/features/list-types/checked-state';
import { checkboxState, markerState, verbatimState } from '#client/editor/features/list-types/note-marker';
import {
  $getOrCreateChildList, getContentSiblings, getNodesForNote, maybeRemoveEmptyWrapper,
} from '#client/editor/outline/list-structure';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '#client/editor/outline/normalization';
import { getNestedList, removeNoteSubtree } from '#client/editor/outline/selection/tree';
import { $getNoteId, noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { $getDocumentTextId, $setDocumentTextId, $setHasTextId } from '#client/editor/runtime/note-ids/text-id-state';
import { createUniqueNoteId } from '#domain/notes/ids';
import { $readNote, FORMAT_MARKS, isNumbered } from './read';
import { joinName, nameOf } from './runs';
import type { Document, Marker, Run, TreeNote } from './tree';

/**
 * Change the editor to hold `document`, matching notes by cache ID. Notes already as the tree
 * says, and their unchanged text, are left unwritten. Call inside an editor update.
 */
export function $applyTree(document: Document): void {
  const root = $getRoot();
  if ($getDocumentTextId(root) !== document.id) $setDocumentTextId(root, document.id);
  if ($shouldNormalizeOutlineRoot(root)) $normalizeOutlineRoot(root);
  const list = root.getFirstChild();
  if (!$isListNode(list)) throw new Error('A normalized outline root holds one list.');
  const live = new Map<string, ListItemNode>();
  const collect = (from: ListNode) => {
    for (const item of getContentSiblings(from)) {
      const cacheId = $getNoteId(item);
      if (cacheId !== null && !live.has(cacheId)) live.set(cacheId, item);
      const nested = getNestedList(item);
      if (nested) collect(nested);
    }
  };
  collect(list);
  const kept = new Set<ListItemNode>();
  $applyChildren(list, document.children, live, kept);
  for (const item of [...live.values()]) {
    if (!kept.has(item) && item.isAttached()) removeNoteSubtree(item);
  }
}

function $applyChildren(list: ListNode, notes: readonly TreeNote[], live: Map<string, ListItemNode>, kept: Set<ListItemNode>) {
  const targets = notes.map((note) => {
    const item = note.cacheId === null ? undefined : live.get(note.cacheId);
    if (!item || kept.has(item)) return null;
    kept.add(item);
    return item;
  });
  const stay = inPlace(getContentSiblings(list), targets);
  let previous: ListItemNode | null = null;
  notes.forEach((note, index) => {
    let item = targets[index];
    if (!item) {
      item = $createListItemNode();
      $setState(item, noteIdState, (note.kind === 'outline' ? note.id : null) ?? note.cacheId ?? createUniqueNoteId());
      $setState(item, markerState, note.kind === 'body' ? 'block' : markerToEditor(note.marker));
      kept.add(item);
      $place(list, previous, [item]);
    } else if (!stay.has(item)) {
      const from = item.getParent();
      $place(list, previous, getNodesForNote(item));
      if ($isListNode(from)) maybeRemoveEmptyWrapper(from);
    }
    $updateNote(item, note, list.getListType(), isNumbered(notes[index - 1]));
    if (note.kind === 'outline' && note.children.length > 0) {
      $applyChildren($getOrCreateChildList(item), note.children, live, kept);
    }
    previous = item;
  });
}

/** The targets already in order among a list's items, the longest such run, which needn't move. */
function inPlace(current: readonly ListItemNode[], targets: readonly (ListItemNode | null)[]): Set<ListItemNode> {
  const wanted = targets.filter((item): item is ListItemNode => item !== null);
  const lengths = Array.from({ length: current.length + 1 }, () => Array.from<number>({ length: wanted.length + 1 }).fill(0));
  for (let i = current.length - 1; i >= 0; i -= 1) {
    for (let j = wanted.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] = current[i] === wanted[j]
        ? lengths[i + 1]![j + 1]! + 1
        : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const stay = new Set<ListItemNode>();
  for (let i = 0, j = 0; i < current.length && j < wanted.length;) {
    if (current[i] === wanted[j]) {
      stay.add(current[i]!);
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i += 1;
    else j += 1;
  }
  return stay;
}

function $place(list: ListNode, previous: ListItemNode | null, nodes: LexicalNode[]) {
  let reference: LexicalNode | null = previous ? getNodesForNote(previous).at(-1)! : null;
  for (const node of nodes) {
    if (reference) reference.insertAfter(node);
    else if (list.getFirstChild()) list.getFirstChild()!.insertBefore(node);
    else list.append(node);
    reference = node;
  }
}

const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => (
  entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
    : entry
));

const own = (note: TreeNote) => (note.kind === 'outline' ? { ...note, cacheId: null, children: [] } : { ...note, cacheId: null });

function $updateNote(item: ListItemNode, note: TreeNote, listType: string, afterNumber: boolean) {
  const current = $readNote(item, listType, { children: false, afterNumber });
  if (current.kind === note.kind && canonical(own(current)) === canonical(own(note))) return;
  const marker: string = note.kind === 'body' ? 'block' : markerToEditor(note.marker);
  if ($getState(item, markerState) !== marker) $setState(item, markerState, marker);
  const checkbox = note.kind === 'outline' && note.checkbox !== null;
  if (($getState(item, checkboxState) === true) !== checkbox) $setState(item, checkboxState, checkbox ? true : undefined);
  const checked = note.kind === 'outline' && note.checkbox === 'checked';
  if (($getNoteChecked(item) === true) !== checked) $setNoteCheckedRaw(item, checked);
  const verbatim = note.kind === 'outline' && note.runs[0]?.kind === 'verbatim';
  if (($getState(item, verbatimState) === true) !== verbatim) $setState(item, verbatimState, verbatim ? true : undefined);
  if (note.kind === 'outline') {
    if (note.id !== null && $getNoteId(item) !== note.id) $setState(item, noteIdState, note.id);
    if ((current.kind === 'outline' && current.id !== null) !== (note.id !== null)) $setHasTextId(item, note.id !== null);
  }
  $spliceContent(item, atomsOf(note), note.kind === 'outline');
}

function markerToEditor(marker: Marker): string {
  if (marker.kind === 'heading') return `heading:${marker.level}`;
  if (marker.kind === 'number') return marker.start === null ? 'number' : `number:${marker.start}`;
  return 'bullet';
}

type Atom =
  | { kind: 'char'; char: string; format: number; link: string | null; node?: TextNode; offset?: number }
  | { kind: 'break' }
  | { kind: 'date'; date: string }
  | { kind: 'other' };

const FORMAT_BITS = new Map(FORMAT_MARKS.map(([format, mark]) => [mark, TEXT_TYPE_TO_FORMAT[format]]));

function textAtoms(text: string, format = 0, link: string | null = null): Atom[] {
  return [...text].map((char) => (char === '\n' ? { kind: 'break' } : { kind: 'char', char, format, link }));
}

/** The editor content a tree note holds, one atom per character, break or date. */
function atomsOf(note: TreeNote): Atom[] {
  if (note.kind === 'body') return textAtoms(note.source.join('\n'));
  const [first] = note.runs;
  if (first?.kind === 'verbatim') return textAtoms(joinName(note.name, first.text));
  const runs = [...note.runs];
  const lead = first?.kind === 'text' && first.marks.length === 0 ? first.text : null;
  if (note.name !== null) {
    if (lead !== null) runs[0] = { kind: 'text', text: `${note.name}:: ${lead}`, marks: [] };
    else runs.unshift({ kind: 'text', text: runs.length > 0 ? `${note.name}:: ` : `${note.name}::`, marks: [] });
  } else if (lead !== null && nameOf(lead) !== null) {
    runs[0] = { kind: 'text', text: joinName(null, lead), marks: [] };
  }
  return runAtoms(runs, null);
}

function runAtoms(runs: readonly Run[], link: string | null): Atom[] {
  return runs.flatMap((run): Atom[] => {
    switch (run.kind) {
      case 'text': return textAtoms(run.text, run.marks.reduce((bits, mark) => bits | FORMAT_BITS.get(mark)!, 0), link);
      case 'link': return runAtoms(run.runs, run.href);
      case 'date': return [{ kind: 'date', date: run.date }];
      case 'verbatim': return textAtoms(run.text, 0, link);
      default: return [];
    }
  });
}

/** The atoms of an item's content, each top-level child spanning a contiguous range of them. */
function $liveAtoms(item: ListItemNode): { atoms: Atom[]; owners: number[] } {
  const atoms: Atom[] = [];
  const owners: number[] = [];
  const add = (atom: Atom, owner: number) => {
    atoms.push(atom);
    owners.push(owner);
  };
  const addText = (node: TextNode, owner: number, link: string | null) => {
    let offset = 0;
    for (const char of node.getTextContent()) {
      add({ kind: 'char', char, format: node.getFormat(), link, node, offset }, owner);
      offset += char.length;
    }
  };
  item.getChildren().forEach((child, owner) => {
    if ($isTextNode(child)) addText(child, owner, null);
    else if ($isLineBreakNode(child)) add({ kind: 'break' }, owner);
    else if ($isDateNode(child)) add({ kind: 'date', date: child.getIsoDate() }, owner);
    else if ($isLinkNode(child)) {
      for (const inner of child.getChildren()) {
        if ($isTextNode(inner)) addText(inner, owner, child.getURL());
        else add({ kind: 'other' }, owner);
      }
    } else add({ kind: 'other' }, owner);
  });
  return { atoms, owners };
}

function sameAtom(a: Atom, b: Atom): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'char' && b.kind === 'char') return a.char === b.char && a.format === b.format && a.link === b.link;
  if (a.kind === 'date' && b.kind === 'date') return a.date === b.date;
  return a.kind === 'break';
}

const isEdgeSpace = (atom: Atom | undefined) =>
  atom?.kind === 'char' && /^\s$/u.test(atom.char) && (atom.format & FORMAT_BITS.get('code')!) === 0;

/**
 * Replace only the atoms that differ. Whitespace at an outline note's edges isn't its text, so the
 * live edges stay as they are around the new text.
 */
function $spliceContent(item: ListItemNode, wanted: Atom[], keepEdges: boolean) {
  const { atoms, owners } = $liveAtoms(item);
  let target = wanted;
  if (keepEdges) {
    let lead = 0;
    while (isEdgeSpace(atoms[lead])) lead += 1;
    let tail = 0;
    while (tail < atoms.length - lead && isEdgeSpace(atoms[atoms.length - 1 - tail])) tail += 1;
    target = [...atoms.slice(0, lead), ...wanted, ...atoms.slice(atoms.length - tail)];
  }
  let start = 0;
  while (start < atoms.length && start < target.length && sameAtom(atoms[start]!, target[start]!)) start += 1;
  let end = 0;
  while (end < atoms.length - start && end < target.length - start
    && sameAtom(atoms[atoms.length - 1 - end]!, target[target.length - 1 - end]!)) end += 1;
  const removed = atoms.slice(start, atoms.length - end);
  const inserted = target.slice(start, target.length - end);
  if (removed.length === 0 && inserted.length === 0) return;
  if ($spliceOneText(atoms, start, removed, inserted)) return;

  const children = item.getChildren();
  if (children.length === 0) {
    item.append(...$nodesOf(target));
    return;
  }
  let low = start;
  let high = atoms.length - end;
  if (low === high) {
    if (low > 0) low -= 1;
    else high += 1;
  }
  const first = owners[low]!;
  const last = owners[high - 1]!;
  const firstAtom = owners.indexOf(first);
  const afterLast = owners.lastIndexOf(last) + 1;
  const replacement = $nodesOf(target.slice(firstAtom, target.length - (atoms.length - afterLast)));
  const anchor = children[first]!;
  for (const node of replacement) anchor.insertBefore(node);
  for (const child of children.slice(first, last + 1)) child.remove();
}

/** Edit one text node in place when the change sits inside it and keeps its format and link. */
function $spliceOneText(atoms: Atom[], start: number, removed: Atom[], inserted: Atom[]): boolean {
  const host = removed[0] ?? (atoms[start - 1]?.kind === 'char' ? atoms[start - 1] : atoms[start]);
  if (host?.kind !== 'char') return false;
  const fits = (atom: Atom) => atom.kind === 'char' && atom.format === host.format && atom.link === host.link;
  if (!removed.every((atom) => fits(atom) && atom.kind === 'char' && atom.node === host.node)) return false;
  if (!inserted.every(fits)) return false;
  const text = inserted.map((atom) => (atom as { char: string }).char).join('');
  const offset = removed[0] === undefined && host === atoms[start - 1]
    ? host.offset! + host.char.length
    : host.offset!;
  const length = removed.reduce((sum, atom) => sum + (atom as { char: string }).char.length, 0);
  host.node!.spliceText(offset, length, text, false);
  return true;
}

function $nodesOf(atoms: readonly Atom[]): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  let link: ElementNode | null = null;
  let linkHref: string | null = null;
  for (const atom of atoms) {
    if (atom.kind !== 'char' || atom.link !== linkHref) {
      link = null;
      linkHref = null;
    }
    if (atom.kind === 'break') nodes.push($createLineBreakNode());
    else if (atom.kind === 'date') nodes.push($createDateNode(atom.date));
    else if (atom.kind === 'char') {
      if (atom.link !== null && link === null) {
        link = $createLinkNode(atom.link);
        linkHref = atom.link;
        nodes.push(link);
      }
      const into: LexicalNode[] = link ? link.getChildren() : nodes;
      const previous = into.at(-1);
      if ($isTextNode(previous) && previous.getFormat() === atom.format) previous.setTextContent(previous.getTextContent() + atom.char);
      else {
        const text = $createTextNode(atom.char).setFormat(atom.format);
        if (link) link.append(text);
        else nodes.push(text);
      }
    }
  }
  return nodes;
}
