import { isDeepStrictEqual } from 'node:util';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import type { LinkNode } from '@lexical/link';
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode, NodeKey, TextNode } from 'lexical';
import { $createLineBreakNode, $createTextNode, $getRoot, $getState, $isLineBreakNode, $isTextNode, $setState, TEXT_TYPE_TO_FORMAT } from 'lexical';
import { $createDateNode, $isDateNode } from '#client/editor/features/date/date-node';
import { $getNoteChecked, $setNoteCheckedRaw } from '#client/editor/features/list-types/checked-state';
import { checkboxState, markerState, verbatimState } from '#client/editor/features/list-types/note-marker';
import {
  $getOrCreateChildList, getContentSiblings, getNodesForNote, insertAfter, insertBefore, maybeRemoveEmptyWrapper,
} from '#client/editor/outline/list-structure';
import { forEachContentItemInOutline } from '#client/editor/outline/list-traversal';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '#client/editor/outline/normalization';
import { $requireRootContentList } from '#client/editor/outline/schema';
import { removeNoteSubtree } from '#client/editor/outline/selection/tree';
import { $getNoteId, noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { $getDocumentTextId, $hasTextId, $setDocumentTextId, $setHasTextId } from '#client/editor/runtime/note-ids/text-id-state';
import { createUniqueNoteId } from '#domain/notes/ids';
import { $readNote, FORMAT_MARKS, isNumbered } from './read';
import { isPlainText, isSpace, joinName } from './runs';
import type { Document, OutlineNote, Run, TreeNote } from './tree';

/**
 * Change the editor to hold `document`, matching notes by cache ID, then notes without one by
 * identical content among siblings. Notes already as the tree says, and their unchanged text, are
 * left unwritten. Call inside an editor update.
 */
export function $applyTree(document: Document): void {
  const root = $getRoot();
  if ($getDocumentTextId(root) !== document.id) $setDocumentTextId(root, document.id);
  if ($shouldNormalizeOutlineRoot(root)) $normalizeOutlineRoot(root);
  const list = $requireRootContentList();
  const live = new Map<string, ListItemNode>();
  const items: ListItemNode[] = [];
  forEachContentItemInOutline(list, (item) => {
    items.push(item);
    const cacheId = $getNoteId(item);
    if (cacheId === null) return;
    if (live.has(cacheId)) $setCacheId(item, createUniqueNoteId(), live);
    else live.set(cacheId, item);
  });
  const matching = $matchByIds(document.children, live);
  $applyChildren(list, document.children, matching);
  for (const item of items) {
    if (!matching.kept.has(item.getKey()) && item.isAttached()) removeNoteSubtree(item);
  }
}

interface Matching {
  live: Map<string, ListItemNode>;
  // Node keys, since a node written during the update is a different object afterwards.
  kept: Set<NodeKey>;
  /** The live note each tree note updates, found by its cache ID or written ID. */
  targets: Map<TreeNote, ListItemNode>;
  /** The tree note each written ID belongs to: the first, in document order, to give it. */
  owners: Map<string, TreeNote>;
}

/** Match tree notes by cache ID, then by a live note's written ID, all in document order. */
function $matchByIds(notes: readonly TreeNote[], live: Map<string, ListItemNode>): Matching {
  const matching: Matching = { live, kept: new Set(), targets: new Map(), owners: new Map() };
  const visit = (siblings: readonly TreeNote[]) => siblings.forEach((note) => {
    const id = note.kind === 'outline' ? note.id : null;
    if (id !== null && !matching.owners.has(id)) matching.owners.set(id, note);
    const holder = id === null ? undefined : live.get(id);
    const candidates = [
      note.cacheId === null ? undefined : live.get(note.cacheId),
      holder && $hasTextId(holder) && matching.owners.get(id!) === note ? holder : undefined,
    ];
    const item = candidates.find((candidate) => candidate && !matching.kept.has(candidate.getKey()));
    if (item) {
      matching.kept.add(item.getKey());
      matching.targets.set(note, item);
    }
    if (note.kind === 'outline') visit(note.children);
  });
  visit(notes);
  return matching;
}

function $setCacheId(item: ListItemNode, cacheId: string, live: Map<string, ListItemNode>) {
  const previous = $getNoteId(item);
  if (previous !== null && live.get(previous)?.is(item)) live.delete(previous);
  $setState(item, noteIdState, cacheId);
  live.set(cacheId, item);
}

/** A written ID claims its value, even from a note holding it only as its cache ID. */
function $claimWrittenId(item: ListItemNode, note: OutlineNote, { live, owners }: Matching) {
  const claims = note.id !== null && owners.get(note.id) === note;
  if (claims && $getNoteId(item) !== note.id) {
    const holder = live.get(note.id!);
    if (holder && !holder.is(item)) $setCacheId(holder, createUniqueNoteId(), live);
    $setCacheId(item, note.id!, live);
  }
  if ($hasTextId(item) !== claims) $setHasTextId(item, claims);
}

function $applyChildren(list: ListNode, notes: readonly TreeNote[], matching: Matching) {
  const { live, kept, targets } = matching;
  const current = getContentSiblings(list);
  const position = new Map(current.map((item, index) => [item.getKey(), index]));
  const matched = notes.map((note) => targets.get(note) ?? null);
  $matchByContent(current, position, list.getListType(), notes, matched, kept);
  const stay = inPlace(position, matched);
  let previous: ListItemNode | null = null;
  notes.forEach((note, index) => {
    let item = matched[index];
    if (!item) {
      item = $createListItemNode();
      // A cache ID another note holds would duplicate it, so the created note gets a fresh one.
      $setCacheId(item, note.cacheId !== null && !live.has(note.cacheId) ? note.cacheId : createUniqueNoteId(), live);
      $setState(item, markerState, markerOf(note));
      kept.add(item.getKey());
      $place(list, previous, [item]);
    } else if (!stay.has(item.getKey())) {
      const from = item.getParent();
      $place(list, previous, getNodesForNote(item));
      if ($isListNode(from)) maybeRemoveEmptyWrapper(from);
    }
    $updateNote(item, note, list.getListType(), isNumbered(notes[index - 1]));
    if (note.kind === 'outline') {
      $claimWrittenId(item, note, matching);
      if (note.children.length > 0) $applyChildren($getOrCreateChildList(item), note.children, matching);
    }
    previous = item;
  });
}

/** What a note says: its kind, name and text, not its marker, checkbox or ID. */
const contentKey = (note: TreeNote) =>
  JSON.stringify(note.kind === 'body' ? ['body', note.source] : ['outline', note.name, note.runs]);

/**
 * Give notes without a cache ID, as a tree read from a file has, an unclaimed sibling with the same
 * content, in order. Never by position alone: a note replaced in place must not inherit an ID.
 */
function $matchByContent(
  current: readonly ListItemNode[],
  position: ReadonlyMap<NodeKey, number>,
  listType: string,
  notes: readonly TreeNote[],
  matched: (ListItemNode | null)[],
  kept: Set<NodeKey>,
) {
  if (!notes.some((note, index) => note.cacheId === null && !matched[index])) return;
  const unclaimed = new Map<string, ListItemNode[]>();
  for (const item of current) {
    if (kept.has(item.getKey())) continue;
    const key = contentKey($readNote(item, listType, { children: false }));
    const same = unclaimed.get(key);
    if (same) same.push(item);
    else unclaimed.set(key, [item]);
  }
  let after = -1;
  notes.forEach((note, index) => {
    const target = matched[index];
    if (target) {
      after = Math.max(after, position.get(target.getKey()) ?? after);
      return;
    }
    if (note.cacheId !== null) return;
    const candidates = unclaimed.get(contentKey(note));
    if (!candidates?.length) return;
    const next = candidates.findIndex((item) => position.get(item.getKey())! > after);
    const [match] = candidates.splice(next === -1 ? 0 : next, 1);
    matched[index] = match!;
    kept.add(match!.getKey());
    after = position.get(match!.getKey())!;
  });
}

/**
 * The targets already in order among a list's items, which needn't move: the longest increasing run
 * of their current positions, since each item is targeted at most once.
 */
function inPlace(position: ReadonlyMap<NodeKey, number>, targets: readonly (ListItemNode | null)[]): Set<NodeKey> {
  const present = targets.filter((item): item is ListItemNode => item !== null && position.has(item.getKey()));
  const tails: number[] = [];
  const previous: number[] = [];
  present.forEach((item, index) => {
    const at = position.get(item.getKey())!;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (position.get(present[tails[middle]!]!.getKey())! < at) low = middle + 1;
      else high = middle;
    }
    previous[index] = low > 0 ? tails[low - 1]! : -1;
    tails[low] = index;
  });
  const stay = new Set<NodeKey>();
  for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index]!) stay.add(present[index]!.getKey());
  return stay;
}

