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
// its query. Used only when a trigger was just typed; this is the only path that
// may locate a trigger by scanning, and the caller gates it on a boundary.
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

// Re-resolve an OPEN session pinned to its origin span, without ever retargeting
// onto a different trigger:
//
// - While the pinned node still exists, the query is read only from that exact
//   pinned trigger. If it reads null the caret has left the span (e.g. moved
//   before the trigger or into its middle), so the session closes — it does not
//   scan back to an earlier trigger.
// - Only if the pinned node is gone (a text-node split/merge changed its key
//   while typing) is the trigger re-inferred, and even then it is accepted only
//   when the re-inferred trigger sits at the same document position as the
//   pinned one (same forward query), never an earlier trigger.
export function $resolvePinnedSession(
  triggerChar: string,
  anchorNode: TextNode,
  caretOffset: number,
  session: TriggerSession
): ResolvedTriggerSession | null {
  const pinnedNode = $getNodeByKey<TextNode>(session.textNodeKey);
  if ($isTextNode(pinnedNode)) {
    const query = readQueryAcrossTextNodes(triggerChar, pinnedNode, session.triggerOffset, anchorNode, caretOffset);
    return query === null ? null : { session, triggerNode: pinnedNode, query };
  }

  // Pinned node is gone: recover the same trigger from the current text.
  const inferred = inferSessionFromAnchor(triggerChar, anchorNode, caretOffset);
  if (!inferred) {
    return null;
  }
  const inferredNode = $getNodeByKey<TextNode>(inferred.textNodeKey);
  if (!$isTextNode(inferredNode)) {
    return null;
  }
  const query = readQueryAcrossTextNodes(triggerChar, inferredNode, inferred.triggerOffset, anchorNode, caretOffset);
  if (query === null) {
    return null;
  }
  return { session: inferred, triggerNode: inferredNode, query };
}
