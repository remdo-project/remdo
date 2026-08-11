import { $createAutoLinkNode, AutoLinkNode, LinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  TextNode,
  UNDO_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import {
  automaticGenericLinkMatcher,
  GENERIC_LINK_SEPARATOR,
  normalizeGenericDestination,
  recognizeCompleteAutomaticLink,
  WEB_LINK_ATTRIBUTES,
} from '#client/editor/links/generic-link';
import { $isNoteLinkNode } from '#client/editor/runtime/note-link-node';
import {
  $getAutomaticLinkUnlinkedText,
  $setAutomaticLinkUnlinkedText,
} from '#client/editor/runtime/automatic-link-state';

const TYPED_CANDIDATE_END = /[\s<>"“”‘’]/;
const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift']);

function unwrapLinkNode(node: LinkNode | AutoLinkNode) {
  const parent = node.getParentOrThrow();
  parent.splice(node.getIndexWithinParent(), 1, node.getChildren());
}

function $suppressRecognizableLinkText(node: LinkNode | AutoLinkNode) {
  const text = node.getTextContent();
  const destination = recognizeCompleteAutomaticLink(text);
  if (!destination) {
    unwrapLinkNode(node);
    return;
  }
  const target = destination.kind === 'web' ? WEB_LINK_ATTRIBUTES.target : null;
  const rel = destination.kind === 'web' ? WEB_LINK_ATTRIBUTES.rel : null;
  if (node instanceof AutoLinkNode) {
    node.setURL(destination.url).setTarget(target).setRel(rel);
    $setAutomaticLinkUnlinkedText(node, text);
    node.setIsUnlinked(true);
    return;
  }
  const replacement = $createAutoLinkNode(destination.url, { isUnlinked: true, rel, target });
  replacement.append(...node.getChildren());
  $setAutomaticLinkUnlinkedText(replacement, text);
  node.replace(replacement);
}

function $syncAutomaticLinkSuppression(node: AutoLinkNode): boolean {
  const baseline = $getAutomaticLinkUnlinkedText(node);
  if (!node.getIsUnlinked()) {
    if (baseline !== null) {
      $setAutomaticLinkUnlinkedText(node, null);
    }
    return true;
  }
  const text = node.getTextContent();
  if (baseline === null) {
    $setAutomaticLinkUnlinkedText(node, text);
  } else if (baseline !== text) {
    const destination = recognizeCompleteAutomaticLink(text);
    if (!destination) {
      unwrapLinkNode(node);
      return false;
    }
    node.setURL(destination.url);
    node.setTarget(destination.kind === 'web' ? WEB_LINK_ATTRIBUTES.target : null);
    node.setRel(destination.kind === 'web' ? WEB_LINK_ATTRIBUTES.rel : null);
    node.setIsUnlinked(false);
    $setAutomaticLinkUnlinkedText(node, null);
  }
  return true;
}

function $normalizeExternalLinkNode(node: LinkNode | AutoLinkNode) {
  if ($isNoteLinkNode(node)) {
    return;
  }
  if (node instanceof AutoLinkNode && !$syncAutomaticLinkSuppression(node)) {
    return;
  }
  const destination = normalizeGenericDestination(node.getURL());
  if (!destination) {
    $suppressRecognizableLinkText(node);
    return;
  }
  const target = destination.kind === 'web' ? WEB_LINK_ATTRIBUTES.target : null;
  const rel = destination.kind === 'web' ? WEB_LINK_ATTRIBUTES.rel : null;
  if (
    node.getURL() === destination.url
    && node.getTarget() === target
    && node.getRel() === rel
  ) {
    return;
  }
  node
    .setURL(destination.url)
    .setTarget(target)
    .setRel(rel);
}

function registerExternalLinkMutationListener(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  klass: typeof LinkNode | typeof AutoLinkNode,
  onAutomaticLinkCreated?: (node: AutoLinkNode) => void,
) {
  return editor.registerMutationListener(klass, (mutations) => {
    const keys = [...mutations].flatMap(([key, mutation]) => (mutation === 'destroyed' ? [] : [key]));
    if (keys.length === 0) {
      return;
    }
    queueMicrotask(() => {
      editor.update(() => {
        for (const key of keys) {
          const node = $getNodeByKey(key);
          if (node instanceof LinkNode || node instanceof AutoLinkNode) {
            $normalizeExternalLinkNode(node);
            if (node instanceof AutoLinkNode) {
              if (mutations.get(key) === 'created' && !node.getIsUnlinked()) {
                onAutomaticLinkCreated?.(node);
              }
            }
          }
        }
      });
    });
  });
}

function $selectionTouchesLink(link: AutoLinkNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const anchorNode = selection.anchor.getNode();
  if (link.is(anchorNode) || link.isParentOf(anchorNode)) {
    return true;
  }
  if ($isTextNode(anchorNode) && anchorNode.getPreviousSibling()?.is(link)) {
    const prefix = anchorNode.getTextContent().slice(0, selection.anchor.offset);
    if (prefix.length > 0 && [...prefix].every(char => TYPED_CANDIDATE_END.test(char))) {
      return true;
    }
  }
  if (selection.anchor.type !== 'element' || !$isElementNode(anchorNode)) {
    return false;
  }
  return anchorNode.getChildAtIndex(selection.anchor.offset - 1)?.is(link) ?? false;
}

function $selectionIsInsideAutomaticLink(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }
  const anchor = selection.anchor.getNode();
  const focus = selection.focus.getNode();
  return [anchor, focus].every((node) => (
    node instanceof AutoLinkNode || node.getParent() instanceof AutoLinkNode
  ));
}

function $automaticLinkAtSelection(url: string): AutoLinkNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }
  const anchor = selection.anchor.getNode();
  const ancestor = anchor instanceof AutoLinkNode
    ? anchor
    : anchor.getParent() instanceof AutoLinkNode ? anchor.getParent() : null;
  if (ancestor instanceof AutoLinkNode && ancestor.getURL() === url) {
    return ancestor;
  }
  const previous = selection.anchor.type === 'element' && $isElementNode(anchor)
    ? anchor.getChildAtIndex(selection.anchor.offset - 1)
    : anchor.getPreviousSibling();
  return previous instanceof AutoLinkNode && previous.getURL() === url ? previous : null;
}

