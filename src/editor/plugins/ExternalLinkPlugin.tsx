import { AutoLinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LinkMatcher } from '@lexical/link';
import LinkifyIt from 'linkify-it';
import { useEffect } from 'react';
import tlds from 'tlds';

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
  return match.schema === 'http:' || match.schema === 'https:' || match.raw.startsWith('www.');
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
    return registerAutoLink(editor, { changeHandlers: [], excludeParents: [], matchers: MATCHERS });
  }, [editor]);

  return null;
}
