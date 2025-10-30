import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  LexicalCollaboration,
  useCollaborationContext as useLexicalCollaborationContext,
} from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import type { Provider } from '@lexical/yjs';
import type * as Y from 'yjs';
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
  const [provider, setProvider] = useState<Provider | null>(null);
  const [doc, setDoc] = useState<Y.Doc | null>(null);

  useEffect(() => {
    const nextProvider = providerFactory(DEFAULT_ROOM_ID, yjsDocMap);
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Provider lifecycle is orchestrated by this effect so the async factory only runs when dependencies change.
    setProvider((current) => (current === nextProvider ? current : nextProvider));

    const nextDoc = yjsDocMap.get(DEFAULT_ROOM_ID) ?? null;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Provider lifecycle is orchestrated by this effect so the async factory only runs when dependencies change.
    setDoc((current) => (current === nextDoc ? current : nextDoc));

    return () => {
      nextProvider.disconnect();
    };
  }, [providerFactory, yjsDocMap]);

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
