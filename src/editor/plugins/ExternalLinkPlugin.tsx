import { AutoLinkNode, LinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LinkMatcher } from '@lexical/link';
import LinkifyIt from 'linkify-it';
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
  return match.schema === 'http:' || match.schema === 'https:' || /^www\./i.test(match.raw);
}

function isAbsoluteWebUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
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

export function ExternalLinkPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([AutoLinkNode])) {
      throw new Error('ExternalLinkPlugin: AutoLinkNode not registered on editor');
    }
    return [
      registerAutoLink(editor, { changeHandlers: [], excludeParents: [], matchers: MATCHERS }),
      editor.registerNodeTransform(LinkNode, (node) => {
        if ($isNoteLinkNode(node) || !isAbsoluteWebUrl(node.getURL())) {
          return;
        }
        if (
          node.getTarget() === EXTERNAL_LINK_ATTRIBUTES.target
          && node.getRel() === EXTERNAL_LINK_ATTRIBUTES.rel
        ) {
          return;
        }
        node.setTarget(EXTERNAL_LINK_ATTRIBUTES.target).setRel(EXTERNAL_LINK_ATTRIBUTES.rel);
      }),
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
