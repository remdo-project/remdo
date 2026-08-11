import { $createAutoLinkNode, AutoLinkNode, LinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $addUpdateTag,
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
  HISTORY_MERGE_TAG,
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
// RemDo validates the opening boundary with its matcher and accepts an inline
// node boundary at the end. Letting Lexical apply its broader separator grammar
// would also unwrap deliberately suppressed links when neighboring text changes.
const LEXICAL_LINK_SEPARATOR = /[\s\S]/;

function unwrapLinkNode(node: LinkNode | AutoLinkNode) {
  const parent = node.getParentOrThrow();
  parent.splice(node.getIndexWithinParent(), 1, node.getChildren());
}

function $hasValidAutomaticLinkStart(node: AutoLinkNode): boolean {
  const previousNode = node.getPreviousSibling();
  if (!$isTextNode(previousNode)) {
    return true;
  }
  const previous = previousNode.getTextContent().at(-1) ?? '';
  const text = node.getTextContent();
  const match = automaticGenericLinkMatcher(`${previous}${text}`);
  return match?.index === previous.length && match.length === text.length;
}

function $suppressInvalidLink(node: LinkNode | AutoLinkNode) {
  const text = node.getTextContent();
  if (node instanceof AutoLinkNode) {
    if ($getAutomaticLinkUnlinkedText(node) !== text) {
      $setAutomaticLinkUnlinkedText(node, text);
    }
    if (!node.getIsUnlinked()) {
      node.setIsUnlinked(true);
    }
    return;
  }
  const replacement = $createAutoLinkNode(node.getURL(), {
    isUnlinked: true,
    rel: node.getRel(),
    target: node.getTarget(),
  });
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
    $suppressInvalidLink(node);
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
    if (prefix.length > 0 && [...prefix].every(char => GENERIC_LINK_SEPARATOR.test(char))) {
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
  return [anchor, focus].every((node) => {
    const link = node instanceof AutoLinkNode
      ? node
      : node.getParent() instanceof AutoLinkNode ? node.getParent() : null;
    return link instanceof AutoLinkNode && !link.getIsUnlinked();
  });
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
    let automaticUndoReady = false;
    let automaticUndoReadyTimer: ReturnType<typeof setTimeout> | null = null;
    let deferredTextNodeKey: null | string = null;
    let deferCurrentTextTransform = false;
    let preservedInvalidAutomaticLink: {
      attributes?: { rel?: string; target?: string };
      text: string;
      url: string;
    } | null = null;
    let pasteInProgress = false;
    let presentationQueued = false;
    const armAutomaticUndo = (node: AutoLinkNode) => {
      automaticUndoCandidate = {
        key: node.getKey(),
        text: node.getTextContent(),
        url: node.getURL(),
      };
      automaticUndoReady = false;
      if (automaticUndoReadyTimer) {
        clearTimeout(automaticUndoReadyTimer);
      }
      automaticUndoReadyTimer = setTimeout(() => {
        automaticUndoReady = true;
        automaticUndoReadyTimer = null;
      });
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
    const unregisterTextTransform = editor.registerNodeTransform(TextNode, (node) => {
      deferCurrentTextTransform = node.getKey() === deferredTextNodeKey;
      preservedInvalidAutomaticLink = null;
      const parent = node.getParent();
      if (parent instanceof AutoLinkNode) {
        $normalizeExternalLinkNode(parent);
        if (
          parent.isAttached()
          && parent.getIsUnlinked()
          && normalizeGenericDestination(parent.getURL()) === null
        ) {
          preservedInvalidAutomaticLink = {
            attributes: {
              rel: parent.getRel() ?? undefined,
              target: parent.getTarget() ?? undefined,
            },
            text: parent.getTextContent(),
            url: parent.getURL(),
          };
        }
      }
      const next = node.getNextSibling();
      if (next instanceof AutoLinkNode && !next.getIsUnlinked() && !$hasValidAutomaticLinkStart(next)) {
        unwrapLinkNode(next);
      }
    });
    const $updateTypedCandidateDeferral = (defer: boolean) => {
      if (!defer) {
        deferredTextNodeKey = null;
        return;
      }
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        deferredTextNodeKey = null;
        return;
      }
      const anchor = selection.anchor.getNode();
      deferredTextNodeKey = $isTextNode(anchor) && !(anchor.getParent() instanceof AutoLinkNode)
        ? anchor.getKey()
        : null;
    };

    queuePresentationSync();
    return [
      registerAutoLink(editor, {
        changeHandlers: [(url, previousUrl) => {
          if (url && previousUrl === null) {
            automaticCreationUrls.add(url);
            // The timer is retained in createdKeyCleanupTimers and cleared on effect teardown.
            // eslint-disable-next-line react/web-api-no-leaked-timeout
            const cleanup = setTimeout(() => {
              createdKeyCleanupTimers.delete(cleanup);
              automaticCreationUrls.delete(url);
            });
            createdKeyCleanupTimers.add(cleanup);
            const createdKey = createdAutomaticKeysByUrl.get(url)?.at(-1);
            const created = createdKey ? $getNodeByKey(createdKey) : null;
            const link = created instanceof AutoLinkNode && $selectionTouchesLink(created)
              ? created
              : $automaticLinkAtSelection(url);
            if (link) {
              armAutomaticUndo(link);
              automaticCreationUrls.delete(url);
              createdAutomaticKeysByUrl.delete(url);
            }
          }
        }],
        excludeParents: [],
        matchers: [(text) => {
          const preserved = preservedInvalidAutomaticLink;
          const match = preserved?.text === text
            ? {
                attributes: preserved.attributes,
                index: 0,
                length: text.length,
                text,
                url: preserved.url,
              }
            : automaticGenericLinkMatcher(text);
          return match && (
            $selectionIsInsideAutomaticLink()
            || automaticCreationUrls.has(match.url)
            || !deferCurrentTextTransform
          )
            ? match
            : null;
        }],
        separatorRegex: LEXICAL_LINK_SEPARATOR,
      }),
      editor.registerNodeTransform(LinkNode, $normalizeExternalLinkNode),
      editor.registerNodeTransform(AutoLinkNode, $normalizeExternalLinkNode),
      unregisterTextTransform,
      registerExternalLinkMutationListener(editor, LinkNode),
      registerExternalLinkMutationListener(editor, AutoLinkNode, (node) => {
        const url = node.getURL();
        const keys = createdAutomaticKeysByUrl.get(url) ?? [];
        keys.push(node.getKey());
        createdAutomaticKeysByUrl.set(url, keys);
        if (
          (automaticCreationUrls.has(url) || automaticUndoCandidate?.key === node.getKey())
          && $selectionTouchesLink(node)
        ) {
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
          $updateTypedCandidateDeferral(false);
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
          $updateTypedCandidateDeferral(!endsAtBoundary && !$selectionIsInsideAutomaticLink());
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
          $addUpdateTag(HISTORY_MERGE_TAG);
          node.setIsUnlinked(true);
          automaticUndoCandidate = null;
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (event.key === 'Enter') {
            $updateTypedCandidateDeferral(false);
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const anchor = selection.anchor.getNode();
              if ($isTextNode(anchor) && !(anchor.getParent() instanceof AutoLinkNode)) {
                anchor.markDirty();
              }
            }
          }
          if (
            event.key.length === 1
            && !event.isComposing
            && !event.altKey
            && !event.metaKey
            && !event.ctrlKey
          ) {
            $updateTypedCandidateDeferral(
              !TYPED_CANDIDATE_END.test(event.key) && !$selectionIsInsideAutomaticLink(),
            );
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
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        pasteInProgress = false;
        if (
          automaticUndoCandidate
          && automaticUndoReady
          && (dirtyElements.size > 0 || dirtyLeaves.size > 0)
        ) {
          automaticUndoCandidate = null;
          automaticUndoReady = false;
        }
      }),
      editor.registerUpdateListener(queuePresentationSync),
      editor.registerRootListener(queuePresentationSync),
      () => {
        if (automaticUndoReadyTimer) {
          clearTimeout(automaticUndoReadyTimer);
        }
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
