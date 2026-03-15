import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';

import { BlankTargetLinkInterceptorPlugin } from './BlankTargetLinkInterceptorPlugin';
import { ExternalLinkPlugin } from './ExternalLinkPlugin';
import { NoteLinkPlugin } from './NoteLinkPlugin';

export function LinksPlugin() {
  // NoteIdPlugin still owns plain-text internal note-link paste upgrades.
  return (
    <>
      <NoteLinkPlugin />
      <ExternalLinkPlugin />
      <BlankTargetLinkInterceptorPlugin />
      <ClickableLinkPlugin newTab={false} />
    </>
  );
}