function $place(list: ListNode, previous: ListItemNode | null, nodes: LexicalNode[]) {
  const first = list.getFirstChild();
  if (previous) insertAfter(getNodesForNote(previous).at(-1)!, nodes);
  else if (first) insertBefore(first, nodes);
  else list.append(...nodes);
}

// A note's IDs are claimed apart from its content.
const own = (note: TreeNote) => (note.kind === 'outline' ? { ...note, cacheId: null, id: null, children: [] } : { ...note, cacheId: null });

function $updateNote(item: ListItemNode, note: TreeNote, listType: string, afterNumber: boolean) {
  const current = $readNote(item, listType, { children: false, afterNumber });
  if (isDeepStrictEqual(own(current), own(note))) return;
  const marker = markerOf(note);
  if ($getState(item, markerState) !== marker) $setState(item, markerState, marker);
  const checkbox = note.kind === 'outline' && note.checkbox !== null;
  if (($getState(item, checkboxState) === true) !== checkbox) $setState(item, checkboxState, checkbox ? true : undefined);
  const checked = note.kind === 'outline' && note.checkbox === 'checked';
  if (($getNoteChecked(item) === true) !== checked) $setNoteCheckedRaw(item, checked);
  const verbatim = note.kind === 'outline' && note.runs[0]?.kind === 'verbatim';
  if (($getState(item, verbatimState) === true) !== verbatim) $setState(item, verbatimState, verbatim ? true : undefined);
  $spliceContent(item, atomsOf(note), note.kind === 'outline');
}

