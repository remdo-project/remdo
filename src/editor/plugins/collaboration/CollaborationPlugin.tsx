import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { LexicalCollaboration, useCollaborationContext } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
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
  const { enabled } = useCollaborationStatus();

  if (!enabled) {
    return <HistoryPlugin />;
  }

  return (
    <LexicalCollaboration>
      <CollaborationSessionPlugin id={DEFAULT_ROOM_ID} />
    </LexicalCollaboration>
  );
}

function CollaborationSessionPlugin({ id }: { id: string }) {
  const { sessionFactory } = useCollaborationStatus();
  const { yjsDocMap } = useCollaborationContext();
  const session = useMemo(
    () => sessionFactory(id, yjsDocMap),
    [id, sessionFactory, yjsDocMap]
  );

  useEffect(() => {
    return () => {
      session.detach();
      session.provider.disconnect();
    };
  }, [session]);

  return (
    <CollaborationPluginV2__EXPERIMENTAL
      id={id}
      doc={session.doc}
      provider={session.provider}
      __shouldBootstrapUnsafe
    />
  );
}
