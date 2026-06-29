import { $isDecoratorNode } from 'lexical';
import type { TextNode } from 'lexical';

// A trigger only opens at a boundary: the start of note text, after whitespace,
// after opening punctuation, or after an atomic inline token (a decorator node
// such as a date). See docs/outliner/triggers.md.

const OPENING_BOUNDARY_CHARS = new Set(['(', '[', '{']);
const WHITESPACE_PATTERN = /\s/u;

function isBoundaryCharacter(character: string): boolean {
  return WHITESPACE_PATTERN.test(character) || OPENING_BOUNDARY_CHARS.has(character);
}

// Whether what precedes the trigger across earlier siblings is a boundary. Walks
// back to the nearest non-empty sibling: a decorator node (atomic token) is a
// boundary; a text sibling is a boundary iff its last character is one. Nothing
// before (start of note text) is also a boundary.
function $isPreviousSiblingBoundary(node: TextNode): boolean {
  let previousSibling = node.getPreviousSibling();
  while (previousSibling) {
    if ($isDecoratorNode(previousSibling)) {
      return true;
    }
    const previousText = previousSibling.getTextContent();
    if (previousText.length > 0) {
      return isBoundaryCharacter(previousText.at(-1) ?? '');
    }
    previousSibling = previousSibling.getPreviousSibling();
  }

  return true;
}

// Whether the trigger character at `triggerOffset` in `triggerNode` sits at a
// boundary — the character immediately before it is a boundary character, an
// atomic decorator precedes it, or it is at the very start of note text.
// Inspects the already-inserted text, so it is independent of keystroke timing.
export function $isTriggerAtBoundary(triggerNode: TextNode, triggerOffset: number): boolean {
  if (triggerOffset > 0) {
    return isBoundaryCharacter(triggerNode.getTextContent()[triggerOffset - 1] ?? '');
  }

  return $isPreviousSiblingBoundary(triggerNode);
}
