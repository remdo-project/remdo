import { AutoLinkNode, LinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LinkMatcher } from '@lexical/link';
import LinkifyIt from 'linkify-it';
import { $getNodeByKey } from 'lexical';
import { useEffect } from 'react';
import tlds from 'tlds';

import { $isNoteLinkNode } from '#lib/editor/note-link-node';

const EXTERNAL_LINK_ATTRIBUTES = {
  rel: 'noopener noreferrer',
  target: '_blank',
} as const;

const linkify = new LinkifyIt()
  .tlds(tlds)
  .set({ fuzzyEmail: false, fuzzyIP: false, fuzzyLink: true });

interface MatchResult {
  attributes: typeof EXTERNAL_LINK_ATTRIBUTES;
  index: number;
  length: number;
  text: string;
  url: string;
}

interface ExternalLinkifyMatch {
  index: number;
  lastIndex: number;
  raw: string;
  schema: string;
  url: string;
}

function isSupportedExternalMatch(match: ExternalLinkifyMatch) {
  return match.schema === 'http:' || match.schema === 'https:' || match.schema === '//' || /^www\./i.test(match.raw);
}

function normalizeExternalUrl(url: string): string | null {
  if (/^www\./i.test(url)) {
    return `https://${url}`;
  }
  if (url.startsWith('//')) {
    return url;
  }
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const externalUrlMatcher: LinkMatcher = (text): MatchResult | null => {
  if (!linkify.pretest(text)) {
    return null;
  }

  const match = linkify.match(text)?.find(isSupportedExternalMatch);
  if (!match) {
    return null;
  }

  const url = match.schema ? match.url : `https://${match.raw}`;

  return {
    attributes: EXTERNAL_LINK_ATTRIBUTES,
    index: match.index,
    length: match.lastIndex - match.index,
    text: match.raw,
    url,
  };
};

const MATCHERS = [externalUrlMatcher];

function unwrapLinkNode(node: LinkNode | AutoLinkNode) {
  const parent = node.getParentOrThrow();
  parent.splice(node.getIndexWithinParent(), 1, node.getChildren());
}

function normalizeExternalLinkNode(node: LinkNode | AutoLinkNode) {
  if ($isNoteLinkNode(node)) {
    return;
  }
  const normalizedUrl = normalizeExternalUrl(node.getURL());
  if (!normalizedUrl) {
    unwrapLinkNode(node);
    return;
  }
  if (
    node.getURL() === normalizedUrl
    && node.getTarget() === EXTERNAL_LINK_ATTRIBUTES.target
    && node.getRel() === EXTERNAL_LINK_ATTRIBUTES.rel
  ) {
    return;
  }
  node
    .setURL(normalizedUrl)
    .setTarget(EXTERNAL_LINK_ATTRIBUTES.target)
    .setRel(EXTERNAL_LINK_ATTRIBUTES.rel);
}

function registerExternalLinkMutationListener(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  klass: typeof LinkNode | typeof AutoLinkNode,
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
            normalizeExternalLinkNode(node);
          }
        }
      });
    });
  });
}

export function ExternalLinkPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([AutoLinkNode])) {
      throw new Error('ExternalLinkPlugin: AutoLinkNode not registered on editor');
    }
    return [
      registerAutoLink(editor, { changeHandlers: [], excludeParents: [], matchers: MATCHERS }),
      editor.registerNodeTransform(LinkNode, normalizeExternalLinkNode),
      editor.registerNodeTransform(AutoLinkNode, normalizeExternalLinkNode),
      registerExternalLinkMutationListener(editor, LinkNode),
      registerExternalLinkMutationListener(editor, AutoLinkNode),
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
