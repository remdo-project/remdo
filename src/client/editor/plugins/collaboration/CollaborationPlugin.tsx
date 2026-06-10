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
  sourceOrigin = null,
  sourceId = null,
}: {
  children?: ReactNode;
  docId: string;
  sourceOrigin?: string | null;
  sourceId?: string | null;
}) {
  return (
    <CollaborationProvider docId={docId} sourceOrigin={sourceOrigin} sourceId={sourceId}>
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
