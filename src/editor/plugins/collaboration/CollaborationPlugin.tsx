import type { ReactNode } from 'react';
import { useEffect, useReducer, useRef } from 'react';
import {
  LexicalCollaboration,
  useCollaborationContext as useLexicalCollaborationContext,
} from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import type { Provider } from '@lexical/yjs';
import { CollaborationProvider, useCollaborationStatus } from './CollaborationProvider';
import type { ProviderFactory } from './collaborationRuntime';

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
      <CollaborationRuntimeBridge providerFactory={providerFactory} />
    </LexicalCollaboration>
  );
}

interface CollaborationRuntimeBridgeProps {
  providerFactory: ProviderFactory;
}

function CollaborationRuntimeBridge({ providerFactory }: CollaborationRuntimeBridgeProps) {
  const { yjsDocMap } = useLexicalCollaborationContext();
  const providerRef = useRef<Provider | null>(null);
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    const nextProvider = providerFactory(DEFAULT_ROOM_ID, yjsDocMap);
    providerRef.current = nextProvider;
    forceUpdate();

    return () => {
      providerRef.current = null;
      nextProvider.disconnect();
    };
  }, [providerFactory, yjsDocMap]);

  const provider = providerRef.current;
  const doc = yjsDocMap.get(DEFAULT_ROOM_ID);

  if (provider == null || doc == null) {
    return null;
  }

  return (
    <CollaborationPluginV2__EXPERIMENTAL
      id={DEFAULT_ROOM_ID}
      provider={provider}
      doc={doc}
      __shouldBootstrapUnsafe
    />
  );
}
