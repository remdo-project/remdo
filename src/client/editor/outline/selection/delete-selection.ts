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
import { $resolveSelectedNoteRange } from '#client/editor/plugins/selected-note-range';
import { $selectItemEdge } from './caret';
import { $resolveStructuralDeletionTargets, applyStructuralDeletionTargets } from './deletion';
import { getFirstDescendantListItem } from './tree';

interface ResolvedDeletion {
  targets: NonNullable<ReturnType<typeof $resolveStructuralDeletionTargets>>;
  selection: ReturnType<typeof $getSelection>;
  zoomRoot: ListItemNode | null;
}

// Deletion targets for a resolved note range, plus the selection and zoom root
// the caret placement needs. Null when nothing is deletable. Non-mutating.
function $resolveDeletionForRange(
  editor: LexicalEditor,
  range: ReturnType<typeof $resolveSelectedNoteRange>
): ResolvedDeletion | null {
  if (!range) {
    return null;
  }
  const selection = $getSelection();
  const zoomRoot = $resolveZoomRoot(editor);
  const targets = $resolveStructuralDeletionTargets(range, selection, zoomRoot);
  return targets ? { targets, selection, zoomRoot } : null;
}

// Keyboard Backspace/Delete path: only a structural multi-note selection removes
// whole notes here; a caret is handled by the plugin's merge logic instead.
function $resolveStructuralDeletion(editor: LexicalEditor): ResolvedDeletion | null {
  if (!editor.selection.isStructural()) {
    return null;
  }
  return $resolveDeletionForRange(editor, editor.selection.get()?.range ?? null);
}

// Toolbar "delete this note" path: the focused note for a caret, or every head
// of a structural selection. Removing a whole note (with its subtree) is
// distinct from caret-mode Backspace/Delete, which merges.
function $resolveSelectedNotesDeletion(editor: LexicalEditor): ResolvedDeletion | null {
  return $resolveDeletionForRange(editor, $resolveSelectedNoteRange(editor));
}

/**
 * Whether the keyboard delete/backspace path can remove whole notes: true only
 * for a structural multi-note selection. Non-mutating.
 */
export function $canDeleteSelectedNotes(editor: LexicalEditor): boolean {
  return $resolveStructuralDeletion(editor) !== null;
}

/**
 * Delete the notes in the editor's current structural selection and place the
 * caret. Returns false (no mutation) when there is no deletable structural
 * selection — the keyboard path's caret handling lives in DeletionPlugin.
 */
export function $deleteSelectedNotes(editor: LexicalEditor): boolean {
  return $applyResolvedDeletion($resolveStructuralDeletion(editor));
}

/**
 * Whether the mobile toolbar's delete can remove a note: true for a caret in a
 * note or a structural selection. Non-mutating.
 */
export function $canDeleteFocusedOrSelectedNotes(editor: LexicalEditor): boolean {
  return $resolveSelectedNotesDeletion(editor) !== null;
}

/**
 * Mobile toolbar "delete this note": remove the focused note (for a caret) or
 * every head of a structural selection, with its subtree, then place the caret.
 * Returns false (no mutation) when nothing is deletable.
 */
export function $deleteFocusedOrSelectedNotes(editor: LexicalEditor): boolean {
  return $applyResolvedDeletion($resolveSelectedNotesDeletion(editor));
}

function $applyResolvedDeletion(resolved: ResolvedDeletion | null): boolean {
  if (!resolved) {
    return false;
  }
  const { targets: structuralTargets, selection, zoomRoot } = resolved;

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
