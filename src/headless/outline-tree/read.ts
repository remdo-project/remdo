import { $isLinkNode } from '@lexical/link';
import type { ListItemNode, ListNode } from '@lexical/list';
import type { LexicalNode, TextFormatType } from 'lexical';
import { $getRoot, $getState, $isLineBreakNode, $isTextNode } from 'lexical';
import { $isDateNode } from '#client/editor/features/date/date-node';
import { $getNoteChecked } from '#client/editor/features/list-types/checked-state';
import { checkboxState, markerState, verbatimState } from '#client/editor/features/list-types/note-marker';
import { getContentSiblings } from '#client/editor/outline/list-structure';
import { $resolveRootContentList } from '#client/editor/outline/schema';
import { getNestedList } from '#client/editor/outline/selection/tree';
import { $getNoteId } from '#client/editor/runtime/note-ids/note-id-state';
import { $getDocumentTextId, $hasTextId } from '#client/editor/runtime/note-ids/text-id-state';
import { isPlainText, normalizeRuns, splitName, trimRuns, trimVerbatim } from './runs';
import type { Document, Mark, Marker, OutlineNote, Run, TreeNote } from './tree';

export const FORMAT_MARKS: ReadonlyArray<[TextFormatType, Mark]> = [
  ['bold', 'bold'], ['code', 'code'], ['italic', 'italic'], ['strikethrough', 'strike'], ['underline', 'underline'],
];

export const isNumbered = (note: TreeNote | undefined) => note?.kind === 'outline' && note.marker.kind === 'number';

/** A start of 1 counts only right after a numbered note, where it starts the numbering again. */
export function markerFromEditor(marker: string | undefined, listType: string, afterNumber: boolean): Marker {
  if (marker === undefined) return listType === 'number' ? { kind: 'number', start: null } : { kind: 'bullet' };
  const [kind, value] = marker.split(':');
  if (kind === 'heading') return { kind: 'heading', level: Number(value) };
  if (kind === 'number') {
    return { kind: 'number', start: value === undefined || (value === '1' && !afterNumber) ? null : Number(value) };
  }
  return { kind: 'bullet' };
}

/** The document the editor holds, as the outline tree. Call inside an editor read or update. */
export function $readTree(): Document {
  const list = $resolveRootContentList();
  return { id: $getDocumentTextId($getRoot()), children: list ? $readNotes(list) : [] };
}

function $readNotes(list: ListNode): TreeNote[] {
  const notes: TreeNote[] = [];
  for (const item of getContentSiblings(list)) {
    const note = $readNote(item, list.getListType(), { afterNumber: isNumbered(notes.at(-1)) });
    notes.push(note);
    // A body has no children, so notes nested under one read as the notes after it.
    const nested = note.kind === 'body' ? getNestedList(item) : null;
    if (nested) notes.push(...$readNotes(nested));
  }
  return notes;
}


export function $readNote(item: ListItemNode, listType: string, { children = true, afterNumber = false } = {}): TreeNote {
  const cacheId = $getNoteId(item);
  const marker = $getState(item, markerState);
  if (marker === 'block') return { kind: 'body', source: item.getTextContent().split('\n'), cacheId };
  const boxed = $getState(item, checkboxState) === true || (marker === undefined && listType === 'check');
  const note: OutlineNote = {
    kind: 'outline',
    marker: markerFromEditor(marker, listType, afterNumber),
    checkbox: boxed ? ($getNoteChecked(item) === true ? 'checked' : 'open') : null,
    name: null,
    runs: [],
    id: $hasTextId(item) ? cacheId : null,
    cacheId,
    children: [],
  };
  if ($getState(item, verbatimState) === true) {
    const { name, rest } = splitName(item.getTextContent());
    note.name = name;
    const source = trimVerbatim(rest);
    note.runs = source ? [{ kind: 'verbatim', text: source }] : [];
  } else {
    const { name, runs } = $nameAndRuns(item.getChildren());
    note.name = name;
    note.runs = trimRuns(normalizeRuns(runs));
  }
  const nested = children ? getNestedList(item) : null;
  if (nested) note.children = $readNotes(nested);
  return note;
}

/** Only plain text before any formatting or link can hold a name, as in the text format. */
function $nameAndRuns(nodes: readonly LexicalNode[]): { name: string | null; runs: Run[] } {
  const runs = $runsOf(nodes);
  let plain = 0;
  while (isPlainText(runs[plain])) plain += 1;
  const lead = runs.slice(0, plain).map((run) => (run as Extract<Run, { kind: 'text' }>).text).join('');
  const { name, rest } = splitName(lead);
  if (name === null && rest === lead) return { name: null, runs };
  const tail = runs.slice(plain);
  return { name, runs: rest ? [{ kind: 'text', text: rest, marks: [] }, ...tail] : tail };
}

function $runsOf(nodes: readonly LexicalNode[]): Run[] {
  const runs: Run[] = [];
  for (const node of nodes) {
    if ($isTextNode(node)) {
      const marks = FORMAT_MARKS.filter(([format]) => node.hasFormat(format)).map(([, mark]) => mark);
      runs.push({ kind: 'text', text: node.getTextContent(), marks });
    } else if ($isLineBreakNode(node)) {
      // A line break outside verbatim source reads as the space a joined continuation line becomes.
      runs.push({ kind: 'text', text: ' ', marks: [] });
    } else if ($isLinkNode(node)) {
      runs.push({ kind: 'link', href: node.getURL(), runs: $runsOf(node.getChildren()) });
    } else if ($isDateNode(node)) {
      runs.push({ kind: 'date', date: node.getIsoDate() });
    }
  }
  return runs;
}
