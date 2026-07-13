import type { MobileActionId } from './actions';

// The pinned group, in visual/DOM order (inner → outer edge): the LAST entry is
// the always-present anchor holding the group's fixed outer edge; earlier
// entries sit inward and may hide when disabled, so hiding them never moves the
// anchor (docs/outliner/mobile-toolbar.md "Layout"). DOM order matches visual
// order so keyboard/AT focus follows the row. Undo hides on empty history; Done
// anchors the edge.
export const PINNED_ACTION_IDS = ['undo', 'done'] as const satisfies readonly MobileActionId[];

// The scrolling group, left→right. Menu sits early so the "everything else"
// escape hatch is not stranded at the far scroll end.
export const SCROLL_ACTION_IDS = [
  'indent',
  'outdent',
  'menu',
  'moveUp',
  'moveDown',
  'fold',
  'delete',
  'redo',
] as const satisfies readonly MobileActionId[];

export interface LaidOutAction {
  id: MobileActionId;
  disabled: boolean;
}

export interface ToolbarLayout {
  scroll: LaidOutAction[];
  pinned: LaidOutAction[];
}

/**
 * Resolve what each toolbar group renders from the set of currently-disabled
 * action ids. A disabled scrolling action stays visible (rendered disabled) so
 * its availability is discoverable; a disabled pinned action is dropped from the
 * pinned group entirely (hidden), per the spec's Capability 5.
 */
export function resolveToolbarLayout(disabled: ReadonlySet<MobileActionId>): ToolbarLayout {
  return {
    scroll: SCROLL_ACTION_IDS.map((id) => ({ id, disabled: disabled.has(id) })),
    pinned: PINNED_ACTION_IDS.filter((id) => !disabled.has(id)).map((id) => ({ id, disabled: false })),
  };
}
