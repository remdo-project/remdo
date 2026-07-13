import { describe, it, expect } from 'vitest';

import {
  PINNED_ACTION_IDS,
  SCROLL_ACTION_IDS,
  resolveToolbarLayout,
} from '#client/editor/plugins/mobile-toolbar/toolbar-layout';

// The mobile toolbar splits its actions into a pinned group (always-reachable
// primaries) and a scrolling group (docs/outliner/mobile-toolbar.md "Layout").
// resolveToolbarLayout turns per-action disabled state into what each group
// renders, encoding the spec's Capability 5: a disabled scrolling action stays
// visible (greyed); a disabled pinned action is hidden.
describe('mobile toolbar layout', () => {
  it('anchors Done at the pinned outer edge and partitions actions with no overlap', () => {
    // Anchor contract: the pinned group is emitted inner→outer, so the last
    // entry (Done) holds the fixed outer edge.
    expect(PINNED_ACTION_IDS.at(-1)).toBe('done');
    expect(PINNED_ACTION_IDS).toContain('undo');
    // Each action appears in exactly one group (spec: exactly one place).
    for (const id of PINNED_ACTION_IDS) {
      expect(SCROLL_ACTION_IDS).not.toContain(id);
    }
    // Every other action is present in the scroll group, so none is dropped.
    for (const id of ['indent', 'outdent', 'moveUp', 'moveDown', 'fold', 'delete', 'redo', 'menu'] as const) {
      expect(SCROLL_ACTION_IDS).toContain(id);
    }
  });

  it('keeps a disabled scrolling action visible but greyed', () => {
    const layout = resolveToolbarLayout(new Set(['fold']));
    const fold = layout.scroll.find((a) => a.id === 'fold');
    expect(fold).toEqual({ id: 'fold', disabled: true });
  });

  it('hides a disabled pinned action, keeps the rest of the pinned group', () => {
    const layout = resolveToolbarLayout(new Set(['undo']));
    // Undo (disabled, pinned) is dropped from the pinned group entirely.
    expect(layout.pinned.map((a) => a.id)).toEqual(['done']);
  });

  it('renders every pinned action when none are disabled, Done last (outer edge)', () => {
    const layout = resolveToolbarLayout(new Set());
    expect(layout.pinned.map((a) => a.id)).toEqual(['undo', 'done']);
    expect(layout.pinned.every((a) => !a.disabled)).toBe(true);
  });

  it('marks a disabled scrolling action disabled and leaves enabled ones enabled', () => {
    const layout = resolveToolbarLayout(new Set(['delete']));
    const del = layout.scroll.find((a) => a.id === 'delete');
    const indent = layout.scroll.find((a) => a.id === 'indent');
    expect(del?.disabled).toBe(true);
    expect(indent?.disabled).toBe(false);
  });
});
