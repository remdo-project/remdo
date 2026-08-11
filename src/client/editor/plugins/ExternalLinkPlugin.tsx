import { AutoLinkNode, LinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import {
  automaticGenericLinkMatcher,
  GENERIC_LINK_SEPARATOR,
  normalizeGenericDestination,
  WEB_LINK_ATTRIBUTES,
} from '#client/editor/links/generic-link';
import { $isNoteLinkNode } from '#client/editor/runtime/note-link-node';

function unwrapLinkNode(node: LinkNode | AutoLinkNode) {
  const parent = node.getParentOrThrow();
  parent.splice(node.getIndexWithinParent(), 1, node.getChildren());
}

function normalizeExternalLinkNode(node: LinkNode | AutoLinkNode) {
  if ($isNoteLinkNode(node)) {
    return;
  }
  const destination = normalizeGenericDestination(node.getURL());
  if (!destination) {
    unwrapLinkNode(node);
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
  unlinkedTextByKey: Map<string, string>,
  onAutomaticLinkCreated?: (node: AutoLinkNode) => void,
) {
  return editor.registerMutationListener(klass, (mutations) => {
    for (const [key, mutation] of mutations) {
      if (mutation === 'destroyed') {
        unlinkedTextByKey.delete(key);
      }
    }
    const keys = [...mutations].flatMap(([key, mutation]) => (mutation === 'destroyed' ? [] : [key]));
    if (keys.length === 0) {
      return;
    }
    queueMicrotask(() => {
      editor.update(() => {
        for (const key of keys) {
          const node = $getNodeByKey(key);
          if (node instanceof LinkNode || node instanceof AutoLinkNode) {
            normalizeExternalLinkNode(node);
            if (node instanceof AutoLinkNode) {
              if (mutations.get(key) === 'created' && !node.getIsUnlinked()) {
                onAutomaticLinkCreated?.(node);
              }
              const text = node.getTextContent();
              const previousText = unlinkedTextByKey.get(key);
              if (!node.getIsUnlinked()) {
                unlinkedTextByKey.delete(key);
              } else if (previousText === undefined) {
                unlinkedTextByKey.set(key, text);
              } else if (previousText !== text) {
                node.setIsUnlinked(false);
                unlinkedTextByKey.delete(key);
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
  if (selection.anchor.type !== 'element' || !$isElementNode(anchorNode)) {
    return false;
  }
  return anchorNode.getChildAtIndex(selection.anchor.offset - 1)?.is(link) ?? false;
}

function syncExternalLinkPresentation(root: HTMLElement | null) {
  if (!root) {
    return;
  }
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a.text-link')) {
    if (anchor.target === '_blank') {
      anchor.dataset.externalLinkNewTab = 'true';
      anchor.setAttribute('aria-label', `${anchor.textContent} (opens in new tab)`);
    } else if (anchor.dataset.externalLinkNewTab === 'true') {
      delete anchor.dataset.externalLinkNewTab;
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
    const unlinkedTextByKey = new Map<string, string>();
    let automaticUndoCandidate: { key: string; text: string; url: string } | null = null;
    let presentationQueued = false;
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
        changeHandlers: [],
        excludeParents: [],
        matchers: [automaticGenericLinkMatcher],
        separatorRegex: GENERIC_LINK_SEPARATOR,
      }),
      editor.registerNodeTransform(LinkNode, normalizeExternalLinkNode),
      editor.registerNodeTransform(AutoLinkNode, normalizeExternalLinkNode),
      registerExternalLinkMutationListener(editor, LinkNode, unlinkedTextByKey),
      registerExternalLinkMutationListener(editor, AutoLinkNode, unlinkedTextByKey, (node) => {
        automaticUndoCandidate = {
          key: node.getKey(),
          text: node.getTextContent(),
          url: node.getURL(),
        };
      }),
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
            || !$selectionTouchesLink(node)
          ) {
            automaticUndoCandidate = null;
            return false;
          }
          node.setIsUnlinked(true);
          automaticUndoCandidate = null;
          return true;
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
      editor.registerUpdateListener(queuePresentationSync),
      editor.registerRootListener(queuePresentationSync),
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
