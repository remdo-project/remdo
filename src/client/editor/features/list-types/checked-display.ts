import { $isListNode, ListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey } from 'lexical';
import type { NoteCheckedDisplay } from './checked-subtree';
import { NoteCheckedDisplayCache } from './checked-subtree';
import { $getNoteChecked } from './checked-state';
import { getPreviousContentSibling, isChildrenWrapper, isContentItem } from '#client/editor/outline/list-structure';
import { getWrapperForContent } from '#client/editor/outline/selection/tree';

// The mutation listener observes whatever tree a batch leaves behind, including
// the transiently malformed shapes that normalization is still repairing (an
// orphan children-wrapper has no preceding note). Resolving the parent without
// asserting keeps the listener from reporting invariants for states that the
// repair pass is about to fix; command paths keep using the asserting resolver.
const $findParentContentItem = (item: ListItemNode): ListItemNode | null => {
  const parentList = item.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }
  const parentWrapper = parentList.getParent();
  return isChildrenWrapper(parentWrapper) ? getPreviousContentSibling(parentWrapper) : null;
};

const ARIA_CHECKED_BY_DISPLAY: Record<NoteCheckedDisplay, string> = {
  checked: 'true',
  mixed: 'mixed',
  unchecked: 'false',
};

const $syncNoteCheckedDataset = (
  editor: LexicalEditor,
  node: ListItemNode,
  display: NoteCheckedDisplay
): void => {
  const element = editor.getElementByKey(node.getKey());
  if (!(element instanceof HTMLElement)) {
    return;
  }
  // `data-note-checked` reports the note's own completion, so a note the user
  // checked keeps reading as done regardless of what is later moved under it.
  if ($getNoteChecked(node) === true) {
    element.dataset.noteChecked = 'true';
  } else {
    delete element.dataset.noteChecked;
  }
  // `data-note-subtree` reports the subtree, which drives the mixed marker.
  if (display === 'mixed') {
    element.dataset.noteSubtree = 'mixed';
  } else {
    delete element.dataset.noteSubtree;
  }
  // A note's children live in a sibling wrapper, so the wrapper carries the
  // "everything in here sits under a checked note" flag and CSS dims the
  // unchecked notes within it at any depth.
  const wrapper = getWrapperForContent(node);
  const wrapperElement = wrapper ? editor.getElementByKey(wrapper.getKey()) : null;
  if (wrapperElement instanceof HTMLElement) {
    if ($getNoteChecked(node) === true) {
      wrapperElement.dataset.noteUnderChecked = 'true';
    } else {
      delete wrapperElement.dataset.noteUnderChecked;
    }
  }
  // Lexical writes a binary aria-checked from the item's own checked flag while
  // reconciling a check-type list; a mixed subtree needs the third ARIA value.
  if (element.getAttribute('role') === 'checkbox') {
    element.setAttribute('aria-checked', ARIA_CHECKED_BY_DISPLAY[display]);
  }
};

/** Shows each note's checked state, and its subtree's, in the DOM; it writes nothing to the editor. */
export function registerNoteCheckedDisplay(editor: LexicalEditor): () => void {
  return editor.registerMutationListener(ListItemNode, (mutations) => {
    editor.getEditorState().read(() => {
      // A mutated note changes its ancestors' subtree state, and Lexical
      // does not report an ancestor as mutated when only a descendant
      // changed, so each mutated note's ancestor chain resyncs too.
      // Descendants need no walk: dimming hangs off the children-wrapper,
      // and a recursive write marks every note it touches as mutated.
      const mutated: ListItemNode[] = [];
      for (const [key, mutation] of mutations) {
        if (mutation === 'destroyed') {
          // A destroyed note has no ancestors to walk. Its former parent
          // still resyncs, because removing a note dirties its siblings
          // and its wrapper's owner.
          continue;
        }
        // Wrappers are ListItemNodes too, and a body wrapper's next
        // sibling is the owning note's children wrapper — syncing one as
        // if it were a note would clear that wrapper's open-work flag.
        const node = $getNodeByKey(key);
        if (isContentItem(node)) {
          mutated.push(node);
        }
      }

      // A note already pending had its whole ancestor chain added with it.
      const pending = new Map<string, ListItemNode>();
      for (const node of mutated) {
        for (let item: ListItemNode | null = node; item && !pending.has(item.getKey()); item = $findParentContentItem(item)) {
          pending.set(item.getKey(), item);
        }
      }

      const displays = new NoteCheckedDisplayCache();
      for (const node of pending.values()) {
        $syncNoteCheckedDataset(editor, node, displays.get(node));
      }
    });
  });
}
