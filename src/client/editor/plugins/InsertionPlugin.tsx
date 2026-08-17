import type { ListItemNode } from '@lexical/list';
import { $createListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import type { LexicalNode, RangeSelection } from 'lexical';
import { useEffect } from 'react';
import { stopKeyboardEvent } from '#client/editor/keyboard-event';
import { $isNoteFolded } from '#client/editor/runtime/fold-state';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { $getOrCreateChildList, getBodyWrapper, insertBefore } from '#client/editor/outline/list-structure';
import { resolveBoundaryPoint } from '#client/editor/outline/selection/caret';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { resolveCaretPlacement } from '#client/editor/outline/selection/caret-placement';
import { getZoomRoot } from '#client/editor/features/zoom/zoom-root';
import { getNestedList, noteHasChildren } from '#client/editor/outline/selection/tree';

function $createNote(text: string): ListItemNode {
  const item = $createListItemNode();
  item.append($createTextNode(text));
  return item;
}

function $handleEnterAtStart(contentItem: ListItemNode) {
  const newItem = $createNote('');
  contentItem.insertBefore(newItem);
  const textNode = newItem.getChildren().find($isTextNode);
  textNode?.select(0, 0);
}

function $handleEnterAtEnd(contentItem: ListItemNode) {
  const nestedList = getNestedList(contentItem);
  const hasChildren = noteHasChildren(contentItem);

  if (nestedList && hasChildren) {
    if ($isNoteFolded(contentItem)) {
      const newSibling = $createNote('');
      const wrapper = nestedList.getParentOrThrow();
      wrapper.insertAfter(newSibling);
      const textNode = newSibling.getChildren().find($isTextNode);
      textNode?.select(0, 0);
      return;
    }

    const newChild = $createNote('');
    const firstChild = nestedList.getFirstChild();
    if (firstChild) {
      insertBefore(firstChild, [newChild]);
    } else {
      nestedList.append(newChild);
    }
    const textNode = newChild.getChildren().find($isTextNode);
    textNode?.select(0, 0);
    return;
  }

  const newSibling = $createNote('');
  // A next sibling goes after the note's body-wrapper (if any), not between the
  // note and its body.
  (getBodyWrapper(contentItem) ?? contentItem).insertAfter(newSibling);
  const textNode = newSibling.getChildren().find($isTextNode);
  textNode?.select(0, 0);
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

function $insertEmptyFirstChild(contentItem: ListItemNode) {
  const newChild = $createNote('');
  $insertFirstChild(contentItem, newChild);
  const textNode = newChild.getChildren().find($isTextNode);
  textNode?.select(0, 0);
}

// Whole-note snapping lands a microtask after the keystroke, so a synchronous
// handler can still observe a range spanning two notes or a content-to-body range.
function $isWithinOneNote(selection: RangeSelection, contentItem: ListItemNode): boolean {
  return resolveContentItemFromNode(selection.anchor.getNode()) === contentItem
    && resolveContentItemFromNode(selection.focus.getNode()) === contentItem;
}

function $coversWholeContentText(selection: RangeSelection, contentItem: ListItemNode): boolean {
  // Untrimmed on purpose: a whitespace-only note still has content to clear,
  // so `isEmptyNoteBody` is not a substitute for the emptiness half.
  const contentText = getNoteOwnText(contentItem);
  return contentText.length > 0 && selection.getTextContent() === contentText;
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
  // Compare keys, not object identity: a write reclones the node, so a
  // reference captured before one (such as before `removeText`) is stale.
  const anchorItemKey = $isTextNode(anchorNode)
    ? anchorNode.getParent()?.getKey()
    : anchorNode.getKey();
  if (anchorItemKey !== contentItem.getKey()) {
    return false;
  }

  const offset = selection.anchor.offset;
  let splitAfterNode = null;

  if ($isTextNode(anchorNode)) {
    const size = anchorNode.getTextContentSize();
    if (offset > 0 && offset < size) {
      const [, rightNode] = anchorNode.splitText(offset);
      splitAfterNode = rightNode;
    } else if (offset === 0) {
      splitAfterNode = anchorNode;
    } else {
      splitAfterNode = anchorNode.getNextSibling();
    }
  } else {
    // An element anchor already points between children — for example after
    // removing a note's only text node, leaving a decorator such as a date.
    splitAfterNode = contentItem.getChildAtIndex(offset);
  }

  if (!splitAfterNode) {
    return false;
  }

  const newItem = $createListItemNode();

  if (destination === 'first-child') {
    let child: LexicalNode | null = splitAfterNode;
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

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!editor.selection.isStructural()) {
            return false;
          }

          return stopKeyboardEvent(event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (!editor.selection.isStructural()) {
            return false;
          }
          if (event.altKey || event.metaKey || event.ctrlKey) {
            return false;
          }
          if (event.key.length !== 1) {
            return false;
          }

          return stopKeyboardEvent(event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection)) {
            return false;
          }

          const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
          if (!contentItem) {
            return false;
          }
          const zoomRootKey = getZoomRoot(editor);
          const isZoomRoot = zoomRootKey !== null && contentItem.getKey() === zoomRootKey;

          // An inline text selection removes its text and then takes the caret
          // rules below, so it needs no placement rules of its own. Whether it
          // covered the whole content text is only observable before removal:
          // afterwards the emptied note is indistinguishable from one that was
          // already empty, which resolves to 'start'.
          const removedText = !selection.isCollapsed();
          let clearedWholeText = false;
          if (removedText) {
            if (!$isWithinOneNote(selection, contentItem)) {
              return false;
            }
            clearedWholeText = $coversWholeContentText(selection, contentItem);
            selection.removeText();
          }

          const placement = clearedWholeText ? 'end' : resolveCaretPlacement(selection, contentItem);

          if (placement === 'start' || placement === 'end') {
            if (isZoomRoot) {
              $insertEmptyFirstChild(contentItem);
            } else if (placement === 'start') {
              $handleEnterAtStart(contentItem);
            } else {
              $handleEnterAtEnd(contentItem);
            }
            return stopKeyboardEvent(event);
          }

          if (placement === 'middle'
            && $splitContentItemAtSelection(contentItem, selection, isZoomRoot ? 'first-child' : 'sibling')) {
            return stopKeyboardEvent(event);
          }

          // Text already removed above must not also reach the framework
          // default, which would insert a second note for the same keystroke.
          return removedText ? stopKeyboardEvent(event) : false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor]);

  return null;
}
