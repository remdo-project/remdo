import type { TestContext } from 'vitest';
import type { Outline, SelectionSnapshot } from '#tests';
import { expect } from 'vitest';
import {
  collectSelectedListItems,
  findNearestListItem,
  getListItemLabel,
  isChildrenWrapper,
  readOutline,
  resolveContentListItem,
} from '#tests';
import { $getSelection, $isRangeSelection, $getNodeByKey, $getRoot } from 'lexical';
import type { RangeSelection, LexicalNode } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';

type LexicalTestHelpers = TestContext['lexical'];

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

function readSelectionSnapshot(lexical: LexicalTestHelpers): SelectionSnapshot {
  const rootElement = lexical.editor.getRootElement();
  return lexical.validate(() => {
    const docRoot = $getRoot().getFirstChild();
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return { state: 'none' } satisfies SelectionSnapshot;
    }

    assertSelectionRespectsOutline(selection, docRoot);

    if (selection.isCollapsed()) {
      const caretNote = getCaretNoteLabel(selection);
      return caretNote ? ({ state: 'caret', note: caretNote } satisfies SelectionSnapshot) : ({ state: 'none' } satisfies SelectionSnapshot);
    }

    const structuralNotes = collectLabelsFromSelection(selection);
    if (structuralNotes.length > 0) {
      return { state: 'structural', notes: structuralNotes } satisfies SelectionSnapshot;
    }

    const datasetNotes = rootElement?.dataset.structuralSelectionKeys
      ?.split(',')
      .filter(Boolean)
      .map((key) => {
        const node = $getNodeByKey<ListItemNode>(key);
        if (!node || !node.isAttached()) {
          return null;
        }
        return getListItemLabel(node);
      })
      .filter((label): label is string => typeof label === 'string' && label.length > 0);

    if (datasetNotes?.length) {
      return { state: 'structural', notes: datasetNotes } satisfies SelectionSnapshot;
    }

    const inlineNote = getCaretNoteLabel(selection);
    return inlineNote ? ({ state: 'inline', note: inlineNote } satisfies SelectionSnapshot) : ({ state: 'none' } satisfies SelectionSnapshot);
  });
}

function collectLabelsFromSelection(selection: RangeSelection): string[] {
  const items = collectSelectedListItems(selection);
  const labels: string[] = [];
  for (const item of items) {
    if (!item.isSelected(selection)) {
      continue;
    }
    const label = getListItemLabel(item);
    if (label) {
      labels.push(label);
    }
  }
  return labels;
}

function getCaretNoteLabel(selection: RangeSelection): string | null {
  const resolveLabel = (point: RangeSelection['anchor']): string | null => {
    const item = findNearestListItem(point.getNode());
    if (!item || !item.isAttached()) {
      return null;
    }
    return getListItemLabel(item);
  };

  return resolveLabel(selection.focus) ?? resolveLabel(selection.anchor);
}

expect.extend({
  toMatchOutline(this: any, lexical: LexicalTestHelpers, expected: Outline) {
    const outline = attemptRead(this, '.toMatchOutline', () => readOutline(lexical.validate));
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

  toMatchEditorState(this: any, lexical: LexicalTestHelpers, expected: unknown) {
    const actual = attemptRead(this, '.toMatchEditorState', () => lexical.getEditorState());
    if (!actual.ok) return actual.result;

    return compareWithExpected(this, actual.value, expected, {
      matcher: 'toMatchEditorState',
      args: ['lexical', 'expectedState'],
      passMessage: 'Expected editor state not to match, but toJSON returned identical data.',
      failMessage: 'Editor state differs.',
    });
  },
  toMatchSelection(this: any, lexical: LexicalTestHelpers, expected: SelectionSnapshot) {
    const selection = attemptRead(this, '.toMatchSelection', () => readSelectionSnapshot(lexical));
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
function assertSelectionRespectsOutline(selection: RangeSelection, root: LexicalNode | null) {
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
      const missingLabel = getListItemLabel(item) ?? item.getKey();
      throw new Error(`Selection must cover a contiguous block of notes and subtrees; missing ${missingLabel}`);
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
  if ($isListItemNode(wrapper) && isChildrenWrapper(wrapper)) {
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
