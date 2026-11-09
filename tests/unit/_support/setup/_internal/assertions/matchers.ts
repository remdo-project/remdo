import type { TestContext } from 'vitest';
import type { Outline, SelectionSnapshot } from '#tests';
import { expect } from 'vitest';
import { extractOutlineFromEditorState, mutateOutlineNoteIdWildcards } from '#tests-common/outline';
import type { OutlineNode } from '#tests-common/outline';
import { readMarkdownOutline } from '#tests-common/markdown-outline';
import type { MarkdownNote, MarkdownPoint, MarkdownSelection, NotePath } from '#tests-common/markdown-outline';
import {
  collectSelectedListItems,
  findNearestListItem,
  isChildrenWrapper,
  resolveContentListItem,
} from '#tests';
import { $getSelection, $isRangeSelection, $getRoot } from 'lexical';
import type { PointType, RangeSelection, LexicalNode } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';
import { $getNoteId } from '#client/editor/runtime/note-ids/note-id-state';
import { $resolveStructuralItemsFromRange } from '#client/editor/outline/selection/range';

type RemdoTestHelpers = TestContext['remdo'];

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

function attemptRead<T>(
  ctx: any,
  matcherName: string,
  reader: () => T
): { ok: true; value: T } | { ok: false; result: MatcherResult } {
  const { matcherHint } = ctx.utils;

  try {
    return { ok: true, value: reader() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: {
        pass: false,
        message: () => `${matcherHint(matcherName)}\n\n${reason}`,
      },
    };
  }
}

function compareWithExpected<T>(
  ctx: any,
  actual: T,
  expected: T,
  options: {
    matcher: string;
    args: string[];
    passMessage: string;
    failMessage: string;
    formatDiff?: (actual: T, expected: T, ctx: any) => string | null | undefined;
  }
): MatcherResult {
  const { matcherHint } = ctx.utils;
  const { matcher, args, passMessage, failMessage, formatDiff } = options;

  if (ctx.equals(actual, expected)) {
    return {
      pass: true,
      message: () => `${matcherHint(`.not.${matcher}`, ...args)}\n\n${passMessage}`,
    };
  }

  const diffMessage =
    formatDiff?.(actual, expected, ctx) ??
    (typeof ctx.utils.diff === 'function'
      ? ctx.utils.diff(expected, actual, { expand: ctx.expand }) ?? ''
      : '');

  return {
    pass: false,
    message: () =>
      `${matcherHint(`.${matcher}`, ...args)}\n\n${failMessage}${diffMessage ? `\n\n${diffMessage}` : ''}`,
  };
}

function formatOutlineForMessage(outline: Outline): string {
  return JSON.stringify(outline, null, 2);
}

