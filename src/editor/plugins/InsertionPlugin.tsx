import type { ListItemNode } from '@lexical/list';
import { $createListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createRangeSelection,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import type { LexicalNode } from 'lexical';
import { useEffect } from 'react';
import { $isNoteFolded } from '#lib/editor/fold-state';
import { $findNoteById } from '@/editor/outline/note-traversal';
import type { NoteSdk, PlaceTarget } from '@/editor/outline/sdk';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import { $requireContentItemNoteId, resolveContentItemFromNode } from '@/editor/outline/schema';
import { $getOrCreateChildList, insertBefore } from '@/editor/outline/list-structure';
import { resolveBoundaryPoint } from '@/editor/outline/selection/caret';
import { resolveCaretPlacement } from '@/editor/outline/selection/caret-placement';
import { getZoomBoundary } from '@/editor/outline/selection/boundary';
import { getNestedList, noteHasChildren } from '@/editor/outline/selection/tree';
import { useCollaborationStatus } from './collaboration';

function $selectNoteStartById(noteId: string): void {
  const note = $findNoteById(noteId);
  if (!note) {
    return;
  }
  const textNode = note.getChildren().find($isTextNode);
  textNode?.select(0, 0);
}

function $placeEmptyNoteAndSelectStart(sdk: NoteSdk, target: PlaceTarget): void {
  const placed = sdk.createNote(target);
  $selectNoteStartById(placed.id());
}

function $handleEnterAtStart(contentItem: ListItemNode, sdk: NoteSdk): void {
  $placeEmptyNoteAndSelectStart(sdk, { before: $requireContentItemNoteId(contentItem) });
}

function $handleEnterAtEnd(contentItem: ListItemNode, sdk: NoteSdk): void {
  const contentItemId = $requireContentItemNoteId(contentItem);
  const nestedList = getNestedList(contentItem);
  const hasChildren = noteHasChildren(contentItem);

  if (nestedList && hasChildren) {
    if ($isNoteFolded(contentItem)) {
      $placeEmptyNoteAndSelectStart(sdk, { after: contentItemId });
      return;
    }

    $placeEmptyNoteAndSelectStart(sdk, { parent: contentItemId, index: 0 });
    return;
  }

  $placeEmptyNoteAndSelectStart(sdk, { after: contentItemId });
}

function $insertFirstChild(contentItem: ListItemNode, newItem: ListItemNode) {
  const childList = $getOrCreateChildList(contentItem);
  const firstChild = childList.getFirstChild();
  if (firstChild) {
    insertBefore(firstChild, [newItem]);
    return;
  }
  childList.append(newItem);
}

function $splitContentItemAtSelection(
  contentItem: ListItemNode,
  selection: ReturnType<typeof $getSelection>,
  destination: 'sibling' | 'first-child' = 'sibling'
): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode) || anchorNode.getParent() !== contentItem) {
    return false;
  }

  const offset = selection.anchor.offset;
  const size = anchorNode.getTextContentSize();
  let splitAfterNode = null;

  if (offset > 0 && offset < size) {
    const [, rightNode] = anchorNode.splitText(offset);
    splitAfterNode = rightNode;
  } else if (offset === 0) {
    splitAfterNode = anchorNode;
  } else if (offset === size) {
    splitAfterNode = anchorNode.getNextSibling();
  }

  if (!splitAfterNode) {
    return false;
  }

  const newItem = $createListItemNode();

  if (destination === 'first-child') {
    let child: ReturnType<typeof contentItem.getFirstChild> = splitAfterNode;
    while (child !== null) {
      const nextSibling: LexicalNode | null = child.getNextSibling();
      newItem.append(child);
      child = nextSibling;
    }
  } else {
    let child = contentItem.getFirstChild();
    while (child && child !== splitAfterNode) {
      const next = child.getNextSibling();
      newItem.append(child);
      child = next;
    }
  }

  if (newItem.getChildrenSize() === 0) {
    return false;
  }

  if (destination === 'first-child') {
    $insertFirstChild(contentItem, newItem);
  } else {
    contentItem.insertBefore(newItem);
  }

  const caretTarget = destination === 'first-child' ? newItem : contentItem;
  const caretPoint = resolveBoundaryPoint(caretTarget, 'start');
  if (caretPoint) {
    const range = $createRangeSelection();
    range.setTextNodeRange(caretPoint.node, caretPoint.offset, caretPoint.node, caretPoint.offset);
    $setSelection(range);
  }

  return true;
}

export function InsertionPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!editor.selection.isStructural()) {
            return false;
          }

          event?.preventDefault();
          event?.stopPropagation();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!event || !editor.selection.isStructural()) {
            return false;
          }
          if (event.altKey || event.metaKey || event.ctrlKey) {
            return false;
          }
          if (event.key.length !== 1) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }

          const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
          if (!contentItem) {
            return false;
          }
          const zoomBoundaryKey = getZoomBoundary(editor);
          const isZoomRoot = zoomBoundaryKey !== null && contentItem.getKey() === zoomBoundaryKey;
          const sdk = createLexicalNoteSdk({ editor, docId });

          const placement = resolveCaretPlacement(selection, contentItem);
          if (placement === 'start') {
            if (isZoomRoot) {
              $placeEmptyNoteAndSelectStart(sdk, { parent: $requireContentItemNoteId(contentItem), index: 0 });
            } else {
              $handleEnterAtStart(contentItem, sdk);
            }
            event?.preventDefault();
            event?.stopPropagation();
            return true;
          }

          if (placement === 'end') {
            if (isZoomRoot) {
              $placeEmptyNoteAndSelectStart(sdk, { parent: $requireContentItemNoteId(contentItem), index: 0 });
            } else {
              $handleEnterAtEnd(contentItem, sdk);
            }
            event?.preventDefault();
            event?.stopPropagation();
            return true;
          }

          if (placement === 'middle') {
            const split = $splitContentItemAtSelection(contentItem, selection, isZoomRoot ? 'first-child' : 'sibling');
            if (!split) {
              return false;
            }
            event?.preventDefault();
            event?.stopPropagation();
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, docId]);

  return null;
}
