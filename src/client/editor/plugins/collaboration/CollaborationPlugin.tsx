import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  LexicalCollaboration,
  useCollaborationContext as useLexicalCollaborationContext,
} from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { CollaborationProvider, useCollaborationStatus } from './CollaborationProvider';

export function CollaborationPlugin({
  children,
  docId,
}: {
  children?: ReactNode;
  docId: string;
}) {
  return (
    <CollaborationProvider docId={docId}>
      {children}
      <CollaborationRuntimePlugin />
    </CollaborationProvider>
  );
}

function CollaborationRuntimePlugin() {
  const { enabled } = useCollaborationStatus();

  if (!enabled) {
    return <HistoryPlugin />;
  }

  return (
    <LexicalCollaboration>
      <CollaborationRuntimeBridge />
    </LexicalCollaboration>
  );
}

function CollaborationRuntimeBridge() {
  const { session, docId, enabled } = useCollaborationStatus();
  const { yjsDocMap } = useLexicalCollaborationContext();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    session.attach(yjsDocMap);

    return () => {
      session.detach();
    };
  }, [session, yjsDocMap, enabled]);

  const provider = session.getProvider();
  const doc = yjsDocMap.get(docId);

  if (!provider || !doc) {
    return null;
  }

  return (
    <CollaborationPluginV2__EXPERIMENTAL
      id={docId}
      provider={provider}
      doc={doc}
      __shouldBootstrapUnsafe
    />
  );
}
