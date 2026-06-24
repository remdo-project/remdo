import { describe, expect, it } from 'vitest';
import {
  collapseDomSelectionAtNode,
  extendDomSelectionToNode,
  getNoteBodyTextNode,
  getNoteTextNode,
  placeCaretAtNote,
  pressKey,
  typeText,
  meta,
} from '#tests';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getBodyWrapper } from '#client/editor/outline/list-structure';

// Selection contract for note bodies (docs/outliner/body.md "Selection and
// navigation"): a note's content and its body are two distinct regions. An
// inline selection lives within exactly one region — one note's content, or one
// body — never spanning the two. A selection spanning a note's content and its
// own body is structural, limited to that single note. Any selection crossing
// two notes — including with an endpoint inside a body — is structural over
// whole notes. A body is never a structural head on its own.
//
// jsdom does not move the caret on arrow keys, but Selection.extend works, so a
// Shift+Click is simulated by collapsing the caret then extending to the target.
// That is the same path the live pointer drives.

async function addBody(remdo: RemdoTestApi, noteId: string, text: string) {
  await placeCaretAtNote(remdo, noteId, Number.POSITIVE_INFINITY);
  await pressKey(remdo, { key: 'Enter', shift: true });
  await typeText(remdo, text);
}

describe('note body selection contract (docs/outliner/body.md)', () => {
  it('caret in a note, shift-click into its own body selects that whole note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBody(remdo, 'note1', 'bodyone');

    await collapseDomSelectionAtNode(getNoteTextNode(remdo, 'note1'), 0);
    await extendDomSelectionToNode(getNoteBodyTextNode(remdo, 'note1'), 3);

    // Content ↔ own body crosses a region boundary within one note → structural,
    // limited to that note (a note is never selected structurally without its body).
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1'] });

    // The structural range's visual tail reaches note1's body-wrapper, so the
    // highlight covers the body that a structural delete would also remove.
    const bodyWrapperKey = remdo.validate(() => getBodyWrapper($findNoteById('note1')!)!.getKey());
    expect(remdo.editor.selection.get()?.range?.visualEndKey).toBe(bodyWrapperKey);
  });

  it('caret in a note, shift-click into ANOTHER note body is structural over both notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBody(remdo, 'note2', 'bodytwo');

    await collapseDomSelectionAtNode(getNoteTextNode(remdo, 'note1'), 0);
    await extendDomSelectionToNode(getNoteBodyTextNode(remdo, 'note2'), 3);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  });

  it('caret in a body, shift-click back into its own note selects that whole note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBody(remdo, 'note1', 'bodyone');

    await collapseDomSelectionAtNode(getNoteBodyTextNode(remdo, 'note1'), 0);
    await extendDomSelectionToNode(getNoteTextNode(remdo, 'note1'), 2);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1'] });
  });

  it('caret in a body, shift-click within the same body stays inline', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBody(remdo, 'note1', 'bodyonelong');

    const body = getNoteBodyTextNode(remdo, 'note1');
    await collapseDomSelectionAtNode(body, 0);
    await extendDomSelectionToNode(body, 5);

    // Wholly within one body → inline; it never advances the ladder.
    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('extending a selection across lines within a multi-line body stays inline', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Build a 3-line body, then extend from the first line to the last line —
    // the path a Shift+ArrowDown takes between interior body lines. The whole
    // range is within one body, so it must stay inline (the body owns its
    // selection world), not advance the structural ladder.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'line one');
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'line two');
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'line three');

    const bodyElement = remdo.validate(() =>
      getBodyWrapper($findNoteById('note1')!)!.getKey()
    );
    const wrapperEl = remdo.editor.getElementByKey(bodyElement)!;
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(wrapperEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      textNodes.push(n as Text);
    }

    await collapseDomSelectionAtNode(textNodes[0]!, 0);
    await extendDomSelectionToNode(textNodes.at(-1)!, 4);

    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('caret in a body, shift-click into ANOTHER body is structural over both notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBody(remdo, 'note1', 'bodyone');
    await addBody(remdo, 'note2', 'bodytwo');

    await collapseDomSelectionAtNode(getNoteBodyTextNode(remdo, 'note1'), 0);
    await extendDomSelectionToNode(getNoteBodyTextNode(remdo, 'note2'), 3);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  });

  it('extending a pre-existing structural selection into a later note body keeps it structural and includes that note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBody(remdo, 'note3', 'bodythree');

    // Structural note1..note2 first, then shift-click into note3's body.
    await collapseDomSelectionAtNode(getNoteTextNode(remdo, 'note1'), 0);
    await extendDomSelectionToNode(getNoteTextNode(remdo, 'note2'), 2);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });

    await extendDomSelectionToNode(getNoteBodyTextNode(remdo, 'note3'), 3);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
  });

  it('extending across a note that has a body snaps to whole notes without the body becoming its own note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // note1 carries a body; selecting note1..note3 yields exactly the three notes
    // — the intervening body is never a fourth structural note.
    await addBody(remdo, 'note1', 'bodyone');

    await collapseDomSelectionAtNode(getNoteTextNode(remdo, 'note1'), 0);
    await extendDomSelectionToNode(getNoteTextNode(remdo, 'note3'), 2);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
  });
});
