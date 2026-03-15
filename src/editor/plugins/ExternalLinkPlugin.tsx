import { AutoLinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LinkMatcher } from '@lexical/link';
import { useEffect } from 'react';

const EXTERNAL_LINK_ATTRIBUTES = {
  rel: 'noopener noreferrer',
  target: '_blank',
} as const;

// Mirror Lexical's playground URL matcher and keep typed URL handling generic.
const URL_REGEX =
  /(?:https?:\/\/(?:www\.)?|www\.)[-\w@:%.+~#=]{1,256}\.[\w()]{1,6}\b[-\w()@:%.+~#?&/=]*(?<![-.+():%])/i;
const LOCAL_URL_REGEX =
  /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?(?:\/[-\w()@:%.+~#?&/=]*)?(?<![-.+():%])/i;

interface MatchResult {
  attributes: typeof EXTERNAL_LINK_ATTRIBUTES;
  index: number;
  length: number;
  text: string;
  url: string;
}

const externalUrlMatcher: LinkMatcher = (text): MatchResult | null => {
  const match = URL_REGEX.exec(text) ?? LOCAL_URL_REGEX.exec(text);
  if (!match) {
    return null;
  }

  const matchedText = match[0];
  const url = matchedText.startsWith('http') ? matchedText : `https://${matchedText}`;

  return {
    attributes: EXTERNAL_LINK_ATTRIBUTES,
    index: match.index,
    length: matchedText.length,
    text: matchedText,
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
