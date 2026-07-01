import type { LexicalEditor } from 'lexical';
import { describe, expect, it } from 'vitest';

import { isAnyPopupActive, isOtherPopupActive, setPopupActive } from './active-popup';

// The single-open registry (docs/outliner/popups.md): at most one editor popup
// open per editor. Pure module-level logic — no editor state needed, so a stub
// editor identity is enough.
// Stub editor identities — the registry only uses them as WeakMap keys.
const editorA: LexicalEditor = Object.create(null);
const editorB: LexicalEditor = Object.create(null);

describe('active-popup registry', () => {
  it('reports another popup active only when a different token is open', () => {
    const link = Symbol('link');
    const menu = Symbol('menu');

    expect(isOtherPopupActive(editorA, menu)).toBe(false);
    setPopupActive(editorA, link, true);
    // The menu sees the open link picker; the link picker does not see itself.
    expect(isOtherPopupActive(editorA, menu)).toBe(true);
    expect(isOtherPopupActive(editorA, link)).toBe(false);

    setPopupActive(editorA, link, false);
    expect(isOtherPopupActive(editorA, menu)).toBe(false);
  });

  it('is scoped per editor', () => {
    const token = Symbol('picker');
    setPopupActive(editorB, token, true);
    expect(isAnyPopupActive(editorB)).toBe(true);
    // A different editor is unaffected.
    expect(isAnyPopupActive(editorA)).toBe(false);
    setPopupActive(editorB, token, false);
    expect(isAnyPopupActive(editorB)).toBe(false);
  });
});
