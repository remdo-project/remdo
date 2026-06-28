import type { TextNode } from 'lexical';

// A trigger only opens at a boundary: the start of note text, after whitespace,
// or after opening punctuation. See docs/outliner/triggers.md.

const OPENING_BOUNDARY_CHARS = new Set(['(', '[', '{']);
const WHITESPACE_PATTERN = /\s/u;

function isBoundaryCharacter(character: string): boolean {
  return WHITESPACE_PATTERN.test(character) || OPENING_BOUNDARY_CHARS.has(character);
}

function $getPreviousTextCharacter(node: TextNode): string | null {
  let previousSibling = node.getPreviousSibling();
  while (previousSibling) {
    const previousText = previousSibling.getTextContent();
    if (previousText.length > 0) {
      return previousText.at(-1) ?? null;
    }
    previousSibling = previousSibling.getPreviousSibling();
  }

  return null;
}

// Whether the trigger character at `triggerOffset` in `triggerNode` sits at a
// boundary — i.e. the character immediately before it is a boundary character,
// or it is at the very start of note text. Inspects the already-inserted text,
// so it is independent of keystroke timing.
export function $isTriggerAtBoundary(triggerNode: TextNode, triggerOffset: number): boolean {
  if (triggerOffset > 0) {
    return isBoundaryCharacter(triggerNode.getTextContent()[triggerOffset - 1] ?? '');
  }

  const previousCharacter = $getPreviousTextCharacter(triggerNode);
  return previousCharacter === null || isBoundaryCharacter(previousCharacter);
}