function formatSelectionSnapshot(snapshot: SelectionSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

function assertOutlineExpectation(outline: Outline, path: number[] = []) {
  for (let index = 0; index < outline.length; index += 1) {
    const node = outline[index]!;
    const nodePath = [...path, index];

    const maybeText = (node as { text?: string | null }).text;
    if (maybeText === null) {
      throw new Error(`outline[${nodePath.join('>')}].text must be omitted or a string; null is not allowed.`);
    }
    const maybeChecked = (node as { checked?: unknown }).checked;
    if (maybeChecked !== undefined && typeof maybeChecked !== 'boolean') {
      throw new TypeError(`outline[${nodePath.join('>')}].checked must be omitted or boolean.`);
    }

    if (node.noteId !== null && (typeof node.noteId !== 'string' || node.noteId.length === 0)) {
      throw new TypeError(`outline[${nodePath.join('>')}].noteId must be a non-empty string or null.`);
    }

    if (Object.hasOwn(node, 'children')) {
      const children = node.children;
      if (!Array.isArray(children)) {
        throw new TypeError(`outline[${nodePath.join('>')}].children must be an array when provided.`);
      }
      if (children.length === 0) {
        throw new TypeError(`outline[${nodePath.join('>')}].children must be omitted when a note has no children.`);
      }
      assertOutlineExpectation(children, nodePath);
    }
  }
}

function readSelectionSnapshot(remdo: RemdoTestHelpers): SelectionSnapshot {
  return remdo.validate(() => {
    const docRoot = $getRoot().getFirstChild();
    const outlineSelection = remdo.editor.selection.get();
    const selection = $getSelection();
    const $readOutlineSelectionNotes = (): string[] => {
      if (outlineSelection?.kind !== 'structural' || !outlineSelection.range) {
        return [];
      }
      return $resolveStructuralItemsFromRange(outlineSelection.range)
        .map((item) => $getNoteId(item))
        .filter((noteId: string | null): noteId is string => typeof noteId === 'string' && noteId.length > 0);
    };

    const outlineNotes = outlineSelection?.kind === 'structural' ? $readOutlineSelectionNotes() : [];

    if (!$isRangeSelection(selection)) {
      return outlineNotes.length > 0
        ? ({ state: 'structural', notes: outlineNotes } satisfies SelectionSnapshot)
        : ({ state: 'none' } satisfies SelectionSnapshot);
    }

    const structuralNotes = $collectNoteIdsFromSelection(selection);
    if (!outlineSelection || outlineSelection.kind !== 'structural' || structuralNotes.length > 0) {
      $assertSelectionRespectsOutline(selection, docRoot);
    }
    if (outlineSelection?.kind === 'structural') {
      if (outlineNotes.length > 0) {
        return { state: 'structural', notes: outlineNotes } satisfies SelectionSnapshot;
      }
      if (structuralNotes.length > 0) {
        return { state: 'structural', notes: structuralNotes } satisfies SelectionSnapshot;
      }
    } else if (!outlineSelection && structuralNotes.length > 0) {
      return { state: 'structural', notes: structuralNotes } satisfies SelectionSnapshot;
    } else if (structuralNotes.length > 1) {
      return { state: 'structural', notes: structuralNotes } satisfies SelectionSnapshot;
    }

    if (selection.isCollapsed()) {
      const caretNote = $getCaretNoteId(selection);
      return caretNote ? ({ state: 'caret', note: caretNote } satisfies SelectionSnapshot) : ({ state: 'none' } satisfies SelectionSnapshot);
    }

    const inlineNote = $getCaretNoteId(selection);
    return inlineNote ? ({ state: 'inline', note: inlineNote } satisfies SelectionSnapshot) : ({ state: 'none' } satisfies SelectionSnapshot);
  });
}

function $collectNoteIdsFromSelection(selection: RangeSelection): string[] {
  const items = collectSelectedListItems(selection);
  const ids: string[] = [];
  for (const item of items) {
    if (!item.isSelected(selection)) {
      continue;
    }
    const noteId = $getNoteId(item);
    if (noteId) {
      ids.push(noteId);
    }
  }
  return ids;
}

function $getCaretNoteId(selection: RangeSelection): string | null {
  const $resolveId = (point: RangeSelection['anchor']): string | null => {
    const item = findNearestListItem(point.getNode());
    if (!item || !item.isAttached()) {
      return null;
    }
    return $getNoteId(item);
  };

  return $resolveId(selection.focus) ?? $resolveId(selection.anchor);
}

/**
 * The editor's outline in the shape a Markdown expectation has, with IDs only where it declares one.
 * Bodies and fold state stay in, so a document Markdown can't express yet fails instead of passing.
 */
type ProjectedNote = MarkdownNote & Pick<OutlineNode, 'body' | 'folded'>;

function projectOutline(actual: Outline, expected: MarkdownNote[] | undefined): ProjectedNote[] {
  return actual.map((node, index) => {
    const declared = expected?.[index];
    const projected: ProjectedNote = {};
    if (node.text) projected.text = node.text;
    if (node.checked) projected.checked = true;
    if (declared?.id !== undefined) projected.id = node.noteId ?? undefined;
    if (node.body !== undefined) projected.body = node.body;
    if (node.folded) projected.folded = true;
    if (node.children) projected.children = projectOutline(node.children, declared?.children);
    return projected;
  });
}

function noteIdAt(outline: Outline, path: NotePath): string {
  let notes: Outline | undefined = outline;
  let node: OutlineNode | undefined;
  for (const index of path) {
    node = notes?.[index];
    notes = node?.children;
  }
  return node?.noteId ?? `<no note at ${path.join('.')}>`;
}

interface NotePoint {
  note: string;
  offset: number;
}

type SelectionDetail =
  | { state: 'none' }
  | { state: 'caret'; at: NotePoint }
  | { state: 'inline'; anchor: NotePoint; focus: NotePoint }
  | { state: 'structural'; notes: string[] };

function resolveMarkdownSelection(selection: MarkdownSelection, outline: Outline): SelectionDetail {
  const at = (point: MarkdownPoint) => ({ note: noteIdAt(outline, point.note), offset: point.offset });
  if (selection.state === 'structural') return { state: 'structural', notes: selection.notes.map((path) => noteIdAt(outline, path)) };
  if (selection.state === 'caret') return { state: 'caret', at: at(selection.at) };
  return { state: 'inline', anchor: at(selection.anchor), focus: at(selection.focus) };
}

function $pointInNote(point: PointType): NotePoint | null {
  const node = point.getNode();
  const item = findNearestListItem(node);
  const note = item ? $getNoteId(item) : null;
  if (!item || !note) return null;
  if (point.type === 'element' && node === item) {
    const before = item.getChildren().slice(0, point.offset);
    return { note, offset: before.reduce((sum, child) => sum + child.getTextContentSize(), 0) };
  }
  let offset = 0;
  for (const text of item.getAllTextNodes()) {
    if (text === node) return { note, offset: offset + point.offset };
    offset += text.getTextContentSize();
  }
  return { note, offset };
}

function readSelectionDetail(remdo: RemdoTestHelpers): SelectionDetail {
  const snapshot = readSelectionSnapshot(remdo);
  if (snapshot.state === 'structural' || snapshot.state === 'none') return snapshot;
  return remdo.validate(() => {
    const selection = $getSelection() as RangeSelection;
    const anchor = $pointInNote(selection.anchor);
    const focus = $pointInNote(selection.focus);
    if (!anchor || !focus) return { state: 'none' };
    return selection.isCollapsed() ? { state: 'caret', at: focus } : { state: 'inline', anchor, focus };
  });
}

function matchMarkdownOutline(ctx: any, remdo: RemdoTestHelpers, expected: string): MatcherResult {
  const read = attemptRead(ctx, '.toMatchOutline', () => {
    const parsed = readMarkdownOutline(expected);
    const outline = extractOutlineFromEditorState(remdo.getEditorState());
    const actual: { outline: ProjectedNote[]; selection?: SelectionDetail } = { outline: projectOutline(outline, parsed.notes) };
    const wanted: typeof actual = { outline: parsed.notes };
    if (parsed.selection) {
      actual.selection = readSelectionDetail(remdo);
      wanted.selection = resolveMarkdownSelection(parsed.selection, outline);
    }
    return { actual, wanted };
  });
  if (!read.ok) return read.result;

  return compareWithExpected(ctx, read.value.actual, read.value.wanted, {
    matcher: 'toMatchOutline',
    args: ['lexical', 'expectedMarkdown'],
    passMessage: 'Expected the document not to match, but it did.',
    failMessage: 'The document differs from the expected Markdown.',
  });
}

expect.extend({
  // TODO: Object expectations remain while specs migrate to Markdown, and for bodies and fold
  // state until the text-format spike settles how Markdown holds them
  // (docs/text-format-plan.md). Probe: narrow `expected` to `string`; nothing fails to compile.
  toMatchOutline(this: any, remdo: RemdoTestHelpers, expected: Outline | string) {
    if (typeof expected === 'string') return matchMarkdownOutline(this, remdo, expected);
    assertOutlineExpectation(expected);

    const outline = attemptRead(this, '.toMatchOutline', () => {
      const actual = extractOutlineFromEditorState(remdo.getEditorState());
      mutateOutlineNoteIdWildcards(actual, expected);
      return actual;
    });
    if (!outline.ok) return outline.result;

    return compareWithExpected(this, outline.value, expected, {
      matcher: 'toMatchOutline',
      args: ['lexical', 'expectedOutline'],
      passMessage: 'Expected outlines not to match, but readOutline produced the same structure.',
      failMessage: 'Outlines differ.',
      formatDiff: (actual, expectedOutline) =>
        ['Expected outline:', formatOutlineForMessage(expectedOutline), '', 'Received outline:', formatOutlineForMessage(actual)].join(
          '\n'
        ),
    });
  },

  toMatchEditorState(this: any, remdo: RemdoTestHelpers, expected: unknown) {
    const actual = attemptRead(this, '.toMatchEditorState', () => remdo.getEditorState());
    if (!actual.ok) return actual.result;

    return compareWithExpected(this, actual.value, expected, {
      matcher: 'toMatchEditorState',
      args: ['lexical', 'expectedState'],
      passMessage: 'Expected editor state not to match, but toJSON returned identical data.',
      failMessage: 'Editor state differs.',
    });
  },
  toMatchSelection(this: any, remdo: RemdoTestHelpers, expected: SelectionSnapshot) {
    const selection = attemptRead(this, '.toMatchSelection', () => readSelectionSnapshot(remdo));
    if (!selection.ok) return selection.result;

    return compareWithExpected(this, selection.value, expected, {
      matcher: 'toMatchSelection',
      args: ['lexical', 'expectedSelection'],
      passMessage: 'Expected selection not to match, but readSelectionSnapshot produced the same state.',
      failMessage: 'Selections differ.',
      formatDiff: (actual, expectedSnapshot) =>
        ['Expected selection:', formatSelectionSnapshot(expectedSnapshot), '', 'Received selection:', formatSelectionSnapshot(actual)].join('\n'),
    });
  },
});
function $assertSelectionRespectsOutline(selection: RangeSelection, root: LexicalNode | null) {
  const selectedItems = collectSelectedListItems(selection);
  if (selectedItems.length <= 1) {
    return;
  }

  const { orderedItems, rangeByKey } = collectListItemOrderMetadata(root);
  if (orderedItems.length === 0) {
    return;
  }

  const selectedKeys = new Set(selectedItems.map((item) => item.getKey()));
  let minIndex = Number.POSITIVE_INFINITY;
  let maxIndex = Number.NEGATIVE_INFINITY;

  for (const item of selectedItems) {
    const range = rangeByKey.get(item.getKey());
    if (!range) {
      continue;
    }
    if (range.start < minIndex) {
      minIndex = range.start;
    }
    if (range.end > maxIndex) {
      maxIndex = range.end;
    }
  }

  if (!Number.isFinite(minIndex) || !Number.isFinite(maxIndex)) {
    return;
  }

  for (let index = minIndex; index <= maxIndex; index += 1) {
    const item = orderedItems[index];
    if (!item) {
      continue;
    }
    if (!selectedKeys.has(item.getKey())) {
      const missingId = $getNoteId(item) ?? item.getKey();
      throw new Error(`Selection must cover a contiguous block of notes and subtrees; missing ${missingId}`);
    }
  }
}

function collectListItemOrderMetadata(root: LexicalNode | null): {
  orderedItems: ListItemNode[];
  rangeByKey: Map<string, ListItemRange>;
} {
  const orderedItems: ListItemNode[] = [];
  const rangeByKey = new Map<string, ListItemRange>();
  const startIndexByKey = new Map<string, number>();

  traverseListItems(root, {
    enter: (item) => {
      startIndexByKey.set(item.getKey(), orderedItems.length);
      orderedItems.push(item);
    },
    leave: (item) => {
      const start = startIndexByKey.get(item.getKey());
      if (start === undefined) {
        return;
      }
      const end = orderedItems.length - 1;
      rangeByKey.set(item.getKey(), { start, end });
    },
  });

  return { orderedItems, rangeByKey };
}

interface ListItemRange {
  start: number;
  end: number;
}

interface ListItemTraversalCallbacks {
  enter?: (item: ListItemNode) => void;
  leave?: (item: ListItemNode) => void;
}

function traverseListItems(node: LexicalNode | null, callbacks: ListItemTraversalCallbacks) {
  if (!$isListNode(node)) {
    return;
  }

  for (const child of node.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    const contentItem = resolveContentListItem(child);
    callbacks.enter?.(contentItem);

    const nestedList = getNestedList(contentItem);
    if (nestedList) {
      traverseListItems(nestedList, callbacks);
    }

    callbacks.leave?.(contentItem);
  }
}

function getNestedList(item: ListItemNode): LexicalNode | null {
  const wrapper = item.getNextSibling();
  if (isChildrenWrapper(wrapper)) {
    const nested = wrapper.getFirstChild();
    return $isListNode(nested) ? nested : null;
  }

  for (const child of item.getChildren()) {
    if ($isListNode(child)) {
      return child;
    }
  }

  return null;
}
