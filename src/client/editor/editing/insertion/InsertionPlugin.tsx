import type { ListItemNode } from '@lexical/list';
import { $createListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import type { RangeSelection } from 'lexical';
import { useEffect } from 'react';
import { stopKeyboardEvent } from '#client/editor/foundation/keyboard-event';
import { $isNoteFolded } from '#client/editor/outline/fold-state';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { getBodyWrapper, insertBefore } from '#client/editor/outline/list-structure';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { resolveCaretPlacement } from '#client/editor/outline/selection/caret-placement';
import { $insertFirstChildNodes, $splitContentItemAtSelection } from '#client/editor/outline/selection/split-content-item';
import { getViewRoot } from '#client/editor/outline/view-root';
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

function $insertEmptyFirstChild(contentItem: ListItemNode) {
  const newChild = $createNote('');
  $insertFirstChildNodes(contentItem, [newChild]);
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
          const viewRootKey = getViewRoot(editor);
          const isViewRoot = viewRootKey !== null && contentItem.getKey() === viewRootKey;

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
            if (isViewRoot) {
              $insertEmptyFirstChild(contentItem);
            } else if (placement === 'start') {
              $handleEnterAtStart(contentItem);
            } else {
              $handleEnterAtEnd(contentItem);
            }
            return stopKeyboardEvent(event);
          }

          if (placement === 'middle'
            && $splitContentItemAtSelection(contentItem, selection, isViewRoot ? 'first-child' : 'sibling')) {
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
