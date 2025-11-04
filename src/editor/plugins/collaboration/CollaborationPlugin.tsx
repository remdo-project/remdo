import type { ReactNode } from 'react';
import { useEffect, useReducer } from 'react';
import {
  LexicalCollaboration,
  useCollaborationContext as useLexicalCollaborationContext,
} from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { DEFAULT_DOC_ID } from '#config/spec';
import type { Provider } from '@lexical/yjs';
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
  const { enabled, providerFactory } = useCollaborationStatus();

  if (!enabled) {
    return <HistoryPlugin />;
  }

  return (
    <LexicalCollaboration>
      <CollaborationRuntimeBridge providerFactory={providerFactory} />
    </LexicalCollaboration>
  );
}

interface CollaborationRuntimeBridgeProps {
  providerFactory: ProviderFactory;
}

function CollaborationRuntimeBridge({ providerFactory }: CollaborationRuntimeBridgeProps) {
  const { yjsDocMap } = useLexicalCollaborationContext();
  const [provider, dispatchProvider] = useReducer(
    (_: Provider | null, action: Provider | null) => action,
    null,
  );

  useEffect(() => {
    const nextProvider = providerFactory(DEFAULT_DOC_ID, yjsDocMap);
    dispatchProvider(nextProvider);

    return () => {
      dispatchProvider(null);
      nextProvider.destroy();
    };
  }, [providerFactory, yjsDocMap]);

  const doc = yjsDocMap.get(DEFAULT_DOC_ID);

  if (provider == null || doc == null) {
    return null;
  }

  return (
    <CollaborationPluginV2__EXPERIMENTAL
      id={DEFAULT_DOC_ID}
      provider={provider}
      doc={doc}
      __shouldBootstrapUnsafe
    />
  );
}