function markerOf(note: TreeNote): string {
  if (note.kind === 'body') return 'block';
  const { marker } = note;
  if (marker.kind === 'heading') return `heading:${marker.level}`;
  if (marker.kind === 'number') return marker.start === null ? 'number' : `number:${marker.start}`;
  return 'bullet';
}

interface Char { kind: 'char'; char: string; format: number; link: string | null }
/** A character of live content, with where it sits. */
interface LiveChar extends Char { node: TextNode; offset: number }
type Atom = Char | LiveChar | { kind: 'break' } | { kind: 'date'; date: string } | { kind: 'other' };

const isLive = (atom: Atom | undefined): atom is LiveChar => atom?.kind === 'char' && 'node' in atom;

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
  const lead = isPlainText(first) ? first.text : null;
  if (note.name !== null) {
    if (lead !== null) runs[0] = { kind: 'text', text: `${note.name}:: ${lead}`, marks: [] };
    else runs.unshift({ kind: 'text', text: runs.length > 0 ? `${note.name}:: ` : `${note.name}::`, marks: [] });
  } else if (lead !== null) {
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

// A link's own spaces are its text, as reading keeps them.
const isEdgeSpace = (atom: Atom | undefined) =>
  atom?.kind === 'char' && atom.link === null && isSpace(atom.char) && (atom.format & FORMAT_BITS.get('code')!) === 0;

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

  // Children holding no atoms, such as an empty link, own no range to replace.
  if (atoms.length === 0) {
    item.clear().append(...$nodesOf(target));
    return;
  }
  const children = item.getChildren();
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
  const before = atoms[start - 1];
  const host = removed[0] ?? (before?.kind === 'char' ? before : atoms[start]);
  if (!isLive(host)) return false;
  const fits = (atom: Atom): atom is Char => atom.kind === 'char' && atom.format === host.format && atom.link === host.link;
  if (!removed.every((atom) => isLive(atom) && fits(atom) && atom.node === host.node)) return false;
  if (!inserted.every(fits)) return false;
  const offset = removed.length === 0 && host === before ? host.offset + host.char.length : host.offset;
  const length = (removed as Char[]).reduce((sum, atom) => sum + atom.char.length, 0);
  host.node.spliceText(offset, length, inserted.map((atom) => atom.char).join(''), false);
  return true;
}

function $nodesOf(atoms: readonly Atom[]): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  let link: LinkNode | null = null;
  for (let index = 0; index < atoms.length;) {
    const atom = atoms[index]!;
    index += 1;
    if (atom.kind !== 'char') {
      link = null;
      if (atom.kind === 'break') nodes.push($createLineBreakNode());
      else if (atom.kind === 'date') nodes.push($createDateNode(atom.date));
      continue;
    }
    let text = atom.char;
    while (index < atoms.length) {
      const next = atoms[index]!;
      if (next.kind !== 'char' || next.format !== atom.format || next.link !== atom.link) break;
      text += next.char;
      index += 1;
    }
    if (atom.link !== (link?.getURL() ?? null)) link = null;
    if (atom.link !== null && link === null) {
      link = $createLinkNode(atom.link);
      nodes.push(link);
    }
    const node = $createTextNode(text).setFormat(atom.format);
    if (link) link.append(node);
    else nodes.push(node);
  }
  return nodes;
}
