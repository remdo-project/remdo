import type { ListItemNode } from '@lexical/list';

import { getContentSiblings } from '#client/editor/outline/list-structure';
import { getNestedList } from '#client/editor/outline/selection/tree';
import { $getNoteChecked } from '#client/editor/features/checklist/checked-state';

// A note's own checked flag says whether the user completed that note; this
// derived state says whether its whole subtree is complete. They differ once a
// structure edit (indenting an unchecked note under a checked one) leaves a
// subtree partly checked, which is what the mixed marker reports.
export type NoteCheckedDisplay = 'checked' | 'mixed' | 'unchecked';

// The toggle asks only whether a target is already complete, so it stops at the
// first unchecked note rather than resolving the whole subtree.
export function $isNoteSubtreeChecked(node: ListItemNode): boolean {
  if ($getNoteChecked(node) !== true) {
    return false;
  }
  const nested = getNestedList(node);
  return nested ? getContentSiblings(nested).every($isNoteSubtreeChecked) : true;
}

// Resolving a whole ancestor chain one note at a time re-walks the same
// descendants once per level. Caching by key lets each note fold its children's
// already-resolved states instead, so a chain costs one pass over the region.
export class NoteCheckedDisplayCache {
  private readonly byKey = new Map<string, NoteCheckedDisplay>();

  get(node: ListItemNode): NoteCheckedDisplay {
    const key = node.getKey();
    const cached = this.byKey.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let sawChecked = $getNoteChecked(node) === true;
    let sawUnchecked = !sawChecked;
    const nested = getNestedList(node);
    for (const child of nested ? getContentSiblings(nested) : []) {
      const childDisplay = this.get(child);
      if (childDisplay === 'mixed') {
        sawChecked = true;
        sawUnchecked = true;
        break;
      }
      if (childDisplay === 'checked') {
        sawChecked = true;
      } else {
        sawUnchecked = true;
      }
    }

    const display: NoteCheckedDisplay = sawChecked && sawUnchecked
      ? 'mixed'
      : sawChecked ? 'checked' : 'unchecked';
    this.byKey.set(key, display);
    return display;
  }
}
