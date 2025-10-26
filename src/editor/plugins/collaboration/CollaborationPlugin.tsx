import type { ReactNode } from 'react';
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPlugin as LexicalCollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { CollaborationProvider, useCollaborationStatus } from './CollaborationProvider';

const DEFAULT_ROOM_ID = 'main';

export function CollaborationPlugin({ children }: { children?: ReactNode }) {
  return (
    <CollaborationProvider>
      {children}
      <CollaborationRuntimePlugin />
    </CollaborationProvider>
  );
}

function CollaborationRuntimePlugin() {
  const { enabled, providerFactory } = useCollaborationStatus();

  if (!enabled) {
    return <HistoryPlugin />;
  }

  return (
    <LexicalCollaboration>
      <LexicalCollaborationPlugin id={DEFAULT_ROOM_ID} providerFactory={providerFactory} shouldBootstrap />
    </LexicalCollaboration>
  );
}
