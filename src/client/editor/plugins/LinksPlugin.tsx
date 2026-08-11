import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';

import { ExternalLinkPlugin } from './ExternalLinkPlugin';
import { LinkControlsPlugin } from './LinkControlsPlugin';
import { NoteLinkPlugin } from './NoteLinkPlugin';

export function LinksPlugin() {
  // NoteIdPlugin still owns plain-text internal note-link paste upgrades.
  return (
    <>
      <NoteLinkPlugin />
      <ExternalLinkPlugin />
      <LinkControlsPlugin />
      <ClickableLinkPlugin newTab={false} />
    </>
  );
}
