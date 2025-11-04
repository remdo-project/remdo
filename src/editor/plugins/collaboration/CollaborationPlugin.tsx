import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import {
  LexicalCollaboration,
  useCollaborationContext as useLexicalCollaborationContext,
} from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { CollaborationProvider, useCollaborationStatus } from './CollaborationProvider';
import type { ProviderFactory } from './collaborationRuntime';

export function CollaborationPlugin({ children }: { children?: ReactNode }) {
  return (
    <CollaborationProvider>
      {children}
      <CollaborationRuntimePlugin />
    </CollaborationProvider>
  );
}

function CollaborationRuntimePlugin() {
  const { enabled, providerFactory, docId } = useCollaborationStatus();

  if (!enabled) {
    return <HistoryPlugin />;
  }

  return (
    <LexicalCollaboration>
      <CollaborationRuntimeBridge providerFactory={providerFactory} docId={docId} />
    </LexicalCollaboration>
  );
}

interface CollaborationRuntimeBridgeProps {
  providerFactory: ProviderFactory;
  docId: string;
}

function CollaborationRuntimeBridge({ providerFactory, docId }: CollaborationRuntimeBridgeProps) {
  const { yjsDocMap } = useLexicalCollaborationContext();
  const provider = useMemo(() => providerFactory(docId, yjsDocMap), [docId, providerFactory, yjsDocMap]);

  useEffect(() => () => provider.destroy(), [provider]);

  const doc = yjsDocMap.get(docId);

  if (provider == null || doc == null) {
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
