import { $getNodeByKey, $isTextNode } from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';

import type { LinkQuerySession } from './types';

interface ResolvedLinkQuerySession {
  session: LinkQuerySession;
  triggerNode: TextNode;
  query: string;
}

function readQueryAcrossTextNodes(
  triggerNode: TextNode,
  triggerOffset: number,
  anchorNode: TextNode,
  anchorOffset: number
): string | null {
  const triggerText = triggerNode.getTextContent();
  if (triggerOffset < 0 || triggerOffset >= triggerText.length || triggerText[triggerOffset] !== '@') {
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

function inferSessionFromAnchor(anchorNode: TextNode, caretOffset: number): LinkQuerySession | null {
  let current: TextNode | null = anchorNode;
  while (current) {
    const text = current.getTextContent();
    const startOffset =
      current.getKey() === anchorNode.getKey()
        ? Math.min(caretOffset - 1, text.length - 1)
        : text.length - 1;
    for (let index = startOffset; index >= 0; index -= 1) {
      if (text[index] === '@') {
        return { textNodeKey: current.getKey(), triggerOffset: index };
      }
    }
    const previousSiblingNode: LexicalNode | null = current.getPreviousSibling();
    current = $isTextNode(previousSiblingNode) ? previousSiblingNode : null;
  }

  return null;
}

export function $resolveLinkQuerySession(
  anchorNode: TextNode,
  caretOffset: number,
  currentSession: LinkQuerySession | null
): ResolvedLinkQuerySession | null {
  let session = currentSession ?? inferSessionFromAnchor(anchorNode, caretOffset);
  if (!session) {
    return null;
  }

  let triggerNode = $getNodeByKey<TextNode>(session.textNodeKey);
  if (!$isTextNode(triggerNode)) {
    const inferred = inferSessionFromAnchor(anchorNode, caretOffset);
    if (!inferred) {
      return null;
    }
    session = inferred;
    triggerNode = $getNodeByKey<TextNode>(session.textNodeKey);
    if (!$isTextNode(triggerNode)) {
      return null;
    }
  }

  let query = readQueryAcrossTextNodes(triggerNode, session.triggerOffset, anchorNode, caretOffset);
  if (query === null) {
    const inferred = inferSessionFromAnchor(anchorNode, caretOffset);
    if (!inferred) {
      return null;
    }
    const inferredTriggerNode = $getNodeByKey<TextNode>(inferred.textNodeKey);
    if (!$isTextNode(inferredTriggerNode)) {
      return null;
    }
    const inferredQuery = readQueryAcrossTextNodes(
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
