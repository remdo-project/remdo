import type { ListItemNode } from '@lexical/list';
import { $createListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import { $resolveZoomRoot } from '#client/editor/features/zoom/zoom-root';
import { $normalizeOutlineRoot } from '#client/editor/outline/normalization';
import {
  $requireRootContentList,
  $resolveRootContentList,
  resolveContentItemFromNode,
} from '#client/editor/outline/schema';
import { $selectItemEdge } from './caret';
import { $resolveStructuralDeletionTargets, applyStructuralDeletionTargets } from './deletion';
import { getFirstDescendantListItem } from './tree';

/**
 * Whether the editor's current structural selection has notes that can be
 * deleted. Non-mutating: safe to call for computing a disabled state.
 */
export function $canDeleteSelectedNotes(editor: LexicalEditor): boolean {
  if (!editor.selection.isStructural()) {
    return false;
  }
  const structuralRange = editor.selection.get()?.range;
  if (!structuralRange) {
    return false;
  }
  const zoomRoot = $resolveZoomRoot(editor);
  return $resolveStructuralDeletionTargets(structuralRange, $getSelection(), zoomRoot) !== null;
}

/**
 * Delete the notes in the editor's current structural selection and place the
 * caret sensibly. Returns false (no mutation) when there is no deletable
 * structural selection. Shared by the keyboard delete/backspace path and the
 * mobile action toolbar.
 */
export function $deleteSelectedNotes(editor: LexicalEditor): boolean {
  if (!editor.selection.isStructural()) {
    return false;
  }

  const structuralRange = editor.selection.get()?.range;
  if (!structuralRange) {
    return false;
  }

  const selection = $getSelection();
  const zoomRoot = $resolveZoomRoot(editor);
  const structuralTargets = $resolveStructuralDeletionTargets(structuralRange, selection, zoomRoot);
  if (!structuralTargets) {
    return false;
  }

  applyStructuralDeletionTargets(structuralTargets);

  let caretApplied = false;
  if (structuralTargets.caretPlan) {
    caretApplied = $selectItemEdge(structuralTargets.caretPlan.target, structuralTargets.caretPlan.edge);
  }

  if (!caretApplied && zoomRoot && zoomRoot.isAttached()) {
    caretApplied = $selectItemEdge(zoomRoot, 'start');
  }

  if (!caretApplied) {
    let rootList = $resolveRootContentList();
    if (!rootList) {
      $normalizeOutlineRoot($getRoot());
      rootList = $requireRootContentList();
    }

    const firstItem = getFirstDescendantListItem(rootList);
    let targetItem: ListItemNode;

    if (firstItem) {
      targetItem = firstItem;
    } else {
      const listItem = $createListItemNode();
      listItem.append($createParagraphNode());
      rootList.append(listItem);
      targetItem = listItem;
    }

    caretApplied = $selectItemEdge(targetItem, 'start');
  }

  if (!caretApplied && $isRangeSelection(selection)) {
    const anchorNode = selection.anchor.getNode();
    if ($isTextNode(anchorNode)) {
      selection.setTextNodeRange(anchorNode, selection.anchor.offset, anchorNode, selection.anchor.offset);
    } else {
      const contentItem = resolveContentItemFromNode(anchorNode);
      if (contentItem) {
        $selectItemEdge(contentItem, 'start');
      }
    }
  }

  return true;
}
