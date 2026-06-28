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

// Resolve (or re-resolve) the live session for the current caret. Re-infers from
// the anchor when the stored session's node or query no longer holds, so the
// session survives edits inside the query.
export function $resolveTriggerSession(
  triggerChar: string,
  anchorNode: TextNode,
  caretOffset: number,
  currentSession: TriggerSession | null
): ResolvedTriggerSession | null {
  let session = currentSession ?? inferSessionFromAnchor(triggerChar, anchorNode, caretOffset);
  if (!session) {
    return null;
  }

  let triggerNode = $getNodeByKey<TextNode>(session.textNodeKey);
  if (!$isTextNode(triggerNode)) {
    const inferred = inferSessionFromAnchor(triggerChar, anchorNode, caretOffset);
    if (!inferred) {
      return null;
    }
    session = inferred;
    triggerNode = $getNodeByKey<TextNode>(session.textNodeKey);
    if (!$isTextNode(triggerNode)) {
      return null;
    }
  }

  let query = readQueryAcrossTextNodes(triggerChar, triggerNode, session.triggerOffset, anchorNode, caretOffset);
  if (query === null) {
    const inferred = inferSessionFromAnchor(triggerChar, anchorNode, caretOffset);
    if (!inferred) {
      return null;
    }
    const inferredTriggerNode = $getNodeByKey<TextNode>(inferred.textNodeKey);
    if (!$isTextNode(inferredTriggerNode)) {
      return null;
    }
    const inferredQuery = readQueryAcrossTextNodes(
      triggerChar,
      inferredTriggerNode,
      inferred.triggerOffset,
      anchorNode,
      caretOffset
    );
    if (inferredQuery === null) {
      return null;
    }
    session = inferred;
    triggerNode = inferredTriggerNode;
    query = inferredQuery;
  }

  return { session, triggerNode, query };
}
