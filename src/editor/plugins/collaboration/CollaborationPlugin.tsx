import type { ReactNode } from 'react';
import { useEffect, useReducer } from 'react';
import {
  LexicalCollaboration,
  useCollaborationContext as useLexicalCollaborationContext,
} from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { CollaborationProvider, useCollaborationStatus } from './CollaborationProvider';
import type { ProviderFactory } from '#lib/collaboration/runtime';

export function CollaborationPlugin({
  children,
  collabOrigin,
}: {
  children?: ReactNode;
  collabOrigin?: string;
}) {
  return (
    <CollaborationProvider collabOrigin={collabOrigin}>
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
  const { providerFactory, docId } = useCollaborationStatus();
  const { yjsDocMap } = useLexicalCollaborationContext();
  const [provider, setProvider] = useReducer(
    (_: ReturnType<ProviderFactory> | null, next: ReturnType<ProviderFactory> | null) => next,
    null,
  );

  useEffect(() => {
    const nextProvider = providerFactory(docId, yjsDocMap);
    setProvider(nextProvider);

    return () => {
      setProvider(null);
      nextProvider.destroy();
    };
  }, [docId, providerFactory, yjsDocMap]);

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