function syncExternalLinkPresentation(root: HTMLElement | null) {
  if (!root) {
    return;
  }
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a.text-link')) {
    if (anchor.target === '_blank') {
      anchor.setAttribute('aria-label', `${anchor.textContent} (opens in new tab)`);
    } else {
      anchor.removeAttribute('aria-label');
    }
  }
}

export function ExternalLinkPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([AutoLinkNode])) {
      throw new Error('ExternalLinkPlugin: AutoLinkNode not registered on editor');
    }
    const automaticCreationUrls = new Set<string>();
    const createdAutomaticKeysByUrl = new Map<string, string[]>();
    const createdKeyCleanupTimers = new Set<ReturnType<typeof setTimeout>>();
    let automaticUndoCandidate: { key: string; text: string; url: string } | null = null;
    let deferCompleteTypedCandidate = false;
    let pasteInProgress = false;
    let presentationQueued = false;
    const armAutomaticUndo = (node: AutoLinkNode) => {
      automaticUndoCandidate = {
        key: node.getKey(),
        text: node.getTextContent(),
        url: node.getURL(),
      };
    };
    const queuePresentationSync = () => {
      if (presentationQueued) {
        return;
      }
      presentationQueued = true;
      queueMicrotask(() => {
        presentationQueued = false;
        syncExternalLinkPresentation(editor.getRootElement());
      });
    };

    queuePresentationSync();
    return [
      registerAutoLink(editor, {
        changeHandlers: [(url, previousUrl) => {
          if (url && previousUrl === null) {
            automaticCreationUrls.add(url);
            const createdKey = createdAutomaticKeysByUrl.get(url)?.at(-1);
            const created = createdKey ? $getNodeByKey(createdKey) : null;
            const link = created instanceof AutoLinkNode ? created : $automaticLinkAtSelection(url);
            if (link) {
              armAutomaticUndo(link);
              automaticCreationUrls.delete(url);
              createdAutomaticKeysByUrl.delete(url);
            }
          }
        }],
        excludeParents: [],
        matchers: [(text) => {
          const match = automaticGenericLinkMatcher(text);
          return match && (
            $selectionIsInsideAutomaticLink()
            || automaticCreationUrls.has(match.url)
            || !deferCompleteTypedCandidate
          )
            ? match
            : null;
        }],
        separatorRegex: GENERIC_LINK_SEPARATOR,
      }),
      editor.registerNodeTransform(LinkNode, $normalizeExternalLinkNode),
      editor.registerNodeTransform(AutoLinkNode, $normalizeExternalLinkNode),
      editor.registerNodeTransform(TextNode, (node) => {
        const parent = node.getParent();
        if (parent instanceof AutoLinkNode) {
          $syncAutomaticLinkSuppression(parent);
        }
      }),
      registerExternalLinkMutationListener(editor, LinkNode),
      registerExternalLinkMutationListener(editor, AutoLinkNode, (node) => {
        const url = node.getURL();
        const keys = createdAutomaticKeysByUrl.get(url) ?? [];
        keys.push(node.getKey());
        createdAutomaticKeysByUrl.set(url, keys);
        if (automaticCreationUrls.has(url) || automaticUndoCandidate?.key === node.getKey()) {
          armAutomaticUndo(node);
          automaticCreationUrls.delete(url);
          createdAutomaticKeysByUrl.delete(url);
          return;
        }
        const timeout = setTimeout(() => {
          createdKeyCleanupTimers.delete(timeout);
          const currentKeys = createdAutomaticKeysByUrl.get(url);
          if (!currentKeys) {
            return;
          }
          const remaining = currentKeys.filter(key => key !== node.getKey());
          if (remaining.length === 0) {
            createdAutomaticKeysByUrl.delete(url);
          } else {
            createdAutomaticKeysByUrl.set(url, remaining);
          }
        });
        createdKeyCleanupTimers.add(timeout);
      }),
      editor.registerCommand(
        PASTE_COMMAND,
        () => {
          pasteInProgress = true;
          deferCompleteTypedCandidate = false;
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        (insertion) => {
          if (pasteInProgress || typeof insertion !== 'string' || insertion.length === 0) {
            return false;
          }
          const endsAtBoundary = TYPED_CANDIDATE_END.test(insertion.at(-1)!);
          deferCompleteTypedCandidate = !endsAtBoundary && !$selectionIsInsideAutomaticLink();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        UNDO_COMMAND,
        () => {
          const candidate = automaticUndoCandidate;
          if (!candidate) {
            return false;
          }
          const node = $getNodeByKey(candidate.key);
          if (
            !(node instanceof AutoLinkNode)
            || node.getIsUnlinked()
            || node.getTextContent() !== candidate.text
            || node.getURL() !== candidate.url
          ) {
            automaticUndoCandidate = null;
            return false;
          }
          $setAutomaticLinkUnlinkedText(node, node.getTextContent());
          node.setIsUnlinked(true);
          automaticUndoCandidate = null;
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            event.key.length === 1
            && !event.isComposing
            && !event.altKey
            && !event.metaKey
            && !event.ctrlKey
          ) {
            deferCompleteTypedCandidate = !TYPED_CANDIDATE_END.test(event.key)
              && !$selectionIsInsideAutomaticLink();
          }
          if (
            automaticUndoCandidate
            && !MODIFIER_KEYS.has(event.key)
            && !(event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey))
          ) {
            automaticUndoCandidate = null;
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const candidate = automaticUndoCandidate;
          if (candidate) {
            const node = $getNodeByKey(candidate.key);
            if (!(node instanceof AutoLinkNode) || !$selectionTouchesLink(node)) {
              automaticUndoCandidate = null;
            }
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerUpdateListener(() => {
        pasteInProgress = false;
      }),
      editor.registerUpdateListener(queuePresentationSync),
      editor.registerRootListener(queuePresentationSync),
      () => {
        for (const timeout of createdKeyCleanupTimers) {
          clearTimeout(timeout);
        }
      },
    ].reduceRight<() => void>(
      (cleanup, unregister) => () => {
        unregister();
        cleanup();
      },
      () => {},
    );
  }, [editor]);

  return null;
}
