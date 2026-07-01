import { $getNodeByKey, $isTextNode } from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';

import type { TriggerSession } from './types';

interface ResolvedTriggerSession {
  session: TriggerSession;
  triggerNode: TextNode;
  query: string;
}

// Read the query text from just after the trigger character up to the caret,
// walking across sibling text nodes if the query spans formatting boundaries.
function readQueryAcrossTextNodes(
  triggerChar: string,
  triggerNode: TextNode,
  triggerOffset: number,
  anchorNode: TextNode,
  anchorOffset: number
): string | null {
  const triggerText = triggerNode.getTextContent();
  if (triggerOffset < 0 || triggerOffset >= triggerText.length || triggerText[triggerOffset] !== triggerChar) {
    return null;
  }

  if (triggerNode === anchorNode) {
    if (anchorOffset < triggerOffset + 1) {
      return null;
    }
    return triggerText.slice(triggerOffset + 1, anchorOffset);
  }

  if (!triggerNode.isBefore(anchorNode)) {
    return null;
  }

  let current: TextNode = triggerNode;
  let text = triggerText.slice(triggerOffset + 1);

  while (current.getKey() !== anchorNode.getKey()) {
    const next = current.getNextSibling();
    if (!next || !$isTextNode(next)) {
      return null;
    }
    current = next;
    if (current.getKey() === anchorNode.getKey()) {
      text += current.getTextContent().slice(0, anchorOffset);
      return text;
    }
    text += current.getTextContent();
  }

  return null;
}

// Locate the nearest trigger character at or before the caret, scanning back
// across sibling text nodes.
function inferSessionFromAnchor(
  triggerChar: string,
  anchorNode: TextNode,
  caretOffset: number
): TriggerSession | null {
  let current: TextNode | null = anchorNode;
  while (current) {
    const text = current.getTextContent();
    const startOffset =
      current.getKey() === anchorNode.getKey()
        ? Math.min(caretOffset - 1, text.length - 1)
        : text.length - 1;
    for (let index = startOffset; index >= 0; index -= 1) {
      if (text[index] === triggerChar) {
        return { textNodeKey: current.getKey(), triggerOffset: index };
      }
    }
    const previousSiblingNode: LexicalNode | null = current.getPreviousSibling();
    current = $isTextNode(previousSiblingNode) ? previousSiblingNode : null;
  }

  return null;
}

// Open a fresh session: scan back from the caret to the nearest trigger and read
// its query. This is the only path that locates a trigger by scanning; it runs
// only when a trigger was just typed, and the caller gates it on a boundary.
export function $openTriggerSession(
  triggerChar: string,
  anchorNode: TextNode,
  caretOffset: number
): ResolvedTriggerSession | null {
  const session = inferSessionFromAnchor(triggerChar, anchorNode, caretOffset);
  if (!session) {
    return null;
  }
  const triggerNode = $getNodeByKey<TextNode>(session.textNodeKey);
  if (!$isTextNode(triggerNode)) {
    return null;
  }
  const query = readQueryAcrossTextNodes(triggerChar, triggerNode, session.triggerOffset, anchorNode, caretOffset);
  if (query === null) {
    return null;
  }
  return { session, triggerNode, query };
}

// Re-resolve an OPEN session pinned to its origin span. The query is read only
// from the exact pinned trigger; if it reads null the caret has left the span
// (moved before the trigger or into its middle), so the session closes. It never
// scans back to a different trigger — if the pinned node is gone (its key was
// rotated by a text-node split/merge), the session closes rather than risk
// re-homing onto an earlier trigger. (Re-homing onto the same logical trigger
// after a key rotation is a possible future refinement, but only with a
// same-position guard; scanning to the nearest trigger is not safe here.)
export function $resolvePinnedSession(
  triggerChar: string,
  anchorNode: TextNode,
  caretOffset: number,
  session: TriggerSession
): ResolvedTriggerSession | null {
  const pinnedNode = $getNodeByKey<TextNode>(session.textNodeKey);
  if (!$isTextNode(pinnedNode)) {
    return null;
  }
  const query = readQueryAcrossTextNodes(triggerChar, pinnedNode, session.triggerOffset, anchorNode, caretOffset);
  return query === null ? null : { session, triggerNode: pinnedNode, query };
}
